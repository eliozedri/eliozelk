import type { OrderItem } from "./state";

/**
 * Product / inventory availability hook — EXTENSION POINT.
 *
 * Stage 1 has no live stock/inventory feed, so this intentionally returns "unknown" for
 * everything: Jarvis never invents availability. When an inventory source exists, replace
 * the body (recognize catalog items, check stock, suggest alternatives) WITHOUT changing
 * the signature — the skill already handles all three outcomes.
 */

export interface AvailabilityResult {
  /** Whether we have reliable availability data at all. */
  known: boolean;
  available?: boolean;
  /** Alternative item names from the same category (when data supports it). */
  alternatives?: string[];
}

export async function checkAvailability(_item: OrderItem): Promise<AvailabilityResult> {
  // No reliable stock data yet → don't claim available or unavailable.
  // Future: query catalog_items + an inventory/stock source here.
  return { known: false };
}

/** Convenience: any item explicitly known to be unavailable (none, until data exists). */
export async function findUnavailable(_items: OrderItem[]): Promise<{ item: OrderItem; result: AvailabilityResult }[]> {
  return [];
}
