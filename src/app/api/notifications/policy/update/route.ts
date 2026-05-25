import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/apiAuth";

// Master-only: edit the single-row global notification setup policy and record one
// audit row per changed field (rule_id null, rule_event_type='_policy_'). These are the
// SEPARATE gate layers — stored here, enforced by the client setup gate only when the
// flag is on. Defaults are all false, so an untouched policy blocks nothing.
const BOOL_FIELDS = [
  "require_pwa_installation",
  "require_push_permission",
  "block_work_until_push_setup_complete",
] as const;

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["master"]);
  if (!auth.ok) return auth.response;

  let body: { changes?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const changes = body.changes ?? {};

  const update: Record<string, unknown> = {};
  for (const f of BOOL_FIELDS) {
    if (f in changes) {
      if (typeof changes[f] !== "boolean") return NextResponse.json({ error: `${f} must be boolean` }, { status: 400 });
      update[f] = changes[f];
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "no valid fields" }, { status: 400 });

  const db = getServiceSupabase();
  const { data: before, error: selErr } = await db
    .from("notification_policy")
    .select("require_pwa_installation, require_push_permission, block_work_until_push_setup_complete")
    .eq("id", true)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

  const beforeRec = (before as Record<string, unknown>) ?? {};
  const realChanges = Object.entries(update)
    .filter(([field, newVal]) => beforeRec[field] !== newVal)
    .map(([field, newVal]) => ({ field, old: beforeRec[field], new: newVal }));
  if (realChanges.length === 0) return NextResponse.json({ ok: true, unchanged: true });

  const { error: upErr } = await db
    .from("notification_policy")
    .update({ ...update, updated_at: new Date().toISOString(), updated_by: auth.user.id })
    .eq("id", true);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const auditRows = realChanges.map(c => ({
    rule_id: null,
    rule_event_type: "_policy_",
    field: c.field,
    old_value: c.old === null || c.old === undefined ? null : String(c.old),
    new_value: c.new === null || c.new === undefined ? null : String(c.new),
    changed_by: auth.user.id,
    changed_by_name: auth.user.profile.name || null,
  }));
  const { error: auditErr } = await db.from("notification_admin_audit_log").insert(auditRows);
  if (auditErr) console.error("[notifications] policy audit insert failed:", auditErr.message);

  return NextResponse.json({ ok: true, changed: realChanges.map(c => c.field) });
}
