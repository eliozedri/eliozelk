import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth, requireAction } from "@/lib/auth/apiAuth";
import type { SupplierDocumentType, PaymentStatus, InventoryLineAction } from "@/types/supplierDocument";

// ── camelCase mappers (Supabase returns snake_case) ───────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDocumentToCamelCase(doc: Record<string, any>) {
  return {
    id: doc.id,
    status: doc.status,
    documentType: doc.document_type,
    supplierId: doc.supplier_id,
    supplierNameRaw: doc.supplier_name_raw,
    supplierVatRaw: doc.supplier_vat_raw,
    documentNumber: doc.document_number,
    documentDate: doc.document_date,
    dueDate: doc.due_date,
    currency: doc.currency,
    subtotalBeforeVat: doc.subtotal_before_vat,
    vatAmount: doc.vat_amount,
    vatRate: doc.vat_rate,
    totalAfterVat: doc.total_after_vat,
    paymentStatus: doc.payment_status,
    linkedOrderRef: doc.linked_order_ref,
    linkedDeliveryNoteId: doc.linked_delivery_note_id,
    rawText: doc.raw_text,
    parsedJson: doc.parsed_json,
    extractionConfidence: doc.extraction_confidence,
    extractionNotes: doc.extraction_notes,
    fileUrl: doc.file_url,
    fileName: doc.file_name,
    fileType: doc.file_type,
    fileHash: doc.file_hash,
    notes: doc.notes,
    rejectionReason: doc.rejection_reason,
    expenseRecordId: doc.expense_record_id,
    createdBy: doc.created_by,
    reviewedBy: doc.reviewed_by,
    approvedBy: doc.approved_by,
    approvedAt: doc.approved_at,
    postedAt: doc.posted_at,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    equipmentId: doc.equipment_id,
    linkedMaintenanceId: doc.linked_maintenance_id,
    linkedIncidentId: doc.linked_incident_id,
    uploadSource: doc.upload_source,
    businessArea: doc.business_area,
    expenseType: doc.expense_type,
    requiresClassification: doc.requires_classification,
    suppliers: doc.suppliers, // kept snake_case — DocumentReview reads sub-fields directly
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLineToCamelCase(line: Record<string, any>) {
  return {
    id: line.id,
    documentId: line.document_id,
    lineNumber: line.line_number,
    originalDescription: line.original_description,
    normalizedDescription: line.normalized_description,
    supplierSku: line.supplier_sku,
    quantity: line.quantity,
    unitOfMeasure: line.unit_of_measure,
    unitPrice: line.unit_price,
    discountPercent: line.discount_percent,
    lineSubtotal: line.line_subtotal,
    lineTotal: line.line_total,
    category: line.category,
    catalogItemId: line.catalog_item_id,
    inventoryAction: line.inventory_action,
    status: line.status,
    confidenceScore: line.confidence_score,
    warningFlags: line.warning_flags ?? [],
    createdAt: line.created_at,
    updatedAt: line.updated_at,
    catalog_items: line.catalog_items, // kept snake_case — DocumentReview reads sub-fields directly
  };
}

// GET /api/supplier-documents/[id] — full document with lines and supplier
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getServiceSupabase();

  const { data: doc, error: docErr } = await db
    .from("supplier_documents")
    .select(`
      *,
      suppliers ( id, name, vat_number, phone, email, whatsapp, address, city, contact_person )
    `)
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "מסמך לא נמצא" }, { status: 404 });
  }

  const { data: lines } = await db
    .from("supplier_document_lines")
    .select(`
      *,
      catalog_items ( id, name, current_quantity, minimum_quantity, cost_price, unit_of_measure )
    `)
    .eq("document_id", id)
    .order("line_number");

  const { data: events } = await db
    .from("document_review_events")
    .select("id,event_type,field_name,old_value,new_value,notes,created_by,created_at")
    .eq("document_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: dupChecks } = await db
    .from("document_duplicate_checks")
    .select("id,check_type,match_score,result,details,override_approved,created_at")
    .eq("document_id", id)
    .order("match_score", { ascending: false });

  return NextResponse.json({
    ...mapDocumentToCamelCase(doc as Record<string, unknown>),
    lines: (lines ?? []).map(l => mapLineToCamelCase(l as Record<string, unknown>)),
    reviewEvents: events ?? [],
    duplicateChecks: dupChecks ?? [],
  });
}

// PATCH /api/supplier-documents/[id] — update document header or line fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAction(req, "review_supplier_document");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getServiceSupabase();

  const { data: profile } = await db
    .from("profiles")
    .select("name")
    .eq("id", auth.user.id)
    .single();
  const userName = (profile as { name?: string } | null)?.name ?? auth.user.id;

  // Verify document exists and is not posted/archived
  const { data: existing } = await db
    .from("supplier_documents")
    .select("id,status")
    .eq("id", id)
    .single();

  if (!existing) return NextResponse.json({ error: "מסמך לא נמצא" }, { status: 404 });
  const ex = existing as { id: string; status: string };
  if (ex.status === "posted" || ex.status === "archived") {
    return NextResponse.json({ error: "לא ניתן לערוך מסמך שנרשם או הועבר לארכיון" }, { status: 409 });
  }

  let body: {
    documentType?: SupplierDocumentType;
    supplierId?: string;
    supplierNameRaw?: string;
    supplierVatRaw?: string;
    documentNumber?: string;
    documentDate?: string;
    dueDate?: string;
    currency?: string;
    subtotalBeforeVat?: number;
    vatAmount?: number;
    vatRate?: number;
    totalAfterVat?: number;
    paymentStatus?: PaymentStatus;
    linkedOrderRef?: string;
    linkedDeliveryNoteId?: string;
    notes?: string;
    status?: string;
    // Fleet ↔ finance link + classification
    equipmentId?: string | null;
    linkedMaintenanceId?: string | null;
    linkedIncidentId?: string | null;
    uploadSource?: string;
    businessArea?: string | null;
    expenseType?: string | null;
    requiresClassification?: boolean;
    // Line updates
    lineUpdates?: Array<{
      id: string;
      category?: string;
      inventoryAction?: InventoryLineAction;
      catalogItemId?: string | null;
      quantity?: number;
      unitPrice?: number;
      unitOfMeasure?: string;
      normalizedDescription?: string;
      status?: string;
    }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Build document update payload
  const docUpdate: Record<string, unknown> = { updated_at: now };
  if (body.documentType !== undefined) docUpdate.document_type = body.documentType;
  if (body.supplierId !== undefined) docUpdate.supplier_id = body.supplierId;
  if (body.supplierNameRaw !== undefined) docUpdate.supplier_name_raw = body.supplierNameRaw;
  if (body.supplierVatRaw !== undefined) docUpdate.supplier_vat_raw = body.supplierVatRaw;
  if (body.documentNumber !== undefined) docUpdate.document_number = body.documentNumber;
  if (body.documentDate !== undefined) docUpdate.document_date = body.documentDate;
  if (body.dueDate !== undefined) docUpdate.due_date = body.dueDate;
  if (body.currency !== undefined) docUpdate.currency = body.currency;
  if (body.subtotalBeforeVat !== undefined) docUpdate.subtotal_before_vat = body.subtotalBeforeVat;
  if (body.vatAmount !== undefined) docUpdate.vat_amount = body.vatAmount;
  if (body.vatRate !== undefined) docUpdate.vat_rate = body.vatRate;
  if (body.totalAfterVat !== undefined) docUpdate.total_after_vat = body.totalAfterVat;
  if (body.paymentStatus !== undefined) docUpdate.payment_status = body.paymentStatus;
  if (body.linkedOrderRef !== undefined) docUpdate.linked_order_ref = body.linkedOrderRef;
  if (body.linkedDeliveryNoteId !== undefined) docUpdate.linked_delivery_note_id = body.linkedDeliveryNoteId;
  if (body.notes !== undefined) docUpdate.notes = body.notes;
  if (body.status !== undefined) docUpdate.status = body.status;
  if (body.equipmentId !== undefined) docUpdate.equipment_id = body.equipmentId;
  if (body.linkedMaintenanceId !== undefined) docUpdate.linked_maintenance_id = body.linkedMaintenanceId;
  if (body.linkedIncidentId !== undefined) docUpdate.linked_incident_id = body.linkedIncidentId;
  if (body.uploadSource !== undefined) docUpdate.upload_source = body.uploadSource;
  if (body.businessArea !== undefined) docUpdate.business_area = body.businessArea;
  if (body.expenseType !== undefined) {
    docUpdate.expense_type = body.expenseType;
    // Classifying clears the "requires classification" flag unless explicitly set.
    if (body.requiresClassification === undefined) docUpdate.requires_classification = body.expenseType ? false : true;
  }
  if (body.requiresClassification !== undefined) docUpdate.requires_classification = body.requiresClassification;

  if (Object.keys(docUpdate).length > 1) {
    const { error: updateErr } = await db
      .from("supplier_documents")
      .update(docUpdate)
      .eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Apply line updates
  if (body.lineUpdates && body.lineUpdates.length > 0) {
    for (const lu of body.lineUpdates) {
      const lineUpdate: Record<string, unknown> = { updated_at: now };
      if (lu.category !== undefined) lineUpdate.category = lu.category;
      if (lu.inventoryAction !== undefined) lineUpdate.inventory_action = lu.inventoryAction;
      if (lu.catalogItemId !== undefined) lineUpdate.catalog_item_id = lu.catalogItemId;
      if (lu.quantity !== undefined) lineUpdate.quantity = lu.quantity;
      if (lu.unitPrice !== undefined) lineUpdate.unit_price = lu.unitPrice;
      if (lu.unitOfMeasure !== undefined) lineUpdate.unit_of_measure = lu.unitOfMeasure;
      if (lu.normalizedDescription !== undefined) lineUpdate.normalized_description = lu.normalizedDescription;
      if (lu.status !== undefined) lineUpdate.status = lu.status;

      await db.from("supplier_document_lines").update(lineUpdate).eq("id", lu.id);
    }
  }

  // Write audit event
  await db.from("document_review_events").insert({
    document_id: id,
    event_type:  "edited",
    notes:       "עריכה ידנית על ידי משתמש",
    created_by:  userName,
    created_at:  now,
  });

  return NextResponse.json({ ok: true });
}
