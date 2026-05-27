import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { loadLlmConfig } from "./llm/config";
import type { BrainDecision } from "./brain";

/**
 * Persistent Brain audit trail (`jarvis_brain_audit`). One row per OWNER brain decision so the
 * full story — incoming message → reasoning/decision → department/skill/action → outgoing reply —
 * is reconstructable in hindsight without ephemeral console logs. Best-effort (never blocks a
 * reply). NEVER stores secrets; message text is truncated.
 */

export interface BrainAuditInput {
  decision: BrainDecision;
  senderRole: string;
  channel: string;
  msgId?: string;
  inboundText: string;
  outgoingSummary: string;
  safetyResult?: string;
  fallbackReason?: string | null;
  capabilityRequestId?: string | null;
}

export async function recordBrainAudit(a: BrainAuditInput): Promise<void> {
  const d = a.decision;
  const providerUsed = d.source === "llm" ? d.provider ?? "llm" : "deterministic";
  const { error } = await getServiceSupabase().from("jarvis_brain_audit").insert({
    sender_role: a.senderRole,
    channel: a.channel,
    msg_id: a.msgId ?? null,
    inbound_text: (a.inboundText ?? "").slice(0, 500),
    llm_enabled: loadLlmConfig().enabled,
    provider_used: providerUsed,
    decision_source: d.source,
    intent: d.intent,
    business_domain: d.businessDomain,
    target_agent: d.targetAgents[0] ?? null,
    skill: d.skill,
    action: d.action,
    parameters: d.parameters ?? {},
    confidence: d.confidence,
    requires_clarification: d.requiresClarification,
    fallback_reason: a.fallbackReason ?? d.fallbackReason ?? null,
    safety_result: a.safetyResult ?? "accept",
    verified_answer_possible: d.verifiedAnswerPossible,
    outgoing_summary: (a.outgoingSummary ?? "").slice(0, 500),
    missing_capability: d.missingCapability,
    requires_capability_build: d.requiresCapabilityBuild,
    capability_request_id: a.capabilityRequestId ?? null,
  });
  if (error) console.error("[jarvis:audit] insert failed:", error.message);
}
