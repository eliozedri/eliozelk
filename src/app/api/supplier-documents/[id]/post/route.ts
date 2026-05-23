import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";
import { postSupplierDocument } from "@/lib/supplierDocuments/posting";

// POST /api/supplier-documents/[id]/post — approve and post document.
// post_supplier_document resolves to master / finance_manager / procurement_manager.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAction(req, "post_supplier_document");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getServiceSupabase();
  const userName = auth.user.profile.name || auth.user.id;

  const result = await postSupplierDocument(db, id, userName);

  if (!result.success) {
    return NextResponse.json({ error: result.errors.join("; "), result }, { status: 422 });
  }

  return NextResponse.json(result);
}
