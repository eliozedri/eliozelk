import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/apiAuth";

const ALLOWED_EVENTS = ["order.created", "diary.submitted", "field.issue"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["master", "office_manager", "fleet_manager"]);
  if (!auth.ok) return auth.response;

  let body: { eventType?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const eventType = body.eventType ?? "field.issue";
  if (!ALLOWED_EVENTS.includes(eventType as (typeof ALLOWED_EVENTS)[number])) {
    return NextResponse.json({ error: "unknown eventType" }, { status: 400 });
  }

  const db = getServiceSupabase();
  const { data: rule, error: ruleErr } = await db
    .from("notification_rules").select("*").eq("event_type", eventType).eq("enabled", true).maybeSingle();
  if (ruleErr) return NextResponse.json({ error: ruleErr.message }, { status: 500 });
  if (!rule) return NextResponse.json({ error: "rule not found/disabled" }, { status: 404 });

  // A blocking rule needs a related entity so view-before-ack can be exercised.
  const withEntity = rule.blocking === true;

  const { data: notif, error: insErr } = await db
    .from("notifications")
    .insert({
      event_type: rule.event_type,
      rule_id: rule.id,
      title: `${rule.title} (בדיקה)`,
      message: rule.message,
      severity: rule.severity,
      source_module: rule.source_module,
      related_entity_type: withEntity ? "work_order" : null,
      related_entity_id: withEntity ? "DEMO" : null,
      requires_ack: rule.requires_ack,
      blocking: rule.blocking,
      play_sound: rule.play_sound,
      metadata: { demo: true },
    })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const { error: recErr } = await db.from("notification_recipients").insert({
    notification_id: notif.id,
    user_id: auth.user.id,
    matched_role: auth.user.profile.role,
    status: "pending",
  });
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, notificationId: notif.id });
}
