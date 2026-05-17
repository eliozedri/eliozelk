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

const AGENT_ID   = "catalog-pricing-agent";
const AGENT_NAME = "מנהל קטלוג";

// Item types that must have a price to be commercially usable.
// labor and misc are excluded: labor rates come from cost_rates table; misc is freeform.
const COMMERCIAL_TYPES = new Set(["product", "material", "service", "equipment"]);

interface DbCatalogItemRow {
  id: string;
  name: string;
  type: string;
  category: string;
  unit_of_measure: string | null;
  default_price: number | null;
  cost_price: number | null;
  is_active: boolean;
  description: string | null;
}

interface DbOrderItemRow {
  id?: string;
  description?: string;
  quantity?: string;
  catalogItemId?: string;
}

interface DbOrderRow {
  id: string;
  order_number: string;
  status: string;
  customer: string;
  data: {
    accessoryRows?: DbOrderItemRow[];
    miscRows?: DbOrderItemRow[];
    // signRows intentionally excluded: SignRow has no catalogItemId field
  };
}

export async function POST(req: NextRequest) {
  const db    = getServiceSupabase();
  const start = Date.now();
  const result = emptyScanResult(AGENT_ID, AGENT_NAME);

  const authHeader = req.headers.get("authorization") ?? "";
  const token  = authHeader.replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await updateAgentRunStatus(db, AGENT_ID, "active");

    // ── Load data ──────────────────────────────────────────────────────────
    const [itemsRes, ordersRes] = await Promise.all([
      db.from("catalog_items")
        .select("id,name,type,category,unit_of_measure,default_price,cost_price,is_active,description"),
      db.from("work_orders")
        .select("id,order_number,status,customer,data")
        .neq("status", "cancelled")
        .neq("status", "completed"),
    ]);

    if (itemsRes.error)  throw new Error(itemsRes.error.message);
    if (ordersRes.error) throw new Error(ordersRes.error.message);

    const allItems   = (itemsRes.data  ?? []) as DbCatalogItemRow[];
    const openOrders = (ordersRes.data ?? []) as DbOrderRow[];

    const activeItems   = allItems.filter(i =>  i.is_active);
    const inactiveItems = allItems.filter(i => !i.is_active);
    const inactiveItemIds = new Set(inactiveItems.map(i => i.id));

    result.entitiesScanned = allItems.length + openOrders.length;

    // ── Pre-pass: which inactive items are referenced in open orders ───────
    // Used by Rules 3 and 4 to avoid noisy exceptions on old unused items.
    const inactiveInOpenOrders = new Set<string>();
    for (const order of openOrders) {
      const rows = [
        ...(order.data?.accessoryRows ?? []),
        ...(order.data?.miscRows      ?? []),
      ];
      for (const row of rows) {
        if (row.catalogItemId && inactiveItemIds.has(row.catalogItemId)) {
          inactiveInOpenOrders.add(row.catalogItemId);
        }
      }
    }

    const dedupeMap     = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const taskDedupeMap = await loadAgentTaskDedupeMap(db, AGENT_ID);
    const activeDedupeKeys = new Set<string>();
    const flaggedItemIds   = new Set<string>(); // tracks items with error/critical hits (for completeness score)

    // ── Rule 1: Price–cost inversion ───────────────────────────────────────
    // Active items only. Condition: both prices are set and positive, sell < cost.
    for (const item of activeItems) {
      if (
        item.default_price != null && item.default_price > 0 &&
        item.cost_price    != null && item.cost_price    > 0 &&
        item.default_price < item.cost_price
      ) {
        const k = dedupeKey("price_cost_inversion", "catalog_item", item.id);
        activeDedupeKeys.add(k);
        flaggedItemIds.add(item.id);

        await upsertException(db, AGENT_ID, {
          category: "price_cost_inversion",
          entityType: "catalog_item",
          entityId: item.id,
          severity: "critical",
          title: `היפוך מחיר–עלות — ${item.name} (מחיר: ₪${item.default_price}, עלות: ₪${item.cost_price})`,
          description: `מחיר המכירה (₪${item.default_price}) נמוך מעלות (₪${item.cost_price}). כל מכירה במחיר זה גורמת להפסד ודאי.`,
          detectedFromData: {
            itemName: item.name,
            defaultPrice: item.default_price,
            costPrice: item.cost_price,
            category: item.category,
            type: item.type,
          },
          recommendedResolution: `בדוק ותקן תמחור — מחיר המכירה חייב להיות גבוה מעלות (₪${item.cost_price})`,
        }, dedupeMap, result);

        await upsertTask(db, AGENT_ID, {
          category: "price_cost_inversion",
          entityType: "catalog_item",
          entityId: item.id,
          title: `תקן תמחור — ${item.name}`,
          description: `מחיר מכירה ₪${item.default_price} נמוך מעלות ₪${item.cost_price}. הפסד ודאי על כל מכירה.`,
          priority: "critical",
          recommendedAction: `עדכן מחיר מכירה לסכום גבוה מ-₪${item.cost_price}`,
          requiresApproval: true,
        }, taskDedupeMap, result);
      }
    }

    // ── Rule 2: Exact duplicate name ───────────────────────────────────────
    // Active items only. Entity ID is the normalized name (not an item UUID).
    const nameGroups = new Map<string, DbCatalogItemRow[]>();
    for (const item of activeItems) {
      const key = item.name.trim().toLowerCase();
      if (!key) continue;
      const group = nameGroups.get(key) ?? [];
      group.push(item);
      nameGroups.set(key, group);
    }

    for (const [normalizedName, group] of nameGroups) {
      if (group.length < 2) continue;

      const entityId    = normalizedName;
      const k           = dedupeKey("exact_duplicate_name", "catalog_item", entityId);
      activeDedupeKeys.add(k);
      for (const item of group) flaggedItemIds.add(item.id);

      const displayName = group[0].name.trim();
      const itemIds     = group.map(i => i.id);

      await upsertException(db, AGENT_ID, {
        category: "exact_duplicate_name",
        entityType: "catalog_item",
        entityId,
        severity: "error",
        title: `כפילות מדויקת בשם — "${displayName}" (${group.length} פריטים)`,
        description: `${group.length} פריטים פעילים עם שם זהה. עלול לגרום לבלבול במלאי ובהזמנות.`,
        detectedFromData: {
          normalizedName,
          duplicateCount: group.length,
          itemIds,
          itemNames: group.map(i => i.name),
        },
        recommendedResolution: `סקור ${group.length} הפריטים וזהה פריט אב — בטל או מזג את הכפילויות`,
      }, dedupeMap, result);

      await upsertTask(db, AGENT_ID, {
        category: "exact_duplicate_name",
        entityType: "catalog_item",
        entityId,
        title: `סקור כפילות — "${displayName}"`,
        description: `${group.length} פריטים פעילים עם שם זהה | מזהים: ${itemIds.join(", ")}`,
        priority: "high",
        recommendedAction: "זהה פריט אב ובטל / מזג את הכפילויות",
        requiresApproval: true,
      }, taskDedupeMap, result);
    }

    // ── Rule 3: Missing price on commercial items ──────────────────────────
    // Scope: active commercial items, PLUS inactive commercial items that
    // appear in an open order (to surface pricing gaps that currently affect live orders).
    const itemsForPriceCheck = [
      ...activeItems.filter(i => COMMERCIAL_TYPES.has(i.type)),
      ...inactiveItems.filter(i =>
        COMMERCIAL_TYPES.has(i.type) && inactiveInOpenOrders.has(i.id)
      ),
    ];

    for (const item of itemsForPriceCheck) {
      if (item.default_price != null) continue;

      const k = dedupeKey("missing_price", "catalog_item", item.id);
      activeDedupeKeys.add(k);
      flaggedItemIds.add(item.id);

      const inactiveNote = !item.is_active
        ? " הפריט מסומן כלא פעיל אך מופיע בהזמנה פתוחה."
        : "";

      await upsertException(db, AGENT_ID, {
        category: "missing_price",
        entityType: "catalog_item",
        entityId: item.id,
        severity: "error",
        title: `מחיר חסר — ${item.name} (${item.type}, ${item.category})`,
        description: `פריט מסחרי ללא מחיר. לא ניתן לתמחר הזמנות הכוללות פריט זה.${inactiveNote}`,
        detectedFromData: {
          itemName: item.name,
          type: item.type,
          category: item.category,
          isActive: item.is_active,
        },
        recommendedResolution: "הגדר מחיר ברירת מחדל לפריט בקטלוג",
      }, dedupeMap, result);

      await upsertTask(db, AGENT_ID, {
        category: "missing_price",
        entityType: "catalog_item",
        entityId: item.id,
        title: `הגדר מחיר — ${item.name}`,
        description: `סוג: ${item.type} | קטגוריה: ${item.category} | חסר מחיר מכירה${inactiveNote}`,
        priority: "high",
        recommendedAction: "פתח קטלוג ועדכן שדה מחיר ברירת מחדל",
        requiresApproval: true,
      }, taskDedupeMap, result);
    }

    // ── Rule 4: Missing unit of measure ────────────────────────────────────
    // Scope: active items, PLUS inactive items that appear in an open order.
    // Avoids noise from old deactivated items that no longer affect operations.
    const itemsForUnitCheck = [
      ...activeItems,
      ...inactiveItems.filter(i => inactiveInOpenOrders.has(i.id)),
    ];

    for (const item of itemsForUnitCheck) {
      if (item.unit_of_measure?.trim()) continue;

      const k = dedupeKey("missing_unit_catalog", "catalog_item", item.id);
      activeDedupeKeys.add(k);
      flaggedItemIds.add(item.id);

      const inactiveNote = !item.is_active
        ? " הפריט מסומן כלא פעיל אך מופיע בהזמנה פתוחה."
        : "";

      await upsertException(db, AGENT_ID, {
        category: "missing_unit_catalog",
        entityType: "catalog_item",
        entityId: item.id,
        severity: "error",
        title: `יחידת מידה חסרה — ${item.name}`,
        description: `סוג: ${item.type} | קטגוריה: ${item.category} | ללא יחידת מידה לא ניתן לנהל מלאי ולבצע הזמנות.${inactiveNote}`,
        detectedFromData: {
          itemName: item.name,
          type: item.type,
          category: item.category,
          isActive: item.is_active,
        },
        recommendedResolution: "עדכן יחידת מידה בקטלוג (לדוגמה: יחידה, מטר, ליטר, יום)",
      }, dedupeMap, result);

      await upsertTask(db, AGENT_ID, {
        category: "missing_unit_catalog",
        entityType: "catalog_item",
        entityId: item.id,
        title: `הגדר יחידת מידה — ${item.name}`,
        description: `סוג: ${item.type} | קטגוריה: ${item.category}${inactiveNote}`,
        priority: "normal",
        recommendedAction: "פתח קטלוג ועדכן שדה יחידת מידה",
        requiresApproval: true,
      }, taskDedupeMap, result);
    }

    // ── Rule 5: Inactive item referenced in open order ─────────────────────
    // Scans accessoryRows and miscRows only. signRows are excluded because the
    // SignRow type has no catalogItemId field — relationships cannot be safely inferred.
    if (inactiveItemIds.size > 0) {
      for (const order of openOrders) {
        const rows = [
          ...(order.data?.accessoryRows ?? []),
          ...(order.data?.miscRows      ?? []),
        ];
        const seenInThisOrder = new Set<string>();

        for (const row of rows) {
          if (!row.catalogItemId)                           continue;
          if (!inactiveItemIds.has(row.catalogItemId))      continue;
          if (seenInThisOrder.has(row.catalogItemId))       continue; // one exception per (item × order)
          seenInThisOrder.add(row.catalogItemId);

          const inactive = allItems.find(i => i.id === row.catalogItemId);
          const itemName = inactive?.name ?? row.catalogItemId;
          const entityId = `${row.catalogItemId}:${order.id}`;
          const k        = dedupeKey("inactive_in_open_order", "work_order", entityId);
          activeDedupeKeys.add(k);

          await upsertException(db, AGENT_ID, {
            category: "inactive_in_open_order",
            entityType: "work_order",
            entityId,
            severity: "error",
            title: `פריט לא פעיל בהזמנה פתוחה — ${itemName} בהזמנה ${order.order_number}`,
            description: `פריט "${itemName}" סומן כלא פעיל אך מופיע בהזמנה ${order.order_number} (לקוח: ${order.customer}) שטרם הושלמה.`,
            detectedFromData: {
              itemId: row.catalogItemId,
              itemName,
              orderId: order.id,
              orderNumber: order.order_number,
              customer: order.customer,
            },
            recommendedResolution: `בדוק הזמנה ${order.order_number} — החלף פריט לא פעיל בחלופה פעילה, או הפעל מחדש את הפריט אם מדובר בשגיאה`,
          }, dedupeMap, result);

          await upsertTask(db, AGENT_ID, {
            category: "inactive_in_open_order",
            entityType: "work_order",
            entityId,
            title: `פריט לא פעיל — הזמנה ${order.order_number}`,
            description: `פריט "${itemName}" לא פעיל אך מופיע בהזמנה פתוחה ${order.order_number} (לקוח: ${order.customer})`,
            priority: "high",
            recommendedAction: "פתח הזמנה והחלף פריט לא פעיל בחלופה פעילה",
            requiresApproval: false,
          }, taskDedupeMap, result);
        }
      }
    }

    // ── Catalog completeness score ─────────────────────────────────────────
    // Weighted average across 5 dimensions (active items only):
    //   price populated (30), unit populated (25), cost price on items in use (20),
    //   description non-empty (10), items with no error/critical from this scan (15).
    const total = activeItems.length;
    let completenessScore = 0;

    if (total > 0) {
      const withPrice       = activeItems.filter(i => i.default_price != null).length;
      const withUnit        = activeItems.filter(i => i.unit_of_measure?.trim()).length;
      const withDescription = activeItems.filter(i => i.description?.trim()).length;

      // Cost coverage: measure only items actually referenced in open orders
      const activeItemsInOpenOrders = new Set<string>();
      for (const order of openOrders) {
        for (const row of [
          ...(order.data?.accessoryRows ?? []),
          ...(order.data?.miscRows      ?? []),
        ]) {
          if (row.catalogItemId) activeItemsInOpenOrders.add(row.catalogItemId);
        }
      }
      const activeUsed = activeItems.filter(i => activeItemsInOpenOrders.has(i.id));
      const costCoverage = activeUsed.length > 0
        ? activeUsed.filter(i => i.cost_price != null).length / activeUsed.length
        : 1; // no items in open orders → cost price is not blocking anything

      const withNoErrors = Math.max(0, total - flaggedItemIds.size);

      completenessScore = Math.round(
        (withPrice       / total) * 30 +
        (withUnit        / total) * 25 +
        costCoverage              * 20 +
        (withDescription / total) * 10 +
        (withNoErrors    / total) * 15,
      );
    }

    // ── Auto-resolve stale exceptions ──────────────────────────────────────
    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    // ── Write activity feed summary ────────────────────────────────────────
    const summary = `סריקת קטלוג: ${result.entitiesScanned} רשומות | ${result.exceptionsCreated} חריגות חדשות | ${result.tasksCreated} משימות | ${result.exceptionsResolved} נפתרו | ציון שלמות: ${completenessScore}/100`;
    await writeAgentActivity(db, AGENT_ID, "detection", summary, {
      entitiesScanned:    result.entitiesScanned,
      exceptionsCreated:  result.exceptionsCreated,
      tasksCreated:       result.tasksCreated,
      exceptionsResolved: result.exceptionsResolved,
      completenessScore,
      activeItems:        activeItems.length,
      openOrders:         openOrders.length,
    });

    result.durationMs = Date.now() - start;
    await updateAgentRunStatus(db, AGENT_ID, "idle");
    await logAgentAction(db, AGENT_ID, "scan", result as unknown as Record<string, unknown>, "success");

    return NextResponse.json({ ...result, completenessScore });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    result.durationMs = Date.now() - start;
    await updateAgentRunStatus(db, AGENT_ID, "error").catch(() => {});
    await logAgentAction(db, AGENT_ID, "scan", {}, "error", msg).catch(() => {});
    return NextResponse.json(result, { status: 500 });
  }
}
