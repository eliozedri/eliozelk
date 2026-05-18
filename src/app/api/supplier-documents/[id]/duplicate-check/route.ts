import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { runDuplicateCheck } from "@/lib/supplierDocuments/duplicateCheck";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = getServiceSupabase();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// POST /api/supplier-documents/[id]/duplicate-check
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getServiceSupabase();

  // Load document fields needed for duplicate check
  const { data: doc, error: docErr } = await db
    .from("supplier_documents")
    .select("id,file_hash,supplier_id,supplier_name_raw,document_number,document_date,total_after_vat")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "מסמך לא נמצא" }, { status: 404 });
  }

  const d = doc as {
    id: string;
    file_hash: string | null;
    supplier_id: string | null;
    supplier_name_raw: string;
    document_number: string;
    document_date: string | null;
    total_after_vat: number | null;
  };

  const result = await runDuplicateCheck(db, {
    documentId:      id,
    fileHash:        d.file_hash ?? undefined,
    supplierId:      d.supplier_id ?? undefined,
    supplierNameRaw: d.supplier_name_raw,
    documentNumber:  d.document_number,
    documentDate:    d.document_date ?? undefined,
    totalAfterVat:   d.total_after_vat ?? undefined,
  });

  // If duplicates found, mark document status
  if (result.hasDuplicate && result.candidates.some(c => c.matchScore >= 0.9)) {
    await db
      .from("supplier_documents")
      .update({ status: "duplicate_suspected", updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  return NextResponse.json(result);
}
