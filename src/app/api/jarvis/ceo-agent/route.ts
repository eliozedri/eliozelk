import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { actionLabel, resolveActionType } from "@/lib/jarvis/actionCatalog";

/**
 * POST /api/jarvis/ceo-agent?v=1
 *
 * The Elkayam CEO-Agent COMMAND INTAKE. JARVIS (the owner's personal AI
 * operator) sends a signed structured task/request here; the CEO-Agent receives
 * it as a `pending_review` control task that the owner reviews + decides in the
 * Elkayam UI (/jarvis-requests).
 *
 * Tier-A guarantees (hard):
 *   • Stores the request only. NO catalog / pricing / finance / fleet / order /
 *     customer business mutation. No automatic execution.
 *   • Bearer-auth'd (JARVIS_CEO_AGENT_TOKEN, constant-time) + ?v=1 version gate.
 *   • Idempotent on correlation_id (a replay returns the existing row).
 *   • Unknown action types → status 'unsupported_action' (never stored as
 *     actionable).
 *
 * Returns: { status, intake_id, correlation_id }.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CeoIntakeResponse = {
  status: "received" | "pending_review" | "rejected" | "needs_info" | "unsupported_action";
  intake_id: string | null;
  correlation_id: string | null;
  detail?: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.searchParams.get("v") !== "1") {
    return json(400, { status: "rejected", intake_id: null, correlation_id: null, detail: "bad_version" });
  }

  const expected = process.env.JARVIS_CEO_AGENT_TOKEN ?? "";
  if (!expected) {
    return json(503, { status: "rejected", intake_id: null, correlation_id: null, detail: "not_configured" });
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!provided || !constantTimeEqual(provided, expected)) {
    return json(401, { status: "rejected", intake_id: null, correlation_id: null, detail: "unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { status: "rejected", intake_id: null, correlation_id: null, detail: "invalid_json" });
  }

  const correlationId = str(body.correlation_id);
  const actionType = str(body.action_type);
  const ownerRequest = str(body.owner_request);
  if (!correlationId || !actionType || !ownerRequest) {
    return json(400, {
      status: "needs_info",
      intake_id: null,
      correlation_id: correlationId || null,
      detail: "missing correlation_id / action_type / owner_request",
    });
  }
  if (body.target_agent !== "elkayam_ceo_agent") {
    return json(400, { status: "rejected", intake_id: null, correlation_id: correlationId, detail: "wrong_target_agent" });
  }
  const canonicalAction = resolveActionType(actionType);
  if (!canonicalAction) {
    return json(200, { status: "unsupported_action", intake_id: null, correlation_id: correlationId, detail: `action ${actionType} not allowlisted` });
  }

  const supabase = getServiceSupabase();

  // Idempotent on correlation_id — a replay returns the existing row, never a 2nd insert.
  const existing = await supabase
    .from("jarvis_ceo_agent_commands")
    .select("id")
    .eq("correlation_id", correlationId)
    .maybeSingle();
  if (existing.data) {
    return json(200, { status: "pending_review", intake_id: existing.data.id as string, correlation_id: correlationId, detail: "idempotent_replay" });
  }

  const plan = (body.proposed_execution_plan ?? {}) as Record<string, unknown>;
  const title = str(body.title) || actionLabel(canonicalAction);

  const ins = await supabase
    .from("jarvis_ceo_agent_commands")
    .insert({
      correlation_id: correlationId,
      source_agent: str(body.source_agent) || "jarvis",
      target_agent: "elkayam_ceo_agent",
      requested_by: str(body.requested_by) || "owner_via_jarvis",
      title,
      summary: ownerRequest.slice(0, 500),
      full_request: ownerRequest,
      action_type: canonicalAction,
      target_department: str(body.affected_department) || null,
      target_role: str(plan.owning_role) || null,
      risk_level: str(body.risk_level) || null,
      status: "pending_review",
      approval_required: true,
      payload_json: body,
      dry_run_summary: str(body.dry_run_summary) || null,
      rollback_plan: str(body.rollback_plan) || null,
      diagnostics: { received_at: new Date().toISOString(), execution_mode: str(body.execution_mode) || "tier_a_staging" },
    })
    .select("id")
    .single();

  if (ins.error || !ins.data) {
    return json(500, { status: "rejected", intake_id: null, correlation_id: correlationId, detail: "insert_failed" });
  }
  // Tier-A: staged for CEO-Agent review. NOTHING in catalog/prices/business was touched.
  return json(200, { status: "pending_review", intake_id: ins.data.id as string, correlation_id: correlationId });
}

export async function GET(): Promise<NextResponse> {
  return json(405, { status: "rejected", intake_id: null, correlation_id: null, detail: "method_not_allowed" });
}
export const PUT = GET;
export const DELETE = GET;
export const PATCH = GET;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function json(status: number, body: CeoIntakeResponse): NextResponse {
  return NextResponse.json(body, { status });
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
