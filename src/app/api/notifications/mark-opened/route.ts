import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { recipientId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!body.recipientId) return NextResponse.json({ error: "recipientId required" }, { status: 400 });

  const db = getServiceSupabase();
  const { data: rec, error } = await db
    .from("notification_recipients")
    .select("id, user_id, related_opened_at")
    .eq("id", body.recipientId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isMaster = auth.user.profile.role === "master";
  if (rec.user_id !== auth.user.id && !isMaster) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!rec.related_opened_at) {
    const { error: upErr } = await db
      .from("notification_recipients")
      .update({ related_opened_at: new Date().toISOString() })
      .eq("id", body.recipientId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
