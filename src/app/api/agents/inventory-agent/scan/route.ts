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
import { syncAllReservations } from "@/lib/inventory/syncReservations";

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
      id?: string;
      description?: string;
      quantity?: string;
      catalogItemId?: string;
    }>;
    miscRows?: Array<{
      id?: string;
      description?: string;
      quantity?: string;
      catalogItemId?: string;
    }>;
  };
}

interface DbReservationRow {
  id: string;
  item_id: string;
  order_id: string;
  order_item_key: string;
  quantity: number;
  status: string;
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

    // ── Sync reservation ledger before scanning ────────────────────────────
    await syncAllReservations(db);

    // ── Load data ──────────────────────────────────────────────────────────
    const [itemsRes, ordersRes, reservationsRes] = await Promise.all([
      db.from("catalog_items")
        .select("id,name,type,category,unit_of_measure,current_quantity,minimum_quantity,reserved_quantity,supplier_id,is_active")
        .eq("is_active", true),
      db.from("work_orders")
        .select("id,order_number,status,customer,data")
        .not("status", "in", '("completed","cancelled")'),
      db.from("inventory_reservations")
        .select("id,item_id,order_id,order_item_key,quantity,status"),
    ]);

    if (itemsRes.error)        throw new Error(itemsRes.error.message);
    if (ordersRes.error)       throw new Error(ordersRes.error.message);
    if (reservationsRes.error) throw new Error(reservationsRes.error.message);

    const items        = (itemsRes.data        ?? []) as DbCatalogItem[];
    const orders       = (ordersRes.data        ?? []) as DbOrderRow[];
    const reservations = (reservationsRes.data  ?? []) as DbReservationRow[];
    result.entitiesScanned = items.length + orders.length + reservations.length;

    const catalogItemIds = new Set(items.map(i => i.id));
    const activeOrderIds  = new Set(orders.map(o => o.id));

    // Reservation lookup helpers
    const activeReservations = reservations.filter(r => r.status === "active");
    const activeResMap = new Map<string, DbReservationRow>(); // `orderId:orderItemKey` → row
    for (const r of activeReservations) {
      activeResMap.set(`${r.order_id}:${r.order_item_key}`, r);
    }

    // Computed reserved_quantity from active reservation rows
    const computedReserved = new Map<string, number>();
    for (const r of activeReservations) {
      computedReserved.set(r.item_id, (computedReserved.get(r.item_id) ?? 0) + r.quantity);
    }

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
    const unmappedSeen = new Set<string>();

    for (const order of orders) {
      const allRows = [
        ...(order.data?.accessoryRows ?? []),
        ...(order.data?.miscRows ?? []),
      ];

      for (const row of allRows) {
        const desc = row.description?.trim();
        if (!desc) continue;
        if (row.catalogItemId && catalogItemIds.has(row.catalogItemId)) continue;

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

    // ── 7. Missing reservation — active order item has no active reservation
    for (const order of orders) {
      const allRows = [
        ...(order.data?.accessoryRows ?? []),
        ...(order.data?.miscRows ?? []),
      ];
      for (const row of allRows) {
        if (!row.catalogItemId || !row.id) continue;
        if (!catalogItemIds.has(row.catalogItemId)) continue;
        const qty = parseFloat(row.quantity ?? "0") || 0;
        if (qty <= 0) continue;

        const resKey = `${order.id}:${row.id}`;
        if (!activeResMap.has(resKey)) {
          const entityId = resKey;
          const k = dedupeKey("missing_reservation", "work_order", entityId);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "missing_reservation",
            entityType: "work_order",
            entityId,
            severity: "warn",
            title: `שריון חסר — "${row.description ?? row.catalogItemId}" בהזמנה ${order.order_number}`,
            description: `הזמנה ${order.order_number} | כמות: ${qty} | פריט מקושר לקטלוג אך ללא שריון פעיל`,
            detectedFromData: { orderId: order.id, orderNumber: order.order_number, rowId: row.id, itemId: row.catalogItemId, qty },
            recommendedResolution: "הפעל סנכרון שריונות כדי ליצור את השריון החסר",
          }, dedupeMap, result);
        }
      }
    }

    // ── 8. Stale reservation — active reservation for inactive/cancelled order
    for (const res of activeReservations) {
      if (!activeOrderIds.has(res.order_id)) {
        const k = dedupeKey("stale_reservation", "inventory_reservations", res.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "stale_reservation",
          entityType: "inventory_reservations",
          entityId: res.id,
          severity: "warn",
          title: `שריון עתיק — הזמנה ${res.order_id} לא פעילה`,
          description: `שריון פעיל לפריט ${res.item_id} | כמות: ${res.quantity} | ההזמנה הושלמה/בוטלה`,
          detectedFromData: { reservationId: res.id, itemId: res.item_id, orderId: res.order_id, quantity: res.quantity },
          recommendedResolution: "הפעל סנכרון שריונות כדי לשחרר שריון זה",
        }, dedupeMap, result);
      }

      // Stale — reservation for item no longer in catalog
      if (!catalogItemIds.has(res.item_id)) {
        const k = dedupeKey("stale_reservation", "inventory_reservations", `${res.id}:missing_item`);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "stale_reservation",
          entityType: "inventory_reservations",
          entityId: res.id,
          severity: "error",
          title: `שריון לפריט חסר — ${res.item_id}`,
          description: `שריון פעיל עבור פריט שאינו קיים עוד בקטלוג | הזמנה: ${res.order_id}`,
          detectedFromData: { reservationId: res.id, itemId: res.item_id, orderId: res.order_id },
          recommendedResolution: "בדוק ידנית ושחרר את השריון",
        }, dedupeMap, result);
      }
    }

    // ── 9. Duplicate active reservations for same item/order/key
    const dupeSeen = new Map<string, string>(); // composite key → first reservation id
    for (const res of activeReservations) {
      const dupeKey = `${res.item_id}:${res.order_id}:${res.order_item_key}`;
      if (dupeSeen.has(dupeKey)) {
        const k = dedupeKey("duplicate_reservation", "inventory_reservations", dupeKey);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "duplicate_reservation",
          entityType: "inventory_reservations",
          entityId: dupeKey,
          severity: "error",
          title: `שריון כפול — פריט ${res.item_id} בהזמנה ${res.order_id}`,
          description: `שריונות פעילים כפולים עבור אותו מפתח | מניעת ייצוגיות כפולה`,
          detectedFromData: { itemId: res.item_id, orderId: res.order_id, orderItemKey: res.order_item_key, firstId: dupeSeen.get(dupeKey), duplicateId: res.id },
          recommendedResolution: "הפעל סנכרון שריונות לתיקון",
        }, dedupeMap, result);
      } else {
        dupeSeen.set(dupeKey, res.id);
      }
    }

    // ── 10. reserved_quantity cache mismatch vs SUM(active reservations)
    for (const item of items) {
      const computed = computedReserved.get(item.id) ?? 0;
      if (Math.abs(computed - item.reserved_quantity) > 0.0001) {
        const k = dedupeKey("reserved_cache_mismatch", "catalog_item", item.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "reserved_cache_mismatch",
          entityType: "catalog_item",
          entityId: item.id,
          severity: "warn",
          title: `פער במטמון שריונות — ${item.name}`,
          description: `reserved_quantity: ${item.reserved_quantity} | SUM(active reservations): ${computed} | פער: ${computed - item.reserved_quantity}`,
          detectedFromData: { itemName: item.name, cachedReserved: item.reserved_quantity, computedReserved: computed },
          recommendedResolution: "הפעל סנכרון שריונות לתיקון המטמון",
        }, dedupeMap, result);
      }
    }

    // ── 11. Active reservation with invalid quantity (should not occur with CHECK constraint)
    for (const res of activeReservations) {
      if (res.quantity <= 0) {
        const k = dedupeKey("invalid_reservation_quantity", "inventory_reservations", res.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "invalid_reservation_quantity",
          entityType: "inventory_reservations",
          entityId: res.id,
          severity: "error",
          title: `כמות שריון לא תקינה — ${res.quantity}`,
          description: `שריון פעיל עם כמות ${res.quantity} | פריט: ${res.item_id} | הזמנה: ${res.order_id}`,
          detectedFromData: { reservationId: res.id, itemId: res.item_id, orderId: res.order_id, quantity: res.quantity },
          recommendedResolution: "בדוק ושחרר שריון זה ידנית",
        }, dedupeMap, result);
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
