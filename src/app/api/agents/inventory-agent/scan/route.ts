import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  loadAgentExceptionDedupeMap,
  loadAgentTaskDedupeMap,
  upsertException,
  upsertTask,
  autoResolveStaleExceptions,
  writeAgentActivity,
  updateAgentRunStatus,
  logAgentAction,
  verifyMasterAuth,
  dedupeKey,
} from "@/lib/agents/scan-utils";
import { emptyScanResult } from "@/lib/agents/types";
import { syncReservations } from "@/lib/inventory/syncReservations";

const AGENT_ID   = "inventory-agent";
const AGENT_NAME = "מנהל מחסן";

interface DbCatalogItem {
  id: string;
  name: string;
  type: string;
  category: string;
  unit_of_measure: string;
  current_quantity: number;
  minimum_quantity: number;
  reserved_quantity: number;
  supplier_id: string | null;
  is_active: boolean;
}

interface DbOrderRow {
  id: string;
  order_number: string;
  status: string;
  customer: string;
  data: {
    accessoryRows?: Array<{
      description?: string;
      quantity?: string;
      catalogItemId?: string;
    }>;
    miscRows?: Array<{
      description?: string;
      quantity?: string;
      catalogItemId?: string;
    }>;
  };
}

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const start = Date.now();
  const result = emptyScanResult(AGENT_ID, AGENT_NAME);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await updateAgentRunStatus(db, AGENT_ID, "active");

    // ── Sync reservations from active orders before scanning ───────────────
    await syncReservations(db);

    // ── Load data ──────────────────────────────────────────────────────────
    const [itemsRes, ordersRes] = await Promise.all([
      db.from("catalog_items")
        .select("id,name,type,category,unit_of_measure,current_quantity,minimum_quantity,reserved_quantity,supplier_id,is_active")
        .eq("is_active", true),
      db.from("work_orders")
        .select("id,order_number,status,customer,data")
        .not("status", "in", '("completed","cancelled")'),
    ]);

    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (ordersRes.error) throw new Error(ordersRes.error.message);

    const items  = (itemsRes.data ?? []) as DbCatalogItem[];
    const orders = (ordersRes.data ?? []) as DbOrderRow[];
    result.entitiesScanned = items.length + orders.length;

    const catalogItemIds = new Set(items.map(i => i.id));

    const dedupeMap     = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const taskDedupeMap = await loadAgentTaskDedupeMap(db, AGENT_ID);
    const activeDedupeKeys = new Set<string>();

    // ── 1. Negative stock ─────────────────────────────────────────────────
    for (const item of items) {
      if (item.current_quantity < 0) {
        const k = dedupeKey("negative_stock", "catalog_item", item.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "negative_stock",
          entityType: "catalog_item",
          entityId: item.id,
          severity: "critical",
          title: `מלאי שלילי — ${item.name} (${item.current_quantity} ${item.unit_of_measure})`,
          description: `קטגוריה: ${item.category} | כמות נוכחית: ${item.current_quantity}`,
          detectedFromData: { itemName: item.name, currentQuantity: item.current_quantity, unit: item.unit_of_measure },
          recommendedResolution: "בדוק תנועות מלאי לפריט זה ותקן על ידי קבלת סחורה או תיקון ידני מבוקר",
        }, dedupeMap, result);

        await upsertTask(db, AGENT_ID, {
          category: "negative_stock",
          entityType: "catalog_item",
          entityId: item.id,
          title: `תקן מלאי שלילי — ${item.name}`,
          description: `כמות נוכחית: ${item.current_quantity} ${item.unit_of_measure}`,
          priority: "critical",
          recommendedAction: "בדוק תנועות מלאי ורשום קבלת סחורה או תיקון ידני",
          requiresApproval: true,
        }, taskDedupeMap, result);
      }
    }

    // ── 2. Out of stock (zero but minimum is set) ─────────────────────────
    for (const item of items) {
      if (item.current_quantity === 0 && item.minimum_quantity > 0) {
        const k = dedupeKey("out_of_stock", "catalog_item", item.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "out_of_stock",
          entityType: "catalog_item",
          entityId: item.id,
          severity: "error",
          title: `חסר במחסן — ${item.name}`,
          description: `סף מינימום: ${item.minimum_quantity} ${item.unit_of_measure} | כמות נוכחית: 0`,
          detectedFromData: { itemName: item.name, currentQuantity: 0, minimumQuantity: item.minimum_quantity, unit: item.unit_of_measure },
          recommendedResolution: `הזמן מיידית ${item.minimum_quantity} ${item.unit_of_measure} של ${item.name}`,
        }, dedupeMap, result);

        await upsertTask(db, AGENT_ID, {
          category: "out_of_stock",
          entityType: "catalog_item",
          entityId: item.id,
          title: `המלצת רכש דחופה — ${item.name}`,
          description: `מלאי אפס | מינימום נדרש: ${item.minimum_quantity} ${item.unit_of_measure}${item.supplier_id ? " | ספק משויך" : " | אין ספק משויך"}`,
          priority: "critical",
          recommendedAction: `הכן הזמנת רכש ל-${item.minimum_quantity} ${item.unit_of_measure} מהספק`,
          requiresApproval: true,
        }, taskDedupeMap, result);
      }
    }

    // ── 3. Low stock (0 < current < minimum) ─────────────────────────────
    for (const item of items) {
      if (item.minimum_quantity > 0 && item.current_quantity > 0 && item.current_quantity < item.minimum_quantity) {
        const k = dedupeKey("low_stock", "catalog_item", item.id);
        activeDedupeKeys.add(k);
        const shortage = item.minimum_quantity - item.current_quantity;
        await upsertException(db, AGENT_ID, {
          category: "low_stock",
          entityType: "catalog_item",
          entityId: item.id,
          severity: "warn",
          title: `מלאי נמוך — ${item.name} (${item.current_quantity}/${item.minimum_quantity} ${item.unit_of_measure})`,
          description: `קצר: ${shortage} ${item.unit_of_measure} מתחת לסף המינימום`,
          detectedFromData: { itemName: item.name, currentQuantity: item.current_quantity, minimumQuantity: item.minimum_quantity, shortage, unit: item.unit_of_measure },
          recommendedResolution: `מלא מלאי — הזמן לפחות ${shortage} ${item.unit_of_measure} של ${item.name}`,
        }, dedupeMap, result);

        await upsertTask(db, AGENT_ID, {
          category: "low_stock",
          entityType: "catalog_item",
          entityId: item.id,
          title: `המלצת רכש — ${item.name}`,
          description: `מלאי: ${item.current_quantity} | מינימום: ${item.minimum_quantity} | קצר: ${shortage} ${item.unit_of_measure}`,
          priority: "high",
          recommendedAction: `הכן הצעת רכש ל-${shortage} ${item.unit_of_measure}`,
          requiresApproval: true,
        }, taskDedupeMap, result);
      }
    }

    // ── 4. Over-reserved (reserved > current) ────────────────────────────
    for (const item of items) {
      if (item.reserved_quantity > 0 && item.reserved_quantity > item.current_quantity) {
        const k = dedupeKey("over_reserved", "catalog_item", item.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "over_reserved",
          entityType: "catalog_item",
          entityId: item.id,
          severity: "warn",
          title: `שריון עולה על מלאי — ${item.name}`,
          description: `שמור: ${item.reserved_quantity} | נוכחי: ${item.current_quantity} | הפרש: ${item.reserved_quantity - item.current_quantity} ${item.unit_of_measure}`,
          detectedFromData: { itemName: item.name, currentQuantity: item.current_quantity, reservedQuantity: item.reserved_quantity, unit: item.unit_of_measure },
          recommendedResolution: "בדוק את ההזמנות הפעילות ועדכן שריון או מלא מלאי",
        }, dedupeMap, result);
      }
    }

    // ── 5. Missing unit of measure ────────────────────────────────────────
    for (const item of items) {
      if (!item.unit_of_measure?.trim()) {
        const k = dedupeKey("missing_unit", "catalog_item", item.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "missing_unit",
          entityType: "catalog_item",
          entityId: item.id,
          severity: "warn",
          title: `חסרה יחידת מידה — ${item.name}`,
          description: `קטגוריה: ${item.category} | סוג: ${item.type}`,
          detectedFromData: { itemName: item.name, category: item.category },
          recommendedResolution: "עדכן יחידת מידה בקטלוג",
        }, dedupeMap, result);

        await upsertTask(db, AGENT_ID, {
          category: "missing_unit",
          entityType: "catalog_item",
          entityId: item.id,
          title: `הוסף יחידת מידה — ${item.name}`,
          description: `פריט ללא יחידת מידה — לא ניתן לנהל מלאי`,
          priority: "normal",
          recommendedAction: "פתח קטלוג ועדכן יחידת מידה",
        }, taskDedupeMap, result);
      }
    }

    // ── 6. Order items not mapped to catalog ──────────────────────────────
    const unmappedSeen = new Set<string>(); // dedupe within this scan

    for (const order of orders) {
      const allRows = [
        ...(order.data?.accessoryRows ?? []),
        ...(order.data?.miscRows ?? []),
      ];

      for (const row of allRows) {
        const desc = row.description?.trim();
        if (!desc) continue;
        if (row.catalogItemId && catalogItemIds.has(row.catalogItemId)) continue;

        // Unmapped item — description present but no valid catalog link
        const entityId = `${order.id}:${desc}`;
        if (unmappedSeen.has(entityId)) continue;
        unmappedSeen.add(entityId);

        const k = dedupeKey("unmapped_order_item", "work_order", entityId);
        activeDedupeKeys.add(k);

        await upsertTask(db, AGENT_ID, {
          category: "unmapped_order_item",
          entityType: "work_order",
          entityId,
          title: `מיפוי פריט נדרש — "${desc}"`,
          description: `הזמנה: ${order.order_number} | לקוח: ${order.customer} | פריט לא מקושר לקטלוג`,
          priority: "normal",
          recommendedAction: "קשר פריט זה לפריט קטלוג קיים, או הוסף פריט חדש לקטלוג",
        }, taskDedupeMap, result);
      }
    }

    // ── Auto-resolve stale exceptions ──────────────────────────────────────
    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    const summary = `סריקת מלאי: ${result.entitiesScanned} רשומות | ${result.exceptionsCreated} חריגות | ${result.tasksCreated} משימות | ${result.exceptionsResolved} נפתרו`;
    await writeAgentActivity(db, AGENT_ID, "detection", summary, {
      entitiesScanned: result.entitiesScanned,
      exceptionsCreated: result.exceptionsCreated,
      tasksCreated: result.tasksCreated,
      exceptionsResolved: result.exceptionsResolved,
    });

    result.durationMs = Date.now() - start;
    await updateAgentRunStatus(db, AGENT_ID, "idle");
    await logAgentAction(db, AGENT_ID, "scan", result as unknown as Record<string, unknown>, "success");
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    result.durationMs = Date.now() - start;
    await updateAgentRunStatus(db, AGENT_ID, "error").catch(() => {});
    await logAgentAction(db, AGENT_ID, "scan", {}, "error", msg).catch(() => {});
    return NextResponse.json(result, { status: 500 });
  }
}
