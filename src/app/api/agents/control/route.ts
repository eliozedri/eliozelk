// Server-side agent control-table writes (approve/reject approvals, ack/dismiss
// exceptions, update task status). Previously these were written directly from the
// browser (useAgents) against the permissive `auth.role()='authenticated'` RLS,
// which let any signed-in user flip an approval. This route moves them server-side,
// gated to agent-management roles (verifyMasterAuth) and audited (logAgentAction),
// so the agent_* control tables can become service-role-write-only.
//
// Isolated from the CEO-agent / Tier-B price flow, which uses a different table
// (jarvis_ceo_agent_commands) and service-role server actions — untouched here.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { verifyMasterAuth, logAgentAction } from "@/lib/agents/scan-utils";

export const dynamic = "force-dynamic";

type Body =
  | { kind: "approval"; id: string; status: "approved" | "rejected"; reason?: string }
  | { kind: "exception_dismiss"; id: string }
  | { kind: "exception_ack"; id: string }
  | { kind: "task_status"; id: string; status: string }
  | { kind: "task_assign"; id: string; assignedTo: string | null };

function bearer(req: NextRequest): string | undefined {
  const raw = req.headers.get("authorization") ?? "";
  const t = raw.replace(/^Bearer\s+/i, "").trim();
  return t.length > 0 ? t : undefined;
}

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const userId = await verifyMasterAuth(db, bearer(req));
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.kind || !body?.id) {
    return NextResponse.json({ error: "Missing kind or id" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let error: string | null = null;

  if (body.kind === "approval") {
    if (body.status !== "approved" && body.status !== "rejected") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const res = await db
      .from("agent_approvals")
      .update({
        approval_status: body.status,
        approved_at: body.status === "approved" ? now : null,
        rejected_reason: body.status === "rejected" ? (body.reason ?? null) : null,
      })
      .eq("id", body.id);
    error = res.error?.message ?? null;
  } else if (body.kind === "exception_dismiss" || body.kind === "exception_ack") {
    const status = body.kind === "exception_dismiss" ? "dismissed" : "acknowledged";
    const res = await db.from("agent_exceptions").update({ status }).eq("id", body.id);
    error = res.error?.message ?? null;
  } else if (body.kind === "task_status") {
    if (!body.status) return NextResponse.json({ error: "Missing status" }, { status: 400 });
    const res = await db.from("agent_tasks").update({ status: body.status }).eq("id", body.id);
    error = res.error?.message ?? null;
  } else if (body.kind === "task_assign") {
    // Persistent assignment — sets agent_tasks.assigned_to (idempotent). Pass null to clear.
    const res = await db
      .from("agent_tasks")
      .update({ assigned_to: body.assignedTo ?? null })
      .eq("id", body.id);
    error = res.error?.message ?? null;
  } else {
    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  }

  // Best-effort audit; never fail the request on a logging error.
  try {
    await logAgentAction(
      db,
      "agent-control",
      body.kind,
      { id: body.id, by: userId, ...("status" in body ? { status: body.status } : {}) },
      error ? "error" : "success",
      error ?? undefined,
    );
  } catch { /* audit best-effort */ }

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
