import "server-only";
import type { Intent, SenderRole, Channel } from "./types";
import type { LlmIntent, SafetyLevel } from "./llm/types";
import type { AgentPlan } from "./agent/types";
import type { BusinessDomain } from "./departments";
import { departmentFor, isBusinessConsultation } from "./departments";
import { routeMessage, routePlan } from "./llm/index";
import { classifyIntent } from "./intent";
import { sanitizeIntentForRole } from "./roleGate";
import { llmIntentToCoarse } from "./llm/safety";
import { intentToCommandId, matchCommandId, deterministicDomainIntent } from "./skills/ceoManager/match";
import { planDeterministic } from "./agent/planner";
import { actionsCatalogText } from "./agent/catalog";

/**
 * Jarvis Brain — REASONING FIRST, then department routing, then execution.
 *
 * `decideBrain` turns a normalized message (after sender-role detection) into ONE structured
 * `BrainDecision`. The LLM Router reasons about the request → intent + skill + parameters +
 * confidence + clarification + safety. The Brain then attaches the BUSINESS DEPARTMENT that owns
 * the answer and resolves an execution path: a single read-only action, a multi-step read-only
 * routine, a clarification, or — when the owning department has no verified data source — NO
 * action (the executor files an honest pending request to that department). Commands are tools,
 * not the brain. A finance question is never answered from operations; a stock question never
 * becomes a price report; uncertainty asks rather than guesses.
 */

export interface BrainDecision {
  source: "llm" | "deterministic";
  provider?: string;
  intent: LlmIntent;
  coarseIntent: Intent;
  /** Business department that owns the answer. */
  businessDomain: BusinessDomain;
  /** Command-center agent(s) to attribute the work / pending request to. */
  targetAgents: string[];
  requiresDepartmentConsultation: boolean;
  skill: string | null;
  /** Resolved read-only command id, when a single action fits. */
  action: string | null;
  parameters: Record<string, unknown>;
  confidence: number;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
  /** Multi-step read-only routine, when reasoning chose one. */
  routine: AgentPlan | null;
  safetyLevel: SafetyLevel;
  /** True when an action/routine can produce a verified answer now. */
  verifiedAnswerPossible: boolean;
  /** When !verifiedAnswerPossible: what data source must be connected. */
  dataSourceNeeded: string | null;
  /** Why the deterministic fallback was used (null when the LLM decision was accepted). */
  fallbackReason: string | null;
  /** True when the owner asked to BUILD/ADD a capability (→ capability request, not an answer). */
  requiresCapabilityBuild: boolean;
  /** What capability/data source is missing (drives a Capability Request). */
  missingCapability: string | null;
  /** Provenance for audit: gemini | groq | local | deterministic | fallback | safety_block | clarification. */
  decisionSource: string;
}

export interface BrainInput {
  text: string;
  role: SenderRole;
  channel: Channel;
  state?: Record<string, unknown>;
}

export async function decideBrain(input: BrainInput): Promise<BrainDecision> {
  const { text, role, channel } = input;
  const outcome = await routeMessage({ text: text ?? "", role, channel, context: input.state });

  if (outcome.mode === "llm" && outcome.result) {
    const rich = outcome.result; // already role-clamped by the safety validator in llm/index
    let routine: AgentPlan | null = null;
    let action: string | null = null;

    if (rich.intent === "operations_risk_report") {
      routine = await buildRoutine(text, role, channel);
    } else {
      action = intentToCommandId(rich.intent);
      if (!action && rich.intent === "ceo_manager_request") action = matchCommandId(text);
    }

    return finalize({
      source: "llm",
      provider: outcome.provider,
      intent: rich.intent,
      coarseIntent: sanitizeIntentForRole(llmIntentToCoarse(rich.intent), role),
      skill: rich.skill,
      action,
      parameters: rich.parameters ?? {},
      confidence: rich.confidence,
      requiresClarification: rich.requiresClarification || rich.intent === "clarification_needed",
      clarificationQuestion: rich.clarificationQuestion,
      routine,
      safetyLevel: rich.safetyLevel,
      fallbackReason: null, // LLM decision accepted — fallback NOT used.
    });
  }

  // Reached ONLY when the LLM produced no accepted decision (disabled / both providers failed /
  // timeout / quota / low-confidence / invalid JSON / unsafe). `outcome.reason` records which.
  return deterministicDecision(text ?? "", role, outcome.reason);
}

async function buildRoutine(text: string, role: SenderRole, channel: Channel): Promise<AgentPlan | null> {
  const viaLlm = await routePlan({ text, role, channel, actionsCatalog: actionsCatalogText() });
  if (viaLlm?.plan?.steps?.length) return viaLlm.plan;
  return planDeterministic(text);
}

/**
 * Deterministic fallback — the EXCEPTIONAL path, reached only when the LLM produced no accepted
 * decision. Still returns a structured decision and asks clarification rather than guessing a
 * command. `reason` is the LLM-outcome reason (disabled / router_fallback / safety_* / budget_*).
 */
function deterministicDecision(text: string, role: SenderRole, reason: string): BrainDecision {
  const plan = planDeterministic(text);
  if (plan) {
    return finalize({
      source: "deterministic", intent: "operations_risk_report",
      coarseIntent: sanitizeIntentForRole("ceo_manager", role),
      skill: "operations", action: null, parameters: {}, confidence: 0.6,
      requiresClarification: false, clarificationQuestion: null, routine: plan, safetyLevel: "read_only",
      fallbackReason: reason,
    });
  }
  const di = deterministicDomainIntent(text);
  if (di) {
    return finalize({
      source: "deterministic", intent: di,
      coarseIntent: sanitizeIntentForRole(llmIntentToCoarse(di), role),
      skill: "operations", action: intentToCommandId(di), parameters: {}, confidence: 0.6,
      requiresClarification: false, clarificationQuestion: null, routine: null, safetyLevel: "read_only",
      fallbackReason: reason,
    });
  }
  const det = classifyIntent(text, role);
  const coarse = sanitizeIntentForRole(det.intent, role);
  if (coarse === "unclear") {
    return finalize({
      source: "deterministic", intent: "clarification_needed", coarseIntent: "unclear",
      skill: null, action: null, parameters: {}, confidence: det.confidence,
      requiresClarification: true,
      clarificationQuestion:
        "לא בטוח שהבנתי 🙂 אפשר לשאול על מלאי של פריט, מלאי נמוך, הזמנות, חריגות, חשבונות פתוחים, ציוד — או לבקש שאפתח משימה.",
      routine: null, safetyLevel: "read_only", fallbackReason: reason,
    });
  }
  return finalize({
    source: "deterministic", intent: coarseToLlm(coarse), coarseIntent: coarse,
    skill: null, action: null, parameters: {}, confidence: det.confidence,
    requiresClarification: false, clarificationQuestion: null, routine: null, safetyLevel: "pending",
    fallbackReason: reason,
  });
}

/** Attach department routing + verifiability + capability/provenance to a partial decision. */
function finalize(
  d: Omit<BrainDecision, "businessDomain" | "targetAgents" | "requiresDepartmentConsultation" | "verifiedAnswerPossible" | "dataSourceNeeded" | "requiresCapabilityBuild" | "missingCapability" | "decisionSource">,
): BrainDecision {
  const dept = departmentFor(d.intent);
  const verified = !!d.action || !!d.routine;
  const dataSourceNeeded = verified ? null : dept.dataSourceNeeded ?? null;
  const decisionSource = d.requiresClarification
    ? "clarification"
    : d.source === "llm"
      ? d.provider ?? "llm"
      : d.fallbackReason?.startsWith("safety")
        ? "safety_block"
        : "fallback";
  return {
    ...d,
    businessDomain: dept.domain,
    targetAgents: dept.agents,
    requiresDepartmentConsultation: isBusinessConsultation(dept.domain),
    verifiedAnswerPossible: verified,
    dataSourceNeeded,
    requiresCapabilityBuild: d.intent === "capability_request",
    missingCapability: verified ? null : dataSourceNeeded,
    decisionSource,
  };
}

function coarseToLlm(coarse: Intent): LlmIntent {
  switch (coarse) {
    case "order_intake": return "order_intake";
    case "personal": return "personal_task";
    case "ocr_document": return "ocr_document";
    case "greeting": return "owner_menu";
    case "status": return "system_status";
    case "ceo_manager": return "ceo_manager_request";
    case "general": return "general_assistant";
    case "development": return "development_request";
    case "creative": return "image_creation";
    default: return "unknown";
  }
}
