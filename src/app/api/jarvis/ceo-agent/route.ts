import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { actionLabel, resolveActionType } from "@/lib/jarvis/actionCatalog";
import { analyzeRequest, appendTurn, type ConversationTurn } from "@/lib/jarvis/ceoAnalyze";
import { reasonAsAgent } from "@/lib/jarvis/agentReasoning";
import { INTERNAL_AGENT_IDS } from "@/lib/jarvis/agentRoles";
import { getAgentContext } from "@/lib/jarvis/agentContext";

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
  /** The CEO-Agent's conversational reply (next dialogue turn) so JARVIS can relay it. */
  message_type?: string;
  message_text?: string;
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

  // Clarification answer (JARVIS → CEO-Agent), closing the needs_info loop:
  // the owner's Telegram reply comes back here and re-opens the command for review.
  if (body.kind === "clarification_answer") {
    const cid = str(body.correlation_id);
    const answer = str(body.answer);
    if (!cid || !answer) return json(400, { status: "needs_info", intake_id: null, correlation_id: cid || null, detail: "missing correlation_id / answer" });
    const supabaseA = getServiceSupabase();
    const existingA = await supabaseA
      .from("jarvis_ceo_agent_commands")
      .select("id, status, diagnostics")
      .eq("correlation_id", cid)
      .maybeSingle();
    if (!existingA.data) return json(404, { status: "rejected", intake_id: null, correlation_id: cid, detail: "not_found" });
    const diagA = (existingA.data.diagnostics as Record<string, unknown> | null) ?? {};
    const answers = Array.isArray(diagA.clarification_answers) ? diagA.clarification_answers : [];
    await supabaseA
      .from("jarvis_ceo_agent_commands")
      .update({
        status: "pending_review", // owner answered → back to the CEO-Agent's review queue
        diagnostics: { ...diagA, clarification_answers: [...answers, { answer, at: new Date().toISOString() }] },
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingA.data.id as string);
    return json(200, { status: "pending_review", intake_id: existingA.data.id as string, correlation_id: cid, detail: "answer_recorded" });
  }

  // Generic conversational request. action_type is a HINT, not a gate — the
  // CEO-Agent accepts any Elkayam request and analyzes it; unknown capabilities
  // become a capability_gap turn, never a rejection. Execution stays gated to
  // allowlisted handlers + approvals downstream.
  const correlationId = str(body.correlation_id);
  const actionType = str(body.action_type);
  const ownerRequest = str(body.owner_request);
  if (!correlationId || !ownerRequest) {
    return json(400, { status: "needs_info", intake_id: null, correlation_id: correlationId || null, detail: "missing correlation_id / owner_request" });
  }
  if (body.target_agent !== "elkayam_ceo_agent") {
    return json(400, { status: "rejected", intake_id: null, correlation_id: correlationId, detail: "wrong_target_agent" });
  }

  const supabase = getServiceSupabase();
  const existing = await supabase.from("jarvis_ceo_agent_commands").select("id").eq("correlation_id", correlationId).maybeSingle();
  if (existing.data) {
    return json(200, { status: "pending_review", intake_id: existing.data.id as string, correlation_id: correlationId, detail: "idempotent_replay" });
  }

  const plan = (body.proposed_execution_plan ?? {}) as Record<string, unknown>;
  const params = (body.params ?? plan.params ?? {}) as Record<string, unknown>;
  const canonicalAction = resolveActionType(actionType);
  const targetDepartment = str(body.affected_department) || null;

  // CEO-Agent reads its read-only business context, then THINKS (LLM-first;
  // rule-based fallback) and picks the next dialogue turn.
  const ceoContext = await getAgentContext(supabase, "ceo");
  const analysis = await analyzeRequest({ action_type: actionType, owner_request: ownerRequest, target_department: targetDepartment, params, agentContext: ceoContext.summary });

  const title = str(body.title) || (canonicalAction ? actionLabel(canonicalAction) : "בקשה לסקירת CEO-Agent");
  let conversation: ConversationTurn[] = [];
  conversation = appendTurn(conversation, {
    source_agent: str(body.source_agent) || "jarvis", target_agent: "elkayam_ceo_agent",
    message_type: "request", message_text: ownerRequest, structured_payload: { action_type: actionType, params, target_department: targetDepartment },
  });
  conversation = appendTurn(conversation, {
    source_agent: "elkayam_ceo_agent", target_agent: "jarvis",
    message_type: analysis.message_type, message_text: analysis.message_text,
    structured_payload: { ...analysis.structured_payload, reasoning_summary: analysis.reasoning_summary, routed_to_agent: analysis.routed_to_agent, llm_used: analysis.llm_used, provider: analysis.llm_provider, risk_level: analysis.risk_level },
  });

  // Internal routing: if the CEO routed to an internal agent, that agent reasons
  // too and appends its turn (CEO-Agent ↔ internal agent dialogue).
  let finalMessageType = analysis.message_type;
  let finalMessageText = analysis.message_text;
  if (analysis.routed_to_agent && INTERNAL_AGENT_IDS.includes(analysis.routed_to_agent)) {
    const internalContext = await getAgentContext(supabase, analysis.routed_to_agent);
    const internal = await reasonAsAgent({
      agentId: analysis.routed_to_agent,
      userRequest: ownerRequest,
      businessContext: [internalContext.summary, targetDepartment ? `מחלקה/קטגוריה: ${targetDepartment}` : ""].filter(Boolean).join(" · "),
      conversationHistory: conversation.map((t) => ({ source_agent: t.source_agent, message_type: t.message_type, message_text: t.message_text })),
    });
    if (internal) {
      conversation = appendTurn(conversation, {
        source_agent: analysis.routed_to_agent, target_agent: "elkayam_ceo_agent",
        message_type: internal.message_type, message_text: internal.message_text,
        structured_payload: { reasoning_summary: internal.reasoning_summary, llm_used: internal.llm_used, provider: internal.provider, risk_level: internal.risk_level },
      });
      finalMessageType = internal.message_type;
      finalMessageText = `(${analysis.routed_to_agent}) ${internal.message_text}`;
    }
  }

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
      action_type: canonicalAction ?? (actionType || "general_request"),
      target_department: targetDepartment,
      target_role: str(plan.owning_role) || null,
      risk_level: str(body.risk_level) || null,
      status: analysis.recommended_status,
      last_message_type: finalMessageType,
      conversation,
      reasoning_summary: analysis.reasoning_summary,
      routed_to_agent: analysis.routed_to_agent,
      llm_used: analysis.llm_used,
      llm_provider: analysis.llm_provider,
      approval_required: true,
      payload_json: body,
      dry_run_summary: str(body.dry_run_summary) || null,
      rollback_plan: str(body.rollback_plan) || null,
      diagnostics: { received_at: new Date().toISOString(), execution_mode: str(body.execution_mode) || "tier_a_staging", llm_used: analysis.llm_used, provider: analysis.llm_provider },
    })
    .select("id")
    .single();

  if (ins.error || !ins.data) {
    return json(500, { status: "rejected", intake_id: null, correlation_id: correlationId, detail: "insert_failed" });
  }
  // Conversational reply (incl. the routed internal agent's response). NOTHING
  // in catalog/prices/business was touched.
  const intakeStatus: CeoIntakeResponse["status"] =
    analysis.message_type === "needs_info" ? "needs_info" : analysis.message_type === "capability_gap" ? "received" : "pending_review";
  return json(200, {
    status: intakeStatus, intake_id: ins.data.id as string, correlation_id: correlationId,
    message_type: finalMessageType, message_text: finalMessageText,
  });
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
