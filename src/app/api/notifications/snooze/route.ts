import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";

// Snooze a still-pending acknowledgement: push the next reminder out by N minutes. Reuses
// next_reminder_at, which the worker already honors. Scoped to the caller's own row (or
// master). Snoozing never acknowledges — the item stays pending until acked in-app.
const MAX_MINUTES = 24 * 60;

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { recipientId?: string; minutes?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const recipientId = body.recipientId;
  const minutes = body.minutes;
  if (!recipientId) return NextResponse.json({ error: "recipientId required" }, { status: 400 });
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_MINUTES) {
    return NextResponse.json({ error: "minutes must be 1..1440" }, { status: 400 });
  }

  const db = getServiceSupabase();
  const { data: rec, error } = await db
    .from("notification_recipients")
    .select("id, user_id, status")
    .eq("id", recipientId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isMaster = auth.user.profile.role === "master";
  if (rec.user_id !== auth.user.id && !isMaster) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (rec.status === "acknowledged" || rec.status === "expired") {
    return NextResponse.json({ error: "not snoozable" }, { status: 400 });
  }

  const nextAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const { error: upErr } = await db
    .from("notification_recipients")
    .update({ next_reminder_at: nextAt })
    .eq("id", recipientId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, next_reminder_at: nextAt });
}
