import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RecommendationType =
  | "low_stock"
  | "out_of_stock"
  | "over_reserved"
  | "negative_stock"
  | "delivery_note_gap"
  | "manual";

export type RecommendationUrgency = "low" | "medium" | "high" | "critical";

export type RecommendationStatus =
  | "draft"
  | "pending_approval"
  | "approved_internal"
  | "dismissed"
  | "converted_to_order_later"
  | "resolved";

export type RecommendationSourceType =
  | "inventory_scan"
  | "manual"
  | "delivery_note"
  | "reservation";

export interface PurchaseRecommendation {
  id: string;
  item_id: string;
  supplier_id: string | null;
  recommendation_type: RecommendationType;
  current_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  minimum_quantity: number;
  recommended_quantity: number;
  urgency: RecommendationUrgency;
  status: RecommendationStatus;
  reason: string;
  source_type: RecommendationSourceType;
  source_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  dismissed_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertRecommendationParams {
  itemId: string;
  supplierId?: string | null;
  recommendationType: RecommendationType;
  currentQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  minimumQuantity: number;
  recommendedQuantity: number;
  urgency: RecommendationUrgency;
  reason: string;
  sourceType: RecommendationSourceType;
  sourceId?: string | null;
  createdBy?: string;
}

// ── Quantity calculation helpers ──────────────────────────────────────────────

export function calcRecommendedQuantity(
  type: RecommendationType,
  currentQty: number,
  reservedQty: number,
  minimumQty: number,
): number {
  switch (type) {
    case "negative_stock":
      return Math.abs(currentQty) + minimumQty;
    case "out_of_stock":
      return minimumQty + Math.max(0, reservedQty - currentQty);
    case "low_stock": {
      const base = minimumQty - currentQty;
      const buffer = reservedQty > 0.5 * minimumQty ? Math.ceil(base * 0.2) : 0;
      return base + buffer;
    }
    case "over_reserved":
      return Math.max(0, reservedQty - currentQty) + minimumQty;
    default:
      return Math.max(0, minimumQty - currentQty);
  }
}

export function calcUrgency(
  type: RecommendationType,
  currentQty: number,
  minimumQty: number,
): RecommendationUrgency {
  if (type === "negative_stock") return "critical";
  if (type === "out_of_stock")   return "critical";
  if (type === "over_reserved")  return "high";
  if (type === "low_stock") {
    const ratio = minimumQty > 0 ? currentQty / minimumQty : 1;
    if (ratio <= 0.25) return "high";
    if (ratio <= 0.5)  return "medium";
    return "low";
  }
  return "low";
}

// ── Upsert — idempotent, updates existing open recommendation ─────────────────

export async function upsertPurchaseRecommendation(
  db: SupabaseClient,
  params: UpsertRecommendationParams,
): Promise<{ created: boolean; error?: string }> {
  const now = new Date().toISOString();

  // Check for existing open recommendation
  const { data: existing } = await db.from("purchase_recommendations")
    .select("id,status")
    .eq("item_id", params.itemId)
    .eq("recommendation_type", params.recommendationType)
    .not("status", "in", '("dismissed","converted_to_order_later","resolved")')
    .limit(1)
    .maybeSingle();

  const payload = {
    item_id:              params.itemId,
    supplier_id:          params.supplierId ?? null,
    recommendation_type:  params.recommendationType,
    current_quantity:     params.currentQuantity,
    reserved_quantity:    params.reservedQuantity,
    available_quantity:   params.availableQuantity,
    minimum_quantity:     params.minimumQuantity,
    recommended_quantity: params.recommendedQuantity,
    urgency:              params.urgency,
    reason:               params.reason,
    source_type:          params.sourceType,
    source_id:            params.sourceId ?? null,
    updated_at:           now,
  };

  if (existing) {
    const { error } = await db.from("purchase_recommendations")
      .update(payload).eq("id", existing.id);
    if (error) return { created: false, error: error.message };
    return { created: false };
  }

  const { error } = await db.from("purchase_recommendations").insert({
    ...payload,
    status:     "draft",
    created_by: params.createdBy ?? "system:inventory-scan",
    created_at: now,
  });
  if (error) return { created: true, error: error.message };
  return { created: true };
}

// ── Resolve — auto-called when stock recovers above threshold ─────────────────

export async function resolvePurchaseRecommendations(
  db: SupabaseClient,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) return;
  const now = new Date().toISOString();
  await db.from("purchase_recommendations")
    .update({ status: "resolved", dismissed_reason: "stock_replenished", updated_at: now })
    .in("item_id", itemIds)
    .in("status", ["draft", "pending_approval"]);
}
