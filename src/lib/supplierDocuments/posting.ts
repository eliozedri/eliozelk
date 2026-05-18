// Posting engine — takes an approved supplier_document and writes all business records.
// Transactional by design: failure at any step leaves document in 'needs_review'
// with a clear error saved. Never posts partially silently.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SupplierDocumentType,
  InventoryLineAction,
} from "@/types/supplierDocument";
import {
  EXPENSE_DOCUMENT_TYPES,
  INVENTORY_DOCUMENT_TYPES,
  INFORMATIONAL_DOCUMENT_TYPES,
} from "@/types/supplierDocument";
import { upsertProductSupplierMapping } from "./productSupplierMapping";
import { runDuplicateCheck } from "./duplicateCheck";

// ── DB row shapes ─────────────────────────────────────────────────────────────

interface DbDocRow {
  id: string;
  status: string;
  document_type: SupplierDocumentType;
  supplier_id: string | null;
  supplier_name_raw: string;
  document_number: string;
  document_date: string | null;
  due_date: string | null;
  currency: string;
  subtotal_before_vat: number | null;
  vat_amount: number | null;
  total_after_vat: number | null;
  file_hash: string | null;
  linked_delivery_note_id: string | null;
  expense_record_id: string | null;
  notes: string;
}

interface DbLineRow {
  id: string;
  document_id: string;
  line_number: number;
  original_description: string;
  normalized_description: string;
  supplier_sku: string;
  quantity: number | null;
  unit_of_measure: string;
  unit_price: number | null;
  line_total: number | null;
  category: string;
  catalog_item_id: string | null;
  inventory_action: InventoryLineAction;
  status: string;
}

export interface PostingResult {
  success: boolean;
  expenseRecordId?: string;
  inventoryMovementsCreated: number;
  productDraftsCreated: number;
  mappingsUpdated: number;
  errors: string[];
  warnings: string[];
}

// ── Main posting function ─────────────────────────────────────────────────────

export async function postSupplierDocument(
  db: SupabaseClient,
  documentId: string,
  approvedBy: string
): Promise<PostingResult> {
  const result: PostingResult = {
    success: false,
    inventoryMovementsCreated: 0,
    productDraftsCreated: 0,
    mappingsUpdated: 0,
    errors: [],
    warnings: [],
  };

  // ── 1. Load document ──────────────────────────────────────────────────────
  const { data: docData, error: docErr } = await db
    .from("supplier_documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docErr || !docData) {
    result.errors.push(`מסמך לא נמצא: ${docErr?.message ?? "אין נתונים"}`);
    return result;
  }
  const doc = docData as DbDocRow;

  if (doc.status === "posted") {
    result.errors.push("מסמך כבר נרשם — לא ניתן לרשום פעמיים");
    return result;
  }
  if (doc.status === "rejected" || doc.status === "archived") {
    result.errors.push("לא ניתן לרשום מסמך שנדחה או הועבר לארכיון");
    return result;
  }

  // ── 2. Duplicate guard ────────────────────────────────────────────────────
  const dupCheck = await runDuplicateCheck(db, {
    documentId,
    fileHash: doc.file_hash ?? undefined,
    supplierId: doc.supplier_id ?? undefined,
    documentNumber: doc.document_number,
    documentDate: doc.document_date ?? undefined,
    totalAfterVat: doc.total_after_vat ?? undefined,
  });

  if (dupCheck.hasDuplicate) {
    const highConfidence = dupCheck.candidates.some(c => c.matchScore >= 0.9);
    if (highConfidence) {
      // Block posting — update status
      await db
        .from("supplier_documents")
        .update({ status: "duplicate_suspected", updated_at: new Date().toISOString() })
        .eq("id", documentId);
      result.errors.push(
        `חשד לכפילות — ${dupCheck.candidates[0].matchReason}. לא ניתן לרשום ללא אישור ידני.`
      );
      return result;
    }
    result.warnings.push(
      `אזהרת כפילות חלשה: ${dupCheck.candidates[0].matchReason} (ניתן להמשיך)`
    );
  }

  // ── 3. Load lines ─────────────────────────────────────────────────────────
  const { data: linesData, error: linesErr } = await db
    .from("supplier_document_lines")
    .select("*")
    .eq("document_id", documentId)
    .not("status", "eq", "excluded")
    .order("line_number");

  if (linesErr) {
    result.errors.push(`טעינת שורות נכשלה: ${linesErr.message}`);
    return result;
  }
  const lines = (linesData ?? []) as DbLineRow[];

  const now = new Date().toISOString();
  const expenseDate = doc.document_date ?? now.substring(0, 10);

  // ── 4. Create expense record (for financial document types) ───────────────
  let expenseRecordId: string | undefined;

  const isFinancialDoc = EXPENSE_DOCUMENT_TYPES.includes(doc.document_type);
  const isInformational = INFORMATIONAL_DOCUMENT_TYPES.includes(doc.document_type);

  if (isFinancialDoc && !isInformational) {
    const primaryCategory =
      lines.find(l => l.category)?.category ?? "לא מסווג / דורש בדיקה";

    const { data: expData, error: expErr } = await db
      .from("expense_records")
      .insert({
        supplier_id:    doc.supplier_id,
        document_id:    documentId,
        document_type:  doc.document_type,
        document_number: doc.document_number,
        expense_date:   expenseDate,
        due_date:       doc.due_date,
        category:       primaryCategory,
        subtotal:       doc.subtotal_before_vat ?? 0,
        vat_amount:     doc.vat_amount ?? 0,
        total_amount:   doc.total_after_vat ?? 0,
        currency:       doc.currency,
        payment_status: "unpaid",
        notes:          doc.notes,
        created_by:     approvedBy,
        approved_by:    approvedBy,
        approved_at:    now,
      })
      .select("id")
      .single();

    if (expErr || !expData) {
      await markFailed(db, documentId, `יצירת רשומת הוצאה נכשלה: ${expErr?.message}`);
      result.errors.push(`יצירת רשומת הוצאה נכשלה: ${expErr?.message}`);
      return result;
    }
    expenseRecordId = (expData as { id: string }).id;

    // Expense lines
    for (const line of lines) {
      await db.from("expense_lines").insert({
        expense_record_id: expenseRecordId,
        document_line_id:  line.id,
        description:       line.original_description,
        quantity:          line.quantity,
        unit_of_measure:   line.unit_of_measure,
        unit_price:        line.unit_price,
        line_total:        line.line_total ?? 0,
        category:          line.category,
        catalog_item_id:   line.catalog_item_id,
        inventory_action:  line.inventory_action,
      });
    }

    // Link expense to document
    await db
      .from("supplier_documents")
      .update({ expense_record_id: expenseRecordId })
      .eq("id", documentId);

    result.expenseRecordId = expenseRecordId;
  }

  // ── 5. Inventory movements for lines that require stock update ────────────
  const isInventoryDoc = INVENTORY_DOCUMENT_TYPES.includes(doc.document_type);

  if (isInventoryDoc) {
    for (const line of lines) {
      if (
        line.inventory_action !== "increase_stock" &&
        line.inventory_action !== "link_to_existing_product"
      ) {
        continue;
      }
      if (!line.catalog_item_id) {
        result.warnings.push(
          `שורה ${line.line_number}: "${line.original_description}" — ללא מוצר מקושר, דלג על עדכון מלאי`
        );
        continue;
      }

      const qty = line.quantity ?? 0;
      if (qty <= 0) {
        result.warnings.push(
          `שורה ${line.line_number}: כמות שגויה (${qty}) — דלג`
        );
        continue;
      }

      // Check if this line is from a delivery_note type document that is ALREADY
      // matched to an approved delivery_note record — avoid double-receiving
      if (doc.linked_delivery_note_id) {
        const { data: dnItem } = await db
          .from("delivery_note_items")
          .select("id,status")
          .eq("delivery_note_id", doc.linked_delivery_note_id)
          .eq("item_id", line.catalog_item_id)
          .eq("status", "approved")
          .limit(1)
          .single();

        if (dnItem) {
          result.warnings.push(
            `שורה ${line.line_number}: מלאי כבר עודכן מתעודת משלוח מקושרת — דלג`
          );
          continue;
        }
      }

      // Load current quantity
      const { data: catRow } = await db
        .from("catalog_items")
        .select("current_quantity,cost_price")
        .eq("id", line.catalog_item_id)
        .single();

      const prevCostPrice =
        (catRow as { current_quantity: number; cost_price: number | null } | null)
          ?.cost_price ?? null;
      const currentQty =
        (catRow as { current_quantity: number } | null)?.current_quantity ?? 0;

      // Write movement
      const { error: movErr } = await db.from("inventory_movements").insert({
        item_id:       line.catalog_item_id,
        movement_type: "receive",
        quantity:      qty,
        source_type:   "supplier_document",
        source_id:     documentId,
        notes:         `קליטה ממסמך ספק — ${line.original_description} | ${doc.document_number || documentId}`,
        created_by:    approvedBy,
        created_at:    now,
      });

      if (movErr) {
        result.warnings.push(
          `שורה ${line.line_number}: תנועת מלאי נכשלה — ${movErr.message}`
        );
        continue;
      }

      // Update catalog_items.current_quantity
      await db
        .from("catalog_items")
        .update({ current_quantity: currentQty + qty, updated_at: now })
        .eq("id", line.catalog_item_id);

      result.inventoryMovementsCreated++;

      // Warn if cost changed significantly
      if (line.unit_price != null && prevCostPrice != null && prevCostPrice > 0) {
        const changePct = Math.abs(line.unit_price - prevCostPrice) / prevCostPrice;
        if (changePct >= 0.1) {
          result.warnings.push(
            `שורה ${line.line_number}: שינוי מחיר ${Math.round(changePct * 100)}% ממחיר קנייה קודם`
          );
        }
      }

      // Update product-supplier mapping
      if (doc.supplier_id && line.unit_price != null && line.unit_price > 0) {
        await upsertProductSupplierMapping(db, {
          catalogItemId:   line.catalog_item_id,
          supplierId:      doc.supplier_id,
          supplierSku:     line.supplier_sku,
          supplierItemName: line.original_description,
          purchasePrice:   line.unit_price,
          currency:        doc.currency,
          unit:            line.unit_of_measure,
          purchaseDate:    expenseDate,
          sourceDocumentId: documentId,
          makePreferred:   false,
        });
        result.mappingsUpdated++;
      }
    }
  }

  // ── 6. Create product drafts for unmatched inventory lines ────────────────
  for (const line of lines) {
    if (line.inventory_action !== "create_product_draft") continue;

    // Create a catalog_items record in draft/inactive state
    const { data: draftData } = await db
      .from("catalog_items")
      .insert({
        name:             line.normalized_description || line.original_description,
        type:             "product",
        category:         line.category || "לא מסווג / דורש בדיקה",
        unit_of_measure:  line.unit_of_measure || "יחידה",
        default_price:    null,
        cost_price:       line.unit_price,
        description:      `טיוטה ממסמך ספק — ${doc.supplier_name_raw} | ${doc.document_number}`,
        is_active:        false,
        current_quantity: 0,
        minimum_quantity: 0,
        reserved_quantity: 0,
        supplier_id:      doc.supplier_id,
      })
      .select("id")
      .single();

    if (draftData) {
      // Mark line as product_draft_created
      await db
        .from("supplier_document_lines")
        .update({
          status: "product_draft_created",
          catalog_item_id: (draftData as { id: string }).id,
          updated_at: now,
        })
        .eq("id", line.id);
      result.productDraftsCreated++;
    }
  }

  // ── 7. Mark all non-draft lines as posted ─────────────────────────────────
  await db
    .from("supplier_document_lines")
    .update({ status: "posted", updated_at: now })
    .eq("document_id", documentId)
    .in("status", ["extracted", "matched", "needs_review"]);

  // ── 8. Mark document as posted ────────────────────────────────────────────
  await db
    .from("supplier_documents")
    .update({
      status:      "posted",
      approved_by: approvedBy,
      approved_at: now,
      posted_at:   now,
      updated_at:  now,
    })
    .eq("id", documentId);

  // ── 9. Write audit event ──────────────────────────────────────────────────
  await db.from("document_review_events").insert({
    document_id: documentId,
    event_type:  "posted",
    new_value:   "posted",
    notes:       `נרשם בהצלחה — ${result.inventoryMovementsCreated} תנועות מלאי, ${result.productDraftsCreated} טיוטות מוצר`,
    created_by:  approvedBy,
    created_at:  now,
  });

  result.success = true;
  return result;
}

async function markFailed(
  db: SupabaseClient,
  documentId: string,
  reason: string
): Promise<void> {
  await db
    .from("supplier_documents")
    .update({
      status:           "needs_review",
      extraction_notes: reason,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", documentId);
}

// ── Posting preview (read-only, no side effects) ──────────────────────────────

export async function buildPostingPreview(
  db: SupabaseClient,
  documentId: string
): Promise<import("@/types/supplierDocument").PostingPreview> {
  const { data: docData } = await db
    .from("supplier_documents")
    .select("id,document_type,supplier_id,supplier_name_raw,total_after_vat,vat_amount,status,file_hash,document_number,document_date")
    .eq("id", documentId)
    .single();

  const doc = docData as DbDocRow | null;

  const { data: linesData } = await db
    .from("supplier_document_lines")
    .select("inventory_action,catalog_item_id,status")
    .eq("document_id", documentId)
    .not("status", "eq", "excluded");

  const lines = (linesData ?? []) as {
    inventory_action: InventoryLineAction;
    catalog_item_id: string | null;
    status: string;
  }[];

  const inventoryLines = lines.filter(
    l => l.inventory_action === "increase_stock" || l.inventory_action === "link_to_existing_product"
  ).length;
  const serviceLines = lines.filter(
    l => l.inventory_action === "service_only" || l.inventory_action === "no_inventory_impact"
  ).length;
  const draftLines = lines.filter(
    l => l.inventory_action === "create_product_draft"
  ).length;
  const reviewLines = lines.filter(l => l.inventory_action === "requires_review").length;

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!doc) {
    errors.push("מסמך לא נמצא");
  } else {
    if (doc.status === "posted") errors.push("מסמך כבר נרשם");
    if (!doc.supplier_id) warnings.push("ספק לא מקושר");
    if (reviewLines > 0) warnings.push(`${reviewLines} שורות דורשות בדיקה לפני רישום`);
  }

  // Quick duplicate check (read-only)
  let dupRisk = false;
  if (doc?.file_hash) {
    const { data: hashDup } = await db
      .from("supplier_documents")
      .select("id")
      .eq("file_hash", doc.file_hash)
      .neq("id", documentId)
      .limit(1);
    if ((hashDup?.length ?? 0) > 0) dupRisk = true;
  }
  if (dupRisk) warnings.push("קובץ זהה כבר קיים במערכת — חשד לכפילות");

  return {
    documentId,
    willCreateExpense: doc
      ? EXPENSE_DOCUMENT_TYPES.includes(doc.document_type as SupplierDocumentType)
      : false,
    inventoryLineCount: inventoryLines,
    serviceLinesCount: serviceLines,
    productDraftCount: draftLines,
    willCreateSupplierDraft: !doc?.supplier_id,
    duplicateRisk: dupRisk,
    totalAmount: doc?.total_after_vat ?? undefined,
    vatAmount: doc?.vat_amount ?? undefined,
    supplierName: doc?.supplier_name_raw ?? "",
    warnings,
    errors,
    canPost: errors.length === 0,
  };
}
