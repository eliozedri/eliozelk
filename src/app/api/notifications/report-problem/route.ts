import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";
import { serverAckAllowed } from "@/lib/notifications/state";

// Resolve an order notification by REPORTING A PROBLEM (distinct from acknowledging
// receipt). Like acknowledge: requires the related item to have been opened first.
// Records resolution='problem_reported' + an immutable audit row with the description.
// (Wiring this to create an order_problems row / fire field.issue escalation is a
// documented follow-up; this route records the distinct, auditable problem response.)
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { recipientId?: string; description?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const recipientId = body.recipientId;
  if (!recipientId) return NextResponse.json({ error: "recipientId required" }, { status: 400 });
  const description = typeof body.description === "string" ? body.description.slice(0, 2000) : null;

  const db = getServiceSupabase();
  const { data: rec, error } = await db
    .from("notification_recipients")
    .select("id, user_id, related_opened_at, status, notification_id, notifications(related_entity_type, related_entity_id)")
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
    notifications: { related_entity_type: string | null; related_entity_id: string | null } | null;
  };
  const relatedType = related.notifications?.related_entity_type ?? null;
  const relatedId = related.notifications?.related_entity_id ?? null;
  const relatedOpenedAt = related.related_opened_at ?? null;

  if (!serverAckAllowed(relatedType, relatedOpenedAt)) {
    return NextResponse.json({ error: "must_open_item_first" }, { status: 400 });
  }
  if (related.status === "acknowledged") return NextResponse.json({ ok: true, already: true });

  const now = new Date().toISOString();
  const { error: upErr } = await db
    .from("notification_recipients")
    .update({ status: "acknowledged", acknowledged_at: now, resolution: "problem_reported" })
    .eq("id", recipientId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error: auditErr } = await db.from("notification_acknowledgements").insert({
    notification_id: related.notification_id,
    recipient_id: recipientId,
    user_id: related.user_id,
    acknowledged_at: now,
    related_opened_at: relatedOpenedAt,
    ack_was_direct: relatedType == null,
    device_info: {
      ua: req.headers.get("user-agent") ?? null,
      kind: "problem_reported",
      related_entity_type: relatedType,
      related_entity_id: relatedId,
      problem_description: description,
    },
  });
  if (auditErr) {
    console.error("[notifications] problem-report audit insert failed:", auditErr.message);
  }

  return NextResponse.json({ ok: true });
}
