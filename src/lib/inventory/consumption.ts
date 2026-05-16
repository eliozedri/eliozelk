import type { SupabaseClient } from "@supabase/supabase-js";
import { recalculateReservedQuantityCache, type SyncResult } from "./syncReservations";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItemRow {
  id: string;
  catalogItemId: string;
  quantity: string;
  description: string;
}

interface DiaryRow {
  id: string;
  order_id: string | null;
  diary_number: string;
  status: string;
  approval_status: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  data: {
    accessoryRows?: Array<{ id?: string; catalogItemId?: string; quantity?: string; description?: string }>;
    miscRows?: Array<{ id?: string; catalogItemId?: string; quantity?: string; description?: string }>;
  } | null;
}

interface ActiveReservationRow {
  id: string;
  item_id: string;
  order_id: string;
  order_item_key: string;
  quantity: number;
}

interface ExistingConsumptionRow {
  id: string;
  order_item_key: string | null;
  status: string;
  quantity: number;
}

export interface ConsumptionResult {
  consumptionsCreated: number;
  consumptionsUpdated: number;
  reservationsConsumed: number;
  movementsWritten: number;
  reconciliationTasksCreated: number;
  cacheUpdated: number;
  warnings: string[];
  errors: string[];
  durationMs: number;
}

// ── Step 1 — Extract consumable catalog items from order ───────────────────────

export async function computeConsumableDiaryItems(
  db: SupabaseClient,
  orderId: string,
  diaryId: string,
): Promise<{ diary: DiaryRow | null; order: OrderRow | null; items: OrderItemRow[]; error?: string }> {
  const [diaryRes, orderRes] = await Promise.all([
    db.from("work_diaries").select("id,order_id,diary_number,status,approval_status").eq("id", diaryId).single(),
    db.from("work_orders").select("id,order_number,data").eq("id", orderId).single(),
  ]);

  if (diaryRes.error) return { diary: null, order: null, items: [], error: `diary load: ${diaryRes.error.message}` };
  if (orderRes.error) return { diary: null, order: null, items: [], error: `order load: ${orderRes.error.message}` };

  const diary = diaryRes.data as DiaryRow;
  const order = orderRes.data as OrderRow;

  const rows = [
    ...(order.data?.accessoryRows ?? []),
    ...(order.data?.miscRows ?? []),
  ];

  const items: OrderItemRow[] = [];
  for (const row of rows) {
    if (!row.id || !row.catalogItemId) continue;
    const qty = parseFloat(row.quantity ?? "0") || 0;
    if (qty <= 0) continue;
    items.push({
      id: row.id,
      catalogItemId: row.catalogItemId,
      quantity: row.quantity ?? "0",
      description: row.description ?? "",
    });
  }

  return { diary, order, items };
}

// ── Step 2 — Write one consumption movement (non-fatal on error) ───────────────

export async function writeConsumptionMovement(
  db: SupabaseClient,
  args: {
    itemId: string;
    orderId: string;
    diaryId: string;
    quantity: number;
    notes: string;
  },
  result: ConsumptionResult,
): Promise<void> {
  const { error } = await db.from("inventory_movements").insert({
    item_id:       args.itemId,
    movement_type: "consume",
    quantity:      -args.quantity,
    source_type:   "work_diary",
    source_id:     args.diaryId,
    notes:         args.notes,
    created_by:    "system:inventory-consumption",
    created_at:    new Date().toISOString(),
  });
  if (error) {
    result.warnings.push(`movement write failed (consume item=${args.itemId}): ${error.message}`);
  } else {
    result.movementsWritten++;
  }
}

// ── Step 3 — Write reconciliation task for unmapped items ──────────────────────

export async function writeReconciliationTask(
  db: SupabaseClient,
  args: {
    orderId: string;
    orderNumber: string;
    diaryId: string;
    diaryNumber: string;
    description: string;
    reason: string;
  },
  result: ConsumptionResult,
): Promise<void> {
  const { error } = await db.from("agent_tasks").insert({
    agent_id:            "inventory-agent",
    related_entity_type: "work_order",
    related_entity_id:   args.orderId,
    title:               `התאמת מלאי נדרשת — ${args.orderNumber}`,
    description:         `יומן ${args.diaryNumber} אושר | ${args.reason} | ${args.description}`,
    priority:            "high",
    status:              "open",
    recommended_action:  "בדוק ידנית את כמויות הצריכה וסמן כהותאם לאחר אימות",
    requires_approval:   true,
  });
  if (error) {
    result.warnings.push(`reconciliation task write failed: ${error.message}`);
  } else {
    result.reconciliationTasksCreated++;
  }
}

// ── Step 4 — Release or mark unused reservation ────────────────────────────────

export async function releaseUnusedReservation(
  db: SupabaseClient,
  reservationId: string,
  itemId: string,
  unusedQty: number,
  orderItemKey: string,
  result: ConsumptionResult,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db.from("inventory_reservations")
    .update({ status: "released", released_at: now, release_reason: "partial_consumption", updated_at: now })
    .eq("id", reservationId);
  if (error) {
    result.warnings.push(`release unused reservation ${reservationId}: ${error.message}`);
    return;
  }
  result.reservationsConsumed++;
  const { error: movErr } = await db.from("inventory_movements").insert({
    item_id:       itemId,
    movement_type: "release_reservation",
    quantity:      -unusedQty,
    source_type:   "work_diary",
    source_id:     reservationId,
    notes:         `שחרור שריון שלא נוצל — כמות: ${unusedQty} | מפתח פריט: ${orderItemKey}`,
    created_by:    "system:inventory-consumption",
    created_at:    now,
  });
  if (!movErr) result.movementsWritten++;
}

// ── Step 5 — Orchestrator ─────────────────────────────────────────────────────

export async function syncConsumptionForOrder(
  db: SupabaseClient,
  orderId: string,
  diaryId: string,
): Promise<ConsumptionResult> {
  const start = Date.now();
  const result: ConsumptionResult = {
    consumptionsCreated: 0,
    consumptionsUpdated: 0,
    reservationsConsumed: 0,
    movementsWritten: 0,
    reconciliationTasksCreated: 0,
    cacheUpdated: 0,
    warnings: [],
    errors: [],
    durationMs: 0,
  };

  // ── Load and validate diary + order ──────────────────────────────────────────
  const { diary, order, items, error: loadErr } = await computeConsumableDiaryItems(db, orderId, diaryId);
  if (loadErr) {
    result.errors.push(loadErr);
    result.durationMs = Date.now() - start;
    return result;
  }

  if (!diary) { result.errors.push("diary not found"); result.durationMs = Date.now() - start; return result; }
  if (!order) { result.errors.push("order not found"); result.durationMs = Date.now() - start; return result; }

  // Safety gate: only consume from approved diaries
  if (diary.status !== "submitted" || diary.approval_status !== "approved") {
    result.errors.push(`diary ${diary.id} is not approved (status=${diary.status}, approval=${diary.approval_status}) — refusing consumption`);
    result.durationMs = Date.now() - start;
    return result;
  }

  // Safety gate: diary must link to this order
  if (diary.order_id !== orderId) {
    result.errors.push(`diary ${diary.id} is linked to order ${diary.order_id}, not ${orderId}`);
    result.durationMs = Date.now() - start;
    return result;
  }

  // Handle no mapped items
  if (items.length === 0) {
    await writeReconciliationTask(db, {
      orderId,
      orderNumber: order.order_number,
      diaryId,
      diaryNumber: diary.diary_number,
      description: "אין פריטי קטלוג מקושרים בהזמנה",
      reason: "לא ניתן לבצע צריכה אוטומטית — אין פריטים מקושרים לקטלוג",
    }, result);
    result.durationMs = Date.now() - start;
    return result;
  }

  // ── Load existing consumptions and reservations in parallel ───────────────────
  const catalogItemIds = [...new Set(items.map(i => i.catalogItemId))];

  const [existingConsRes, activeResRes, catalogRes] = await Promise.all([
    db.from("inventory_consumptions")
      .select("id,order_item_key,status,quantity")
      .eq("order_id", orderId)
      .in("status", ["pending_review", "consumed"]),
    db.from("inventory_reservations")
      .select("id,item_id,order_id,order_item_key,quantity")
      .eq("order_id", orderId)
      .eq("status", "active"),
    db.from("catalog_items")
      .select("id,current_quantity,name")
      .in("id", catalogItemIds),
  ]);

  if (existingConsRes.error) { result.errors.push(`load consumptions: ${existingConsRes.error.message}`); result.durationMs = Date.now() - start; return result; }
  if (activeResRes.error)    { result.errors.push(`load reservations: ${activeResRes.error.message}`);   result.durationMs = Date.now() - start; return result; }
  if (catalogRes.error)      { result.errors.push(`load catalog: ${catalogRes.error.message}`);          result.durationMs = Date.now() - start; return result; }

  const existingCons = new Map<string, ExistingConsumptionRow>();
  for (const c of (existingConsRes.data ?? []) as ExistingConsumptionRow[]) {
    if (c.order_item_key) existingCons.set(c.order_item_key, c);
  }

  const activeResMap = new Map<string, ActiveReservationRow>();
  for (const r of (activeResRes.data ?? []) as ActiveReservationRow[]) {
    activeResMap.set(r.order_item_key, r);
  }

  const catalogMap = new Map<string, { current_quantity: number; name: string }>();
  for (const c of (catalogRes.data ?? []) as Array<{ id: string; current_quantity: number; name: string }>) {
    catalogMap.set(c.id, c);
  }

  const now = new Date().toISOString();

  // ── Process each consumable order item ────────────────────────────────────────
  for (const item of items) {
    const orderItemKey = item.id;

    // Idempotency: skip if already consumed/pending
    if (existingCons.has(orderItemKey)) continue;

    const reservation = activeResMap.get(orderItemKey);
    const plannedQty  = parseFloat(item.quantity) || 0;
    const consumeQty  = reservation ? reservation.quantity : plannedQty;

    if (consumeQty <= 0) {
      result.warnings.push(`skip item ${item.catalogItemId} — consume qty is ${consumeQty}`);
      continue;
    }

    const catalogItem = catalogMap.get(item.catalogItemId);
    if (!catalogItem) {
      result.warnings.push(`catalog item ${item.catalogItemId} not found — skipping`);
      await writeReconciliationTask(db, {
        orderId, orderNumber: order.order_number,
        diaryId, diaryNumber: diary.diary_number,
        description: `פריט קטלוג ${item.catalogItemId} לא נמצא`,
        reason: "פריט קטלוג חסר",
      }, result);
      continue;
    }

    // Warn if consumption would produce negative stock
    const afterQty = catalogItem.current_quantity - consumeQty;
    if (afterQty < 0) {
      result.warnings.push(`consuming ${consumeQty} of ${catalogItem.name} would produce negative stock (current=${catalogItem.current_quantity})`);
    }

    // Warn if actual > reserved (over-consumption)
    if (reservation && Math.abs(plannedQty - reservation.quantity) > 0.0001 && plannedQty > reservation.quantity) {
      result.warnings.push(`over-consumption warning: planned=${plannedQty} > reserved=${reservation.quantity} for item ${catalogItem.name}`);
    }

    // INSERT inventory_consumptions
    const { error: consInsertErr } = await db.from("inventory_consumptions").insert({
      item_id:         item.catalogItemId,
      order_id:        orderId,
      work_diary_id:   diaryId,
      reservation_id:  reservation?.id ?? null,
      order_item_key:  orderItemKey,
      diary_item_key:  null,
      quantity:        consumeQty,
      status:          "consumed",
      source_type:     "work_diary",
      consumed_at:     now,
      created_at:      now,
      updated_at:      now,
      metadata: {
        plannedQty,
        diaryNumber:  diary.diary_number,
        orderNumber:  order.order_number,
        description:  item.description,
        reservedQty:  reservation?.quantity ?? null,
      },
    });

    if (consInsertErr) {
      result.errors.push(`insert consumption ${orderItemKey}: ${consInsertErr.message}`);
      continue;
    }
    result.consumptionsCreated++;

    // Write consume movement
    await writeConsumptionMovement(db, {
      itemId:   item.catalogItemId,
      orderId,
      diaryId,
      quantity: consumeQty,
      notes: `צריכה — ${item.description || "פריט ללא שם"} | יומן ${diary.diary_number} | הזמנה ${order.order_number} | מפתח פריט: ${orderItemKey}`,
    }, result);

    // Deduct current_quantity
    const newQty = catalogItem.current_quantity - consumeQty;
    const { error: updateErr } = await db.from("catalog_items")
      .update({ current_quantity: newQty, updated_at: now })
      .eq("id", item.catalogItemId);
    if (updateErr) {
      result.warnings.push(`catalog qty update failed (item=${item.catalogItemId}): ${updateErr.message}`);
    } else {
      catalogMap.set(item.catalogItemId, { ...catalogItem, current_quantity: newQty });
    }

    // Mark reservation as consumed
    if (reservation) {
      const { error: resErr } = await db.from("inventory_reservations")
        .update({ status: "consumed", released_at: now, release_reason: "consumed_by_diary", updated_at: now })
        .eq("id", reservation.id);
      if (resErr) {
        result.warnings.push(`reservation ${reservation.id} status update failed: ${resErr.message}`);
      } else {
        result.reservationsConsumed++;
      }
    }
  }

  // ── Recalculate reserved_quantity cache ───────────────────────────────────────
  const cacheShim: SyncResult = {
    desiredCount: 0, reservationsCreated: 0, reservationsUpdated: 0,
    reservationsReleased: 0, cacheUpdated: 0, movementsWritten: 0,
    warnings: [], errors: [], durationMs: 0,
  };
  await recalculateReservedQuantityCache(db, cacheShim);
  result.cacheUpdated = cacheShim.cacheUpdated;
  cacheShim.errors.forEach(e => result.errors.push(e));
  cacheShim.warnings.forEach(w => result.warnings.push(w));

  result.durationMs = Date.now() - start;
  return result;
}
