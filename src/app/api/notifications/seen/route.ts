import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { recipientIds?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const ids = Array.isArray(body.recipientIds) ? body.recipientIds.filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  const db = getServiceSupabase();
  // Only mark the caller's own rows, and only those not yet seen/acknowledged.
  const { data, error } = await db
    .from("notification_recipients")
    .update({ status: "seen", seen_at: new Date().toISOString() })
    .in("id", ids)
    .eq("user_id", auth.user.id)
    .in("status", ["pending", "delivered"])
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
}
