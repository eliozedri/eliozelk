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
  warehouse_required?: boolean;
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

interface DbConsumptionRow {
  id: string;
  item_id: string;
  order_id: string;
  work_diary_id: string | null;
  order_item_key: string | null;
  quantity: number;
  status: string;
}

interface DbDiaryRow {
  id: string;
  order_id: string | null;
  status: string;
  approval_status: string;
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
    const [itemsRes, ordersRes, reservationsRes, consumptionsRes, diariesRes] = await Promise.all([
      db.from("catalog_items")
        .select("id,name,type,category,unit_of_measure,current_quantity,minimum_quantity,reserved_quantity,supplier_id,is_active")
        .eq("is_active", true),
      db.from("work_orders")
        .select("id,order_number,status,customer,data,warehouse_required")
        .not("status", "in", '("cancelled")'),
      db.from("inventory_reservations")
        .select("id,item_id,order_id,order_item_key,quantity,status"),
      db.from("inventory_consumptions")
        .select("id,item_id,order_id,work_diary_id,order_item_key,quantity,status"),
      db.from("work_diaries")
        .select("id,order_id,status,approval_status")
        .not("status", "in", '("cancelled")'),
    ]);

    if (itemsRes.error)        throw new Error(itemsRes.error.message);
    if (ordersRes.error)       throw new Error(ordersRes.error.message);
    if (reservationsRes.error) throw new Error(reservationsRes.error.message);
    if (consumptionsRes.error) result.errors.push(`load consumptions: ${consumptionsRes.error.message}`);
    if (diariesRes.error)      result.errors.push(`load diaries: ${diariesRes.error.message}`);

    const items        = (itemsRes.data        ?? []) as DbCatalogItem[];
    const allOrders    = (ordersRes.data        ?? []) as DbOrderRow[];
    const orders       = allOrders.filter(o => o.status !== "completed");
    const reservations = (reservationsRes.data  ?? []) as DbReservationRow[];
    const consumptions = (consumptionsRes.data  ?? []) as DbConsumptionRow[];
    const diaries      = (diariesRes.data       ?? []) as DbDiaryRow[];
    result.entitiesScanned = items.length + allOrders.length + reservations.length + consumptions.length;

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

    // ── Consumption lookup helpers ─────────────────────────────────────────
    const activeConsumptions = consumptions.filter(c => c.status === "consumed" || c.status === "pending_review");
    const consumedOrderItems = new Map<string, DbConsumptionRow>(); // `orderId:orderItemKey` → row
    const consumedByDiary = new Map<string, DbConsumptionRow[]>(); // diaryId → rows
    for (const c of activeConsumptions) {
      if (c.order_item_key) consumedOrderItems.set(`${c.order_id}:${c.order_item_key}`, c);
      if (c.work_diary_id) {
        const arr = consumedByDiary.get(c.work_diary_id) ?? [];
        arr.push(c);
        consumedByDiary.set(c.work_diary_id, arr);
      }
    }
    const approvedDiaries = diaries.filter(d => d.status === "submitted" && d.approval_status === "approved");
    const approvedDiaryOrderIds = new Set<string>(approvedDiaries.map(d => d.order_id).filter(Boolean) as string[]);

    // Compute reserved quantity from active reservations (for check 17)
    const reservedByOrderItem = new Map<string, number>();
    for (const r of reservations.filter(r => r.status === "active")) {
      reservedByOrderItem.set(`${r.order_id}:${r.order_item_key}`, r.quantity);
    }

    // ── 12. Approved diary with mapped items but no consumption record ───────
    for (const diary of approvedDiaries) {
      if (!diary.order_id) continue;
      const order = allOrders.find(o => o.id === diary.order_id);
      if (!order) continue;
      const allRows = [...(order.data?.accessoryRows ?? []), ...(order.data?.miscRows ?? [])];
      const mappedRows = allRows.filter(r => r.id && r.catalogItemId && catalogItemIds.has(r.catalogItemId) && (parseFloat(r.quantity ?? "0") || 0) > 0);
      if (mappedRows.length === 0) continue;

      const hasMissingConsumption = mappedRows.some(r => !consumedOrderItems.has(`${order.id}:${r.id}`));
      if (hasMissingConsumption) {
        const k = dedupeKey("missing_consumption", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "missing_consumption",
          entityType: "work_order",
          entityId: order.id,
          severity: "warn",
          title: `יומן אושר ללא התאמת מלאי — הזמנה ${order.order_number}`,
          description: `יומן ${diary.id} אושר אך חסרות רשומות צריכה עבור פריטי קטלוג מקושרים`,
          detectedFromData: { orderId: order.id, diaryId: diary.id, mappedItems: mappedRows.length },
          recommendedResolution: "הפעל התאמת מלאי עבור יומן זה",
        }, dedupeMap, result);
      }
    }

    // ── 13. Consumption exists for unapproved/draft diary ───────────────────
    for (const c of activeConsumptions) {
      if (!c.work_diary_id) continue;
      const diary = diaries.find(d => d.id === c.work_diary_id);
      if (!diary) continue;
      const isDiaryApproved = diary.status === "submitted" && diary.approval_status === "approved";
      if (!isDiaryApproved) {
        const k = dedupeKey("consumption_unapproved_diary", "inventory_consumptions", c.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "consumption_unapproved_diary",
          entityType: "inventory_consumptions",
          entityId: c.id,
          severity: "error",
          title: `צריכה עבור יומן לא מאושר — פריט ${c.item_id}`,
          description: `רשומת צריכה ${c.id} מקושרת ליומן ${c.work_diary_id} שאינו מאושר (status=${diary.status}, approval=${diary.approval_status})`,
          detectedFromData: { consumptionId: c.id, diaryId: c.work_diary_id, diaryStatus: diary.status, diaryApproval: diary.approval_status },
          recommendedResolution: "בדוק ובטל או תקן את רשומת הצריכה",
        }, dedupeMap, result);
      }
    }

    // ── 14. Duplicate consumption for same diary item ────────────────────────
    const dupConsKey = new Map<string, string>();
    for (const c of activeConsumptions) {
      if (!c.work_diary_id || !c.order_item_key) continue;
      const key = `${c.order_id}:${c.order_item_key}:${c.work_diary_id}`;
      if (dupConsKey.has(key)) {
        const k = dedupeKey("duplicate_consumption", "inventory_consumptions", key);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "duplicate_consumption",
          entityType: "inventory_consumptions",
          entityId: key,
          severity: "error",
          title: `צריכה כפולה — פריט הזמנה ${c.order_item_key}`,
          description: `שתי רשומות צריכה פעילות לאותו פריט הזמנה ${c.order_item_key} ביומן ${c.work_diary_id}`,
          detectedFromData: { orderId: c.order_id, orderItemKey: c.order_item_key, diaryId: c.work_diary_id, firstId: dupConsKey.get(key), duplicateId: c.id },
          recommendedResolution: "בטל את הרשומה הכפולה ידנית",
        }, dedupeMap, result);
      } else {
        dupConsKey.set(key, c.id);
      }
    }

    // ── 15. Consumption quantity greater than reservation/planned quantity ────
    for (const c of activeConsumptions) {
      if (!c.order_item_key) continue;
      const reserved = reservedByOrderItem.get(`${c.order_id}:${c.order_item_key}`);
      const order = allOrders.find(o => o.id === c.order_id);
      if (!order) continue;
      const allRows = [...(order.data?.accessoryRows ?? []), ...(order.data?.miscRows ?? [])];
      const row = allRows.find(r => r.id === c.order_item_key);
      const plannedQty = row ? (parseFloat(row.quantity ?? "0") || 0) : 0;
      const referenceQty = reserved ?? plannedQty;
      if (referenceQty > 0 && c.quantity > referenceQty + 0.0001) {
        const k = dedupeKey("over_consumption", "inventory_consumptions", c.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "over_consumption",
          entityType: "inventory_consumptions",
          entityId: c.id,
          severity: "warn",
          title: `צריכה עולה על שריון — פריט ${c.item_id}`,
          description: `צריכה: ${c.quantity} | שריון/מתוכנן: ${referenceQty} | עודף: ${c.quantity - referenceQty}`,
          detectedFromData: { consumptionId: c.id, itemId: c.item_id, consumed: c.quantity, reference: referenceQty },
          recommendedResolution: "בדוק כמות בפועל ותקן ידנית אם נדרש",
        }, dedupeMap, result);
      }
    }

    // ── 16. Reservation remains active after full consumption ────────────────
    for (const r of reservations.filter(res => res.status === "active")) {
      const consumptionKey = `${r.order_id}:${r.order_item_key}`;
      if (consumedOrderItems.has(consumptionKey)) {
        const k = dedupeKey("stale_active_reservation_after_consumption", "inventory_reservations", r.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "stale_active_reservation_after_consumption",
          entityType: "inventory_reservations",
          entityId: r.id,
          severity: "warn",
          title: `שריון פעיל אחרי צריכה — פריט ${r.item_id}`,
          description: `שריון ${r.id} עדיין פעיל למרות שנוצרה רשומת צריכה עבור ${consumptionKey}`,
          detectedFromData: { reservationId: r.id, itemId: r.item_id, orderId: r.order_id, orderItemKey: r.order_item_key },
          recommendedResolution: "הפעל סנכרון שריונות לעדכון מצב השריון",
        }, dedupeMap, result);
      }
    }

    // ── 17. Completed warehouse order with no inventory reconciliation ────────
    const completedWarehouseOrders = allOrders.filter(o =>
      o.status === "completed" && o.warehouse_required === true
    );
    for (const order of completedWarehouseOrders) {
      const hasAnyConsumption = activeConsumptions.some(c => c.order_id === order.id);
      const hasApprovedDiary = approvedDiaryOrderIds.has(order.id);
      if (!hasAnyConsumption && hasApprovedDiary) {
        const k = dedupeKey("completed_order_no_reconciliation", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "completed_order_no_reconciliation",
          entityType: "work_order",
          entityId: order.id,
          severity: "warn",
          title: `הזמנה הושלמה ללא התאמת מלאי — ${order.order_number}`,
          description: `הזמנה ${order.order_number} הסתיימה עם יומן מאושר אך אין רשומות צריכת מלאי`,
          detectedFromData: { orderId: order.id, orderNumber: order.order_number },
          recommendedResolution: "הפעל התאמת מלאי עבור הזמנה זו",
        }, dedupeMap, result);
      }
    }

    // ── 18. Unmapped diary item requiring catalog mapping ────────────────────
    for (const diary of approvedDiaries) {
      if (!diary.order_id) continue;
      const order = allOrders.find(o => o.id === diary.order_id);
      if (!order) continue;
      const allRows = [...(order.data?.accessoryRows ?? []), ...(order.data?.miscRows ?? [])];
      const unmappedRows = allRows.filter(r => r.description?.trim() && (!r.catalogItemId || !catalogItemIds.has(r.catalogItemId)));
      for (const row of unmappedRows) {
        const entityId = `${order.id}:${row.description?.trim()}`;
        const k = dedupeKey("diary_unmapped_item", "work_order", entityId);
        activeDedupeKeys.add(k);
        await upsertTask(db, AGENT_ID, {
          category: "diary_unmapped_item",
          entityType: "work_order",
          entityId,
          title: `מיפוי קטלוג נדרש — "${row.description?.trim()}"`,
          description: `יומן ${diary.id} אושר | פריט "${row.description?.trim()}" בהזמנה ${order.order_number} לא מקושר לקטלוג`,
          priority: "normal",
          recommendedAction: "קשר פריט זה לקטלוג כדי לאפשר מעקב צריכה",
        }, taskDedupeMap, result);
      }
    }

    // ── 19. Negative stock after consumption ─────────────────────────────────
    for (const item of items) {
      if (item.current_quantity < 0) {
        const hasConsumption = activeConsumptions.some(c => c.item_id === item.id);
        if (hasConsumption) {
          const k = dedupeKey("negative_stock_after_consumption", "catalog_item", item.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "negative_stock_after_consumption",
            entityType: "catalog_item",
            entityId: item.id,
            severity: "critical",
            title: `מלאי שלילי לאחר צריכה — ${item.name} (${item.current_quantity})`,
            description: `פריט ${item.name} הגיע למלאי שלילי (${item.current_quantity}) לאחר פעולות צריכה`,
            detectedFromData: { itemName: item.name, currentQuantity: item.current_quantity, unit: item.unit_of_measure },
            recommendedResolution: "בדוק תנועות מלאי ותקן על ידי קבלת סחורה או תיקון ידני מבוקר",
          }, dedupeMap, result);
        }
      }
    }

    // ── 20. manual correction mismatch risk ─────────────────────────────────
    // (no additional check beyond existing negative_stock rule 1; rule 19 is consumption-specific)

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
