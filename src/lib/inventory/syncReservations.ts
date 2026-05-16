import type { SupabaseClient } from "@supabase/supabase-js";

interface OrderRow {
  data: {
    accessoryRows?: Array<{ catalogItemId?: string; quantity?: string }>;
    miscRows?: Array<{ catalogItemId?: string; quantity?: string }>;
  } | null;
}

interface CatalogRow {
  id: string;
  reserved_quantity: number;
}

export interface SyncResult {
  updated: number;
  cleared: number;
  error?: string;
}

/**
 * Computes reserved_quantity per catalog item from active warehouse orders
 * and writes the result to catalog_items.reserved_quantity.
 *
 * This is a denormalized cache update — not an audited inventory movement.
 * Call this before any stock-level check that uses reserved_quantity.
 */
export async function syncReservations(db: SupabaseClient): Promise<SyncResult> {
  const [ordersRes, itemsRes] = await Promise.all([
    db
      .from("work_orders")
      .select("data")
      .eq("warehouse_required", true)
      .not("status", "in", '("completed","cancelled")'),
    db
      .from("catalog_items")
      .select("id,reserved_quantity")
      .eq("is_active", true),
  ]);

  if (ordersRes.error) return { updated: 0, cleared: 0, error: ordersRes.error.message };
  if (itemsRes.error)  return { updated: 0, cleared: 0, error: itemsRes.error.message };

  // Sum quantities per catalogItemId across all active warehouse orders
  const computed = new Map<string, number>();
  for (const order of (ordersRes.data ?? []) as OrderRow[]) {
    const rows = [
      ...(order.data?.accessoryRows ?? []),
      ...(order.data?.miscRows ?? []),
    ];
    for (const row of rows) {
      if (!row.catalogItemId) continue;
      const qty = parseFloat(row.quantity ?? "0") || 0;
      if (qty <= 0) continue;
      computed.set(row.catalogItemId, (computed.get(row.catalogItemId) ?? 0) + qty);
    }
  }

  // Build delta list — only update rows where the value changed
  const now = new Date().toISOString();
  const updates: Array<{ id: string; reserved_quantity: number; updated_at: string }> = [];

  for (const item of (itemsRes.data ?? []) as CatalogRow[]) {
    const next = computed.get(item.id) ?? 0;
    if (next !== item.reserved_quantity) {
      updates.push({ id: item.id, reserved_quantity: next, updated_at: now });
    }
  }

  if (updates.length === 0) return { updated: 0, cleared: 0 };

  const { error: upsertErr } = await db
    .from("catalog_items")
    .upsert(updates, { onConflict: "id" });

  if (upsertErr) return { updated: 0, cleared: 0, error: upsertErr.message };

  return {
    updated: updates.length,
    cleared: updates.filter(u => u.reserved_quantity === 0).length,
  };
}
