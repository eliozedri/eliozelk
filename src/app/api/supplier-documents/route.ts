import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { nanoid } from "nanoid";
import type { SupplierDocumentType, PaymentStatus } from "@/types/supplierDocument";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = getServiceSupabase();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// GET /api/supplier-documents — list documents with optional filters
export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getServiceSupabase();
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const supplierId = searchParams.get("supplierId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  let q = db
    .from("supplier_documents")
    .select(`
      id, status, document_type, supplier_id, supplier_name_raw, supplier_vat_raw,
      document_number, document_date, due_date, currency,
      subtotal_before_vat, vat_amount, vat_rate, total_after_vat,
      payment_status, linked_order_ref, linked_delivery_note_id,
      file_name, file_type, file_url, notes, rejection_reason,
      expense_record_id, created_by, approved_by, approved_at, posted_at,
      created_at, updated_at,
      suppliers ( id, name, vat_number, phone, email, whatsapp, address, city, contact_person )
    `)
    .not("status", "in", '("archived")')
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);
  if (supplierId) q = q.eq("supplier_id", supplierId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/supplier-documents — create a new document record (manual or post-upload)
export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getServiceSupabase();
  const { data: profile } = await db
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .single();
  const createdBy = (profile as { name?: string } | null)?.name ?? userId;

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
    notes?: string;
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    fileHash?: string;
    rawText?: string;
    lines?: Array<{
      lineNumber: number;
      originalDescription: string;
      normalizedDescription?: string;
      supplierSku?: string;
      quantity?: number;
      unitOfMeasure?: string;
      unitPrice?: number;
      discountPercent?: number;
      lineSubtotal?: number;
      lineTotal?: number;
      category?: string;
      catalogItemId?: string;
      inventoryAction?: string;
    }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const docId = nanoid();
  const now = new Date().toISOString();

  const { error: insertErr } = await db.from("supplier_documents").insert({
    id:                  docId,
    status:              "draft_ready",
    document_type:       body.documentType ?? "unknown",
    supplier_id:         body.supplierId ?? null,
    supplier_name_raw:   body.supplierNameRaw ?? "",
    supplier_vat_raw:    body.supplierVatRaw ?? "",
    document_number:     body.documentNumber ?? "",
    document_date:       body.documentDate ?? null,
    due_date:            body.dueDate ?? null,
    currency:            body.currency ?? "ILS",
    subtotal_before_vat: body.subtotalBeforeVat ?? null,
    vat_amount:          body.vatAmount ?? null,
    vat_rate:            body.vatRate ?? 17,
    total_after_vat:     body.totalAfterVat ?? null,
    payment_status:      body.paymentStatus ?? "unpaid",
    linked_order_ref:    body.linkedOrderRef ?? "",
    notes:               body.notes ?? "",
    file_url:            body.fileUrl ?? null,
    file_name:           body.fileName ?? "",
    file_type:           body.fileType ?? "",
    file_hash:           body.fileHash ?? null,
    raw_text:            body.rawText ?? null,
    created_by:          createdBy,
    created_at:          now,
    updated_at:          now,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Insert lines if provided
  if (body.lines && body.lines.length > 0) {
    const lineRows = body.lines.map(l => ({
      document_id:           docId,
      line_number:           l.lineNumber,
      original_description:  l.originalDescription,
      normalized_description: l.normalizedDescription ?? l.originalDescription,
      supplier_sku:          l.supplierSku ?? "",
      quantity:              l.quantity ?? null,
      unit_of_measure:       l.unitOfMeasure ?? "",
      unit_price:            l.unitPrice ?? null,
      discount_percent:      l.discountPercent ?? null,
      line_subtotal:         l.lineSubtotal ?? null,
      line_total:            l.lineTotal ?? null,
      category:              l.category ?? "",
      catalog_item_id:       l.catalogItemId ?? null,
      inventory_action:      l.inventoryAction ?? "requires_review",
      status:                "extracted",
      confidence_score:      1.0,
      warning_flags:         [],
    }));
    const { error: lineErr } = await db.from("supplier_document_lines").insert(lineRows);
    if (lineErr) {
      return NextResponse.json(
        { error: `שורות נוספו בחלקן: ${lineErr.message}`, id: docId },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ id: docId }, { status: 201 });
}
