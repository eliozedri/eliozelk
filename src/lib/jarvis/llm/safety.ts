import type { Intent, SenderRole } from "../types";
import type { LLMIntentResult, LlmIntent } from "./types";

/**
 * Post-LLM safety validator. PURE. The LLM only proposes; THIS decides what may route. It runs
 * on top of (not instead of) the registry's role gate and `sanitizeIntentForRole` — defense in
 * depth: even a perfectly-crafted malicious LLM output cannot escalate an external sender to an
 * owner skill, auto-create a work_order, or run a write action.
 */

/** Intents an external/unknown sender may ever act on. Everything else clamps to customer intake. */
const EXTERNAL_ALLOWED: ReadonlySet<LlmIntent> = new Set<LlmIntent>([
  "external_greeting",
  "external_order_request",
  "external_order_update",
  "external_document_attachment",
  "representative_request",
  "cancellation",
  "confirmation",
  "unknown_customer_intake",
  "clarification_needed",
  "unknown",
]);

export type SafetyAction = "accept" | "clamp" | "clarify" | "fallback" | "deny";

export interface SafetyContext {
  role: SenderRole;
  minConfidence: number;
}

export interface SafetyDecision {
  action: SafetyAction;
  /** The result the caller should use when action is accept/clamp/clarify. */
  sanitized: LLMIntentResult | null;
  /** Audit reason (no message content). */
  reason: string;
}

const CUSTOMER_INTAKE: LLMIntentResult = {
  intent: "external_order_request",
  skill: "orderIntake",
  confidence: 0.5,
  parameters: {},
  requiresClarification: false,
  clarificationQuestion: null,
  safetyLevel: "pending",
};

export function isExternalRole(role: SenderRole): boolean {
  return role === "external" || role === "unknown";
}

export function validateRoute(result: LLMIntentResult | null, ctx: SafetyContext): SafetyDecision {
  if (!result) return { action: "fallback", sanitized: null, reason: "no_result" };

  // 1. Confidence gate.
  if (result.confidence < ctx.minConfidence) {
    return { action: "fallback", sanitized: null, reason: "low_confidence" };
  }

  // 2. External senders are clamped to customer intake for any non-allowed intent.
  if (isExternalRole(ctx.role)) {
    if (!EXTERNAL_ALLOWED.has(result.intent)) {
      return { action: "clamp", sanitized: { ...CUSTOMER_INTAKE }, reason: "external_clamped" };
    }
    // External never auto-mutates; force write/blocked down to pending intake.
    if (result.safetyLevel === "write" || result.safetyLevel === "blocked") {
      return { action: "clamp", sanitized: { ...CUSTOMER_INTAKE }, reason: "external_unsafe_level" };
    }
    return { action: "accept", sanitized: result, reason: "external_ok" };
  }

  // 3. Owner/internal: write/blocked actions never auto-run (no write tooling). Fall back to the
  //    deterministic path, which records a pending human task instead of faking a mutation.
  if (result.safetyLevel === "write" || result.safetyLevel === "blocked") {
    return { action: "fallback", sanitized: null, reason: "write_not_supported" };
  }

  // 4. Explicit clarification request from the LLM.
  if (result.requiresClarification && result.clarificationQuestion) {
    return { action: "clarify", sanitized: result, reason: "needs_clarification" };
  }

  return { action: "accept", sanitized: result, reason: "owner_ok" };
}

/** Map the rich LLM intent down to the coarse `Intent` the registry routes on. */
export function llmIntentToCoarse(intent: LlmIntent): Intent {
  switch (intent) {
    case "order_intake":
    case "order_update":
    case "external_order_request":
    case "external_order_update":
    case "representative_request":
    case "cancellation":
    case "confirmation":
      return "order_intake";
    // CEO/manager + ALL operations/inventory/catalog intents route to the manager dispatcher,
    // which then picks the EXACT read-only command from the rich intent (intent-first).
    case "ceo_manager_request":
    case "system_status":
    case "inventory_stock_lookup":
    case "inventory_low_stock":
    case "inventory_missing_or_zero":
    case "catalog_missing_price":
    case "catalog_missing_supplier":
    case "purchase_recommendation_readonly":
    case "orders_status":
    case "stuck_orders":
    case "pending_order_drafts":
    case "operations_risk_report":
    case "finance_open_balance":
    case "fleet_equipment_status":
    case "capability_request":
      return "ceo_manager";
    case "ocr_document":
    case "external_document_attachment":
      return "ocr_document";
    case "personal_task":
    case "personal_note":
    case "reminder_request":
    case "daily_report":
      return "personal";
    case "owner_menu":
    case "external_greeting":
      return "greeting";
    case "clarification_needed":
    case "unknown_customer_intake":
    case "unknown":
    default:
      return "unclear";
  }
}
