// Supplier-product replenishment intelligence.
// Creates/updates product_supplier_mappings after document posting.
// Also provides data quality checks and reorder intelligence.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataQualityWarning } from "@/types/supplierDocument";

interface MappingUpdateInput {
  catalogItemId: string;
  supplierId: string;
  supplierSku: string;
  supplierItemName: string;
  purchasePrice: number;
  currency: string;
  unit: string;
  purchaseDate: string;
  sourceDocumentId: string;
  makePreferred?: boolean;
}

// Create or update a product-supplier mapping after a line is posted.
export async function upsertProductSupplierMapping(
  db: SupabaseClient,
  input: MappingUpdateInput
): Promise<void> {
  const now = new Date().toISOString();

  // Check if mapping exists
  const { data: existing } = await db
    .from("product_supplier_mappings")
    .select("id,last_purchase_price,average_purchase_price")
    .eq("catalog_item_id", input.catalogItemId)
    .eq("supplier_id", input.supplierId)
    .single();

  if (existing) {
    const prev = existing as {
      id: string;
      last_purchase_price: number | null;
      average_purchase_price: number | null;
    };
    // Compute running average
    const newAvg =
      prev.average_purchase_price != null
        ? (prev.average_purchase_price + input.purchasePrice) / 2
        : input.purchasePrice;

    await db
      .from("product_supplier_mappings")
      .update({
        supplier_sku:            input.supplierSku || undefined,
        supplier_item_name:      input.supplierItemName || undefined,
        last_purchase_price:     input.purchasePrice,
        last_purchase_currency:  input.currency,
        last_purchase_unit:      input.unit,
        last_purchase_date:      input.purchaseDate,
        average_purchase_price:  newAvg,
        is_preferred:            input.makePreferred ?? false,
        source_document_id:      input.sourceDocumentId,
        updated_at:              now,
      })
      .eq("id", prev.id);
  } else {
    await db.from("product_supplier_mappings").insert({
      catalog_item_id:        input.catalogItemId,
      supplier_id:            input.supplierId,
      supplier_sku:           input.supplierSku,
      supplier_item_name:     input.supplierItemName,
      last_purchase_price:    input.purchasePrice,
      last_purchase_currency: input.currency,
      last_purchase_unit:     input.unit,
      last_purchase_date:     input.purchaseDate,
      average_purchase_price: input.purchasePrice,
      is_preferred:           input.makePreferred ?? false,
      source_document_id:     input.sourceDocumentId,
      confidence_score:       1.0,
      status:                 "active",
    });
  }

  // Also update catalog_items.cost_price with latest purchase price
  await db
    .from("catalog_items")
    .update({ cost_price: input.purchasePrice, updated_at: now })
    .eq("id", input.catalogItemId);

  // Set preferred supplier on catalog_items.supplier_id if flag is set
  if (input.makePreferred) {
    await db
      .from("catalog_items")
      .update({ supplier_id: input.supplierId, updated_at: now })
      .eq("id", input.catalogItemId);
  }
}

// ── Data quality warnings ─────────────────────────────────────────────────────

interface SupplierRow {
  id: string;
  phone: string;
  email: string;
  whatsapp: string;
}

interface CatalogRow {
  id: string;
  name: string;
  minimum_quantity: number;
  reorder_point: number | null;
  supplier_id: string | null;
}

export async function collectDataQualityWarnings(
  db: SupabaseClient,
  supplierId: string | undefined,
  lineItems: Array<{ catalogItemId?: string; unitPrice?: number; prevCostPrice?: number | null }>
): Promise<DataQualityWarning[]> {
  const warnings: DataQualityWarning[] = [];

  // Supplier warnings
  if (supplierId) {
    const { data: sup } = await db
      .from("suppliers")
      .select("id,phone,email,whatsapp")
      .eq("id", supplierId)
      .single();
    const s = sup as SupplierRow | null;
    if (s) {
      if (!s.phone && !s.whatsapp)
        warnings.push({
          type: "supplier_missing_phone",
          message: "ספק ללא מספר טלפון ו-WhatsApp",
          severity: "warning",
        });
      if (!s.email)
        warnings.push({
          type: "supplier_missing_email",
          message: "ספק ללא כתובת מייל",
          severity: "info",
        });
    }
  } else {
    warnings.push({
      type: "supplier_unknown",
      message: "ספק לא מזוהה — נדרש קישור ידני",
      severity: "error",
    });
  }

  // Per-line catalog item warnings
  const catalogIds = lineItems
    .map(l => l.catalogItemId)
    .filter((id): id is string => Boolean(id));

  if (catalogIds.length > 0) {
    const { data: cats } = await db
      .from("catalog_items")
      .select("id,name,minimum_quantity,reorder_point,supplier_id")
      .in("id", catalogIds);

    for (const row of (cats ?? []) as CatalogRow[]) {
      if (!row.supplier_id)
        warnings.push({
          type: "product_no_preferred_supplier",
          message: `מוצר "${row.name}" ללא ספק מועדף`,
          severity: "info",
        });
      if (row.minimum_quantity <= 0)
        warnings.push({
          type: "product_no_minimum_stock",
          message: `מוצר "${row.name}" ללא הגדרת מלאי מינימום`,
          severity: "info",
        });
      if (!row.reorder_point)
        warnings.push({
          type: "product_no_reorder_rule",
          message: `מוצר "${row.name}" ללא נקודת הזמנה`,
          severity: "info",
        });
    }
  }

  // Cost change warnings
  for (const line of lineItems) {
    if (
      line.catalogItemId &&
      line.unitPrice != null &&
      line.prevCostPrice != null &&
      line.prevCostPrice > 0
    ) {
      const changePct =
        Math.abs(line.unitPrice - line.prevCostPrice) / line.prevCostPrice;
      if (changePct >= 0.1) {
        warnings.push({
          type: "cost_changed_significantly",
          message: `שינוי מחיר ${Math.round(changePct * 100)}% ממחיר הקנייה הקודם`,
          severity: changePct >= 0.25 ? "warning" : "info",
        });
      }
    }
  }

  return warnings;
}
