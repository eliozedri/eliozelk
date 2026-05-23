import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";
import { approveDeliveryNote } from "@/lib/inventory/deliveryNotes";

// POST /api/inventory/delivery-notes/[id]/approve
// Idempotent: already-approved items are skipped. Never double-receives stock.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAction(req, "post_supplier_document");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getServiceSupabase();

  const { data: profile } = await db.from("profiles").select("name").eq("id", auth.user.id).single();
  const approvedBy = (profile as { name?: string } | null)?.name ?? auth.user.id;

  const result = await approveDeliveryNote(db, id, approvedBy);

  if (result.errors.length > 0) {
    return NextResponse.json({ error: result.errors[0], details: result }, { status: 500 });
  }

  return NextResponse.json(result);
}
