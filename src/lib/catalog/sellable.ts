import type { CatalogItem } from "@/types/catalog";

/**
 * Single source of truth for "is this product part of the operational / sellable pool?".
 * Operational = active. Out-of-stock is intentionally NOT considered here — stock is a
 * separate concept (current_quantity) and must never gate operational visibility.
 */
export function isSellable(item: Pick<CatalogItem, "isActive">): boolean {
  return item.isActive;
}

export type CatalogStatusBucket = "active" | "needs_review" | "inactive";

/** Derive the mutually-exclusive display bucket from is_active + metadata.review_state. */
export function statusBucket(
  item: Pick<CatalogItem, "isActive"> & { metadata?: Record<string, unknown> },
): CatalogStatusBucket {
  if (item.isActive) return "active";
  if (item.metadata?.review_state === "needs_review") return "needs_review";
  return "inactive";
}

export const STATUS_LABEL_HE: Record<CatalogStatusBucket, string> = {
  active: "פעיל",
  needs_review: "ממתין לבדיקה",
  inactive: "לא פעיל",
};

/** Tailwind classes for the status pill, keyed by bucket. */
export const statusPillClass: Record<CatalogStatusBucket, string> = {
  active: "bg-green-100 text-green-700 hover:bg-green-200",
  needs_review: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  inactive: "bg-gray-100 text-gray-500 hover:bg-gray-200",
};
