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
  messageType?: string;
  mediaPresent?: boolean;
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
    message_type: a.messageType ?? null,
    media_present: a.mediaPresent ?? false,
    brain_called: true, // recordBrainAudit is only called on the Brain-routed path
  });
  if (error) console.error("[jarvis:audit] insert failed:", error.message);
}

/**
 * Audit an EXPLICIT executor action that legitimately does NOT go through the Brain — a button tap,
 * exact nav word, numeric menu choice, or a capture state the owner navigated into. brain_called is
 * false with a reason, so the audit trail proves these are the ONLY non-Brain owner paths (they are
 * executors of an explicit owner choice, never an intent guess).
 */
export async function recordExplicitAudit(a: {
  senderRole: string; channel: string; msgId?: string; messageType?: string; mediaPresent?: boolean;
  inboundText: string; intent: string; skill: string | null; action: string; outgoingSummary: string;
}): Promise<void> {
  const { error } = await getServiceSupabase().from("jarvis_brain_audit").insert({
    sender_role: a.senderRole, channel: a.channel, msg_id: a.msgId ?? null,
    inbound_text: (a.inboundText ?? "").slice(0, 500),
    llm_enabled: loadLlmConfig().enabled, provider_used: "explicit", decision_source: "explicit_ui",
    intent: a.intent, business_domain: "ui", skill: a.skill, action: a.action,
    requires_clarification: false, safety_result: "explicit", verified_answer_possible: true,
    outgoing_summary: (a.outgoingSummary ?? "").slice(0, 500),
    message_type: a.messageType ?? null, media_present: a.mediaPresent ?? false,
    brain_called: false, fallback_reason: "explicit_ui_or_capture",
  });
  if (error) console.error("[jarvis:audit] explicit insert failed:", error.message);
}
