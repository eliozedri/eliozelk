import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReturnResult {
  movementsWritten: number;
  cacheUpdated: number;
  warnings: string[];
  errors: string[];
  durationMs: number;
}

export interface ReturnArgs {
  orderId: string;
  catalogItemId: string;
  orderItemKey: string;
  returnedQty: number;
  notes: string;
  returnedBy: string;
}

// Prevent double-return: check if a return movement already exists for this
// order+item+key combo with source_type='return_from_field'.
async function hasExistingReturn(
  db: SupabaseClient,
  orderId: string,
  catalogItemId: string,
  orderItemKey: string,
): Promise<boolean> {
  const { data, error } = await db.from("inventory_movements")
    .select("id")
    .eq("item_id", catalogItemId)
    .eq("movement_type", "return")
    .eq("source_type", "return_from_field")
    .eq("source_id", `${orderId}:${orderItemKey}`)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

export async function returnFromField(
  db: SupabaseClient,
  args: ReturnArgs,
): Promise<ReturnResult> {
  const start = Date.now();
  const result: ReturnResult = {
    movementsWritten: 0,
    cacheUpdated: 0,
    warnings: [],
    errors: [],
    durationMs: 0,
  };

  if (args.returnedQty <= 0) {
    result.errors.push("returned quantity must be positive");
    result.durationMs = Date.now() - start;
    return result;
  }

  // Idempotency gate
  const alreadyReturned = await hasExistingReturn(
    db, args.orderId, args.catalogItemId, args.orderItemKey,
  );
  if (alreadyReturned) {
    result.warnings.push(
      `return already recorded for order=${args.orderId} item=${args.orderItemKey} — skipping`,
    );
    result.durationMs = Date.now() - start;
    return result;
  }

  // Load current catalog quantity
  const { data: catRow, error: catErr } = await db.from("catalog_items")
    .select("current_quantity,name")
    .eq("id", args.catalogItemId)
    .single();
  if (catErr || !catRow) {
    result.errors.push(`catalog item ${args.catalogItemId} not found: ${catErr?.message ?? "no data"}`);
    result.durationMs = Date.now() - start;
    return result;
  }

  const now = new Date().toISOString();

  // Write return movement (positive quantity = stock restored)
  const { error: movErr } = await db.from("inventory_movements").insert({
    item_id:       args.catalogItemId,
    movement_type: "return",
    quantity:      args.returnedQty,
    source_type:   "return_from_field",
    source_id:     `${args.orderId}:${args.orderItemKey}`,
    notes:         args.notes || `החזרה מהשטח | כמות: ${args.returnedQty} | מפתח: ${args.orderItemKey}`,
    created_by:    args.returnedBy,
    created_at:    now,
  });
  if (movErr) {
    result.errors.push(`movement write failed: ${movErr.message}`);
    result.durationMs = Date.now() - start;
    return result;
  }
  result.movementsWritten++;

  // Update current_quantity (stock restored)
  const newQty = (catRow as { current_quantity: number; name: string }).current_quantity + args.returnedQty;
  const { error: updateErr } = await db.from("catalog_items")
    .update({ current_quantity: newQty, updated_at: now })
    .eq("id", args.catalogItemId);
  if (updateErr) {
    result.warnings.push(`stock update failed (item=${args.catalogItemId}): ${updateErr.message}`);
  } else {
    result.cacheUpdated++;
  }

  result.durationMs = Date.now() - start;
  return result;
}
