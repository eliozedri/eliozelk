import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { approveDeliveryNote } from "@/lib/inventory/deliveryNotes";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getServiceSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// POST /api/inventory/delivery-notes/[id]/approve
// Idempotent: already-approved items are skipped. Never double-receives stock.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getServiceSupabase();

  const { data: profile } = await db.from("profiles").select("name").eq("id", userId).single();
  const approvedBy = (profile as { name?: string } | null)?.name ?? userId;

  const result = await approveDeliveryNote(db, id, approvedBy);

  if (result.errors.length > 0) {
    return NextResponse.json({ error: result.errors[0], details: result }, { status: 500 });
  }

  return NextResponse.json(result);
}
