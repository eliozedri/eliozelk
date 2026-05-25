import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";
import { serverAckAllowed } from "@/lib/notifications/state";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { recipientId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const recipientId = body.recipientId;
  if (!recipientId) return NextResponse.json({ error: "recipientId required" }, { status: 400 });

  const db = getServiceSupabase();
  const { data: rec, error } = await db
    .from("notification_recipients")
    .select("id, user_id, related_opened_at, status, notification_id, notifications(related_entity_type, notification_rules(require_open_before_ack))")
    .eq("id", recipientId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isMaster = auth.user.profile.role === "master";
  if (rec.user_id !== auth.user.id && !isMaster) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const related = rec as unknown as {
    related_opened_at: string | null;
    status: string;
    notification_id: string;
    user_id: string;
    notifications: {
      related_entity_type: string | null;
      notification_rules: { require_open_before_ack: boolean } | null;
    } | null;
  };
  const relatedType = related.notifications?.related_entity_type ?? null;
  const relatedOpenedAt = related.related_opened_at ?? null;
  // Default true when the rule is unknown (deleted) — never relax view-before-ack implicitly.
  const requireOpen = related.notifications?.notification_rules?.require_open_before_ack ?? true;

  if (!serverAckAllowed(relatedType, relatedOpenedAt, requireOpen)) {
    return NextResponse.json({ error: "must_open_item_first" }, { status: 400 });
  }
  if (related.status === "acknowledged") return NextResponse.json({ ok: true, already: true });

  const now = new Date().toISOString();
  const ackDirect = relatedType == null;

  const { error: upErr } = await db
    .from("notification_recipients")
    .update({ status: "acknowledged", acknowledged_at: now, ack_was_direct: ackDirect, resolution: "acknowledged" })
    .eq("id", recipientId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error: auditErr } = await db.from("notification_acknowledgements").insert({
    notification_id: related.notification_id,
    recipient_id: recipientId,
    user_id: related.user_id,
    acknowledged_at: now,
    related_opened_at: relatedOpenedAt,
    ack_was_direct: ackDirect,
    device_info: { ua: req.headers.get("user-agent") ?? null },
  });
  if (auditErr) {
    // Authoritative ack already persisted on the recipient row above; the audit
    // row is supplementary. Surface the failure in logs without failing the
    // request (which would leave the user unable to clear the blocking gate).
    console.error("[notifications] acknowledgement audit insert failed:", auditErr.message);
  }

  return NextResponse.json({ ok: true });
}
