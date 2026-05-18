import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = getServiceSupabase();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// POST /api/supplier-documents/[id]/reject
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getServiceSupabase();

  const { data: profile } = await db
    .from("profiles")
    .select("name,role")
    .eq("id", userId)
    .single();
  const p = profile as { name?: string; role?: string } | null;
  const userName = p?.name ?? userId;

  let body: { reason?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const now = new Date().toISOString();

  const { error } = await db
    .from("supplier_documents")
    .update({
      status:           "rejected",
      rejection_reason: body.reason ?? "נדחה על ידי משתמש",
      updated_at:       now,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("document_review_events").insert({
    document_id: id,
    event_type:  "rejected",
    new_value:   "rejected",
    notes:       body.reason ?? "נדחה",
    created_by:  userName,
    created_at:  now,
  });

  return NextResponse.json({ ok: true });
}
