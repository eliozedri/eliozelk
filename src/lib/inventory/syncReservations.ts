import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderDataRow {
  id: string;
  order_number: string;
  data: {
    accessoryRows?: Array<{ id?: string; catalogItemId?: string; quantity?: string; description?: string }>;
    miscRows?: Array<{ id?: string; catalogItemId?: string; quantity?: string; description?: string }>;
  } | null;
}

interface DesiredReservation {
  itemId: string;
  orderId: string;
  orderNumber: string;
  orderItemKey: string;
  quantity: number;
  description: string;
}

interface ExistingActiveReservation {
  id: string;
  item_id: string;
  order_id: string;
  order_item_key: string;
  quantity: number;
}

interface CacheRow {
  id: string;
  reserved_quantity: number;
}

export interface SyncResult {
  desiredCount: number;
  reservationsCreated: number;
  reservationsUpdated: number;
  reservationsReleased: number;
  cacheUpdated: number;
  movementsWritten: number;
  warnings: string[];
  errors: string[];
  durationMs: number;
}

// ── Step 1 — Compute desired reservations from active warehouse orders ─────────

export async function computeDesiredReservations(db: SupabaseClient): Promise<{
  desired: Map<string, DesiredReservation>;
  activeOrderIds: Set<string>;
  error?: string;
}> {
  const { data: orders, error } = await db
    .from("work_orders")
    .select("id,order_number,data")
    .eq("warehouse_required", true)
    .not("status", "in", '("completed","cancelled")');

  if (error) return { desired: new Map(), activeOrderIds: new Set(), error: error.message };

  const desired = new Map<string, DesiredReservation>();
  const activeOrderIds = new Set<string>();

  for (const order of (orders ?? []) as OrderDataRow[]) {
    activeOrderIds.add(order.id);
    const rows = [
      ...(order.data?.accessoryRows ?? []),
      ...(order.data?.miscRows ?? []),
    ];
    for (const row of rows) {
      if (!row.catalogItemId || !row.id) continue;
      const qty = parseFloat(row.quantity ?? "0") || 0;
      if (qty <= 0) continue;
      const key = `${order.id}:${row.id}`;
      desired.set(key, {
        itemId:       row.catalogItemId,
        orderId:      order.id,
        orderNumber:  order.order_number,
        orderItemKey: row.id,
        quantity:     qty,
        description:  row.description ?? "",
      });
    }
  }

  return { desired, activeOrderIds };
}

// ── Step 2 — Write one inventory movement (non-fatal on error) ─────────────────

async function writeReservationMovement(
  db: SupabaseClient,
  args: {
    itemId: string;
    orderId: string;
    movementType: "reserve" | "release_reservation" | "correction";
    quantity: number;
    notes: string;
  },
  result: SyncResult,
): Promise<void> {
  const { error } = await db.from("inventory_movements").insert({
    item_id:       args.itemId,
    movement_type: args.movementType,
    quantity:      args.quantity,
    source_type:   "order",
    source_id:     args.orderId,
    notes:         args.notes,
    created_by:    "system:inventory-sync",
    created_at:    new Date().toISOString(),
  });
  if (error) {
    result.warnings.push(`movement write failed (${args.movementType} item=${args.itemId}): ${error.message}`);
  } else {
    result.movementsWritten++;
  }
}

// ── Step 3 — Sync reservation rows against desired state ──────────────────────

async function syncOrderReservations(
  db: SupabaseClient,
  desired: Map<string, DesiredReservation>,
  activeOrderIds: Set<string>,
  cancelledOrderIds: Set<string>,
  completedOrderIds: Set<string>,
  result: SyncResult,
): Promise<void> {
  // Load only active reservations — released rows remain as immutable history
  const { data: activeRows, error } = await db
    .from("inventory_reservations")
    .select("id,item_id,order_id,order_item_key,quantity")
    .eq("status", "active");

  if (error) { result.errors.push(`load active reservations: ${error.message}`); return; }

  const existingActive = new Map<string, ExistingActiveReservation>();
  for (const r of (activeRows ?? []) as ExistingActiveReservation[]) {
    existingActive.set(`${r.order_id}:${r.order_item_key}`, r);
  }

  const now = new Date().toISOString();

  // Process each desired reservation
  for (const [key, des] of desired) {
    const ex = existingActive.get(key);

    if (!ex) {
      // INSERT new active reservation
      const { error: insertErr } = await db.from("inventory_reservations").insert({
        item_id:       des.itemId,
        order_id:      des.orderId,
        order_item_key: des.orderItemKey,
        source_type:   "order",
        quantity:      des.quantity,
        status:        "active",
        metadata:      { orderNumber: des.orderNumber, description: des.description },
        created_at:    now,
        updated_at:    now,
      });
      if (insertErr) {
        result.errors.push(`insert reservation ${key}: ${insertErr.message}`);
        continue;
      }
      result.reservationsCreated++;
      await writeReservationMovement(db, {
        itemId: des.itemId, orderId: des.orderId,
        movementType: "reserve",
        quantity: des.quantity,
        notes: `שריון חדש — ${des.description || "פריט ללא שם"} | הזמנה ${des.orderNumber} | מפתח פריט: ${des.orderItemKey}`,
      }, result);

    } else if (Math.abs(ex.quantity - des.quantity) > 0.0001) {
      // UPDATE quantity only — same active row, quantity changed
      const delta = des.quantity - ex.quantity;
      const { error: updateErr } = await db.from("inventory_reservations")
        .update({ quantity: des.quantity, updated_at: now })
        .eq("id", ex.id);
      if (updateErr) {
        result.errors.push(`update reservation qty ${key}: ${updateErr.message}`);
        continue;
      }
      result.reservationsUpdated++;
      await writeReservationMovement(db, {
        itemId: des.itemId, orderId: des.orderId,
        movementType: "correction",
        quantity: delta,
        notes: `עדכון כמות שריון — מ-${ex.quantity} ל-${des.quantity} (הפרש: ${delta > 0 ? "+" : ""}${delta}) | הזמנה ${des.orderNumber} | מפתח פריט: ${des.orderItemKey}`,
      }, result);
    }
    // else: active and same quantity → no-op (fully idempotent)
  }

  // Release active reservations no longer in desired state
  for (const [key, ex] of existingActive) {
    if (desired.has(key)) continue;

    const isCancelled = cancelledOrderIds.has(ex.order_id);
    const isCompleted = completedOrderIds.has(ex.order_id);
    const newStatus    = isCancelled ? "cancelled" : "released";
    const releaseReason = isCancelled ? "order_cancelled"
      : isCompleted     ? "order_completed"
      : "order_item_removed";

    const { error: releaseErr } = await db.from("inventory_reservations")
      .update({ status: newStatus, released_at: now, release_reason: releaseReason, updated_at: now })
      .eq("id", ex.id);
    if (releaseErr) {
      result.errors.push(`release reservation ${key}: ${releaseErr.message}`);
      continue;
    }
    result.reservationsReleased++;
    await writeReservationMovement(db, {
      itemId: ex.item_id, orderId: ex.order_id,
      movementType: "release_reservation",
      quantity: -ex.quantity,
      notes: `שריון שוחרר — סיבה: ${releaseReason} | מפתח פריט: ${ex.order_item_key} | מפתח: ${key}`,
    }, result);
  }
}

// ── Step 4 — Recalculate reserved_quantity cache on catalog_items ──────────────

export async function recalculateReservedQuantityCache(
  db: SupabaseClient,
  result: SyncResult,
): Promise<void> {
  const [sumRes, itemsRes] = await Promise.all([
    db.from("inventory_reservations").select("item_id,quantity").eq("status", "active"),
    db.from("catalog_items").select("id,reserved_quantity").eq("is_active", true),
  ]);

  if (sumRes.error)   { result.errors.push(`cache sum: ${sumRes.error.message}`);   return; }
  if (itemsRes.error) { result.errors.push(`cache items: ${itemsRes.error.message}`); return; }

  const computed = new Map<string, number>();
  for (const r of sumRes.data ?? []) {
    computed.set(r.item_id as string, (computed.get(r.item_id as string) ?? 0) + (r.quantity as number));
  }

  const now = new Date().toISOString();
  const updates: Array<{ id: string; reserved_quantity: number; updated_at: string }> = [];

  for (const item of (itemsRes.data ?? []) as CacheRow[]) {
    const next = computed.get(item.id) ?? 0;
    if (Math.abs(next - item.reserved_quantity) > 0.0001) {
      updates.push({ id: item.id, reserved_quantity: next, updated_at: now });
    }
  }

  if (updates.length === 0) return;

  const { error: upsertErr } = await db
    .from("catalog_items")
    .upsert(updates, { onConflict: "id" });

  if (upsertErr) { result.errors.push(`cache update: ${upsertErr.message}`); return; }
  result.cacheUpdated = updates.length;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function syncAllReservations(db: SupabaseClient): Promise<SyncResult> {
  const start = Date.now();
  const result: SyncResult = {
    desiredCount: 0,
    reservationsCreated: 0,
    reservationsUpdated: 0,
    reservationsReleased: 0,
    cacheUpdated: 0,
    movementsWritten: 0,
    warnings: [],
    errors: [],
    durationMs: 0,
  };

  const [computedResult, cancelledRes, completedRes] = await Promise.all([
    computeDesiredReservations(db),
    db.from("work_orders").select("id").eq("status", "cancelled"),
    db.from("work_orders").select("id").eq("status", "completed"),
  ]);

  const { desired, activeOrderIds, error: computeErr } = computedResult;
  if (computeErr) {
    result.errors.push(`compute desired: ${computeErr}`);
    result.durationMs = Date.now() - start;
    return result;
  }
  if (cancelledRes.error) {
    result.warnings.push(`load cancelled orders: ${cancelledRes.error.message}`);
  }
  if (completedRes.error) {
    result.warnings.push(`load completed orders: ${completedRes.error.message}`);
  }

  const cancelledOrderIds = new Set<string>(
    ((cancelledRes.data ?? []) as Array<{ id: string }>).map(o => o.id),
  );
  const completedOrderIds = new Set<string>(
    ((completedRes.data ?? []) as Array<{ id: string }>).map(o => o.id),
  );

  result.desiredCount = desired.size;
  await syncOrderReservations(db, desired, activeOrderIds, cancelledOrderIds, completedOrderIds, result);
  await recalculateReservedQuantityCache(db, result);

  result.durationMs = Date.now() - start;
  return result;
}

// Legacy alias — callers using the old name still work
export { syncAllReservations as syncReservations };
