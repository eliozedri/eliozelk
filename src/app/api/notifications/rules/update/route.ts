import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/apiAuth";

// Master-only: edit a notification rule's behavior flags and record an audit row per
// changed field (who / field / old / new / when). Only the EXISTING, wired columns are
// editable here. Web Push / display_mode / require_open_before_ack are not yet columns
// and are intentionally NOT writable (no inert policy fields added).
const BOOL_FIELDS = ["enabled", "requires_ack", "blocking", "play_sound", "show_in_center"] as const;
const SEVERITIES = ["info", "warning", "critical"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["master"]);
  if (!auth.ok) return auth.response;

  let body: { ruleId?: string; changes?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const ruleId = body.ruleId;
  const changes = body.changes ?? {};
  if (!ruleId) return NextResponse.json({ error: "ruleId required" }, { status: 400 });

  // Whitelist + validate.
  const update: Record<string, unknown> = {};
  for (const f of BOOL_FIELDS) {
    if (f in changes) {
      if (typeof changes[f] !== "boolean") return NextResponse.json({ error: `${f} must be boolean` }, { status: 400 });
      update[f] = changes[f];
    }
  }
  if ("severity" in changes) {
    if (!SEVERITIES.includes(changes.severity as (typeof SEVERITIES)[number])) {
      return NextResponse.json({ error: "invalid severity" }, { status: 400 });
    }
    update.severity = changes.severity;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "no valid fields" }, { status: 400 });

  const db = getServiceSupabase();
  const { data: before, error: selErr } = await db
    .from("notification_rules")
    .select("id, event_type, enabled, severity, requires_ack, blocking, play_sound, show_in_center")
    .eq("id", ruleId)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "rule not found" }, { status: 404 });

  const beforeRec = before as Record<string, unknown>;
  const realChanges = Object.entries(update)
    .filter(([field, newVal]) => beforeRec[field] !== newVal)
    .map(([field, newVal]) => ({ field, old: beforeRec[field], new: newVal }));
  if (realChanges.length === 0) return NextResponse.json({ ok: true, unchanged: true });

  const { error: upErr } = await db
    .from("notification_rules")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", ruleId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const auditRows = realChanges.map(c => ({
    rule_id: ruleId,
    rule_event_type: (beforeRec.event_type as string) ?? null,
    field: c.field,
    old_value: c.old === null || c.old === undefined ? null : String(c.old),
    new_value: c.new === null || c.new === undefined ? null : String(c.new),
    changed_by: auth.user.id,
    changed_by_name: auth.user.profile.name || null,
  }));
  const { error: auditErr } = await db.from("notification_admin_audit_log").insert(auditRows);
  if (auditErr) console.error("[notifications] admin audit insert failed:", auditErr.message);

  return NextResponse.json({ ok: true, changed: realChanges.map(c => c.field) });
}
