import type { SenderRole, Channel } from "../types";

/**
 * Shared LLM-layer contracts. These are PURE types — no `server-only`, no env, no I/O — so the
 * decision core (router / safety / budget / planner) and the mock provider can be unit-tested
 * in plain Node. Live providers and the orchestration index assemble these behind `server-only`.
 */

/** Rich intent vocabulary the LLM Router speaks (mapped down to the coarse `Intent` for the registry). */
export type LlmIntent =
  // owner / master
  | "owner_menu"
  | "order_intake"
  | "order_update"
  | "ceo_manager_request"
  | "ocr_document"
  | "personal_task"
  | "personal_note"
  | "reminder_request"
  | "daily_report"
  | "system_status"
  // owner — operations / inventory / catalog (each a DISTINCT read-only intent)
  | "inventory_stock_lookup"
  | "inventory_low_stock"
  | "inventory_missing_or_zero"
  | "catalog_missing_price"
  | "catalog_missing_supplier"
  | "purchase_recommendation_readonly"
  | "orders_status"
  | "stuck_orders"
  | "pending_order_drafts"
  | "operations_risk_report"
  | "finance_open_balance"
  | "fleet_equipment_status"
  | "capability_request"
  | "development_request"
  | "general_assistant"
  | "image_creation"
  | "image_editing"
  // external customer
  | "external_greeting"
  | "external_order_request"
  | "external_order_update"
  | "external_document_attachment"
  | "representative_request"
  | "cancellation"
  | "confirmation"
  | "unknown_customer_intake"
  // shared
  | "clarification_needed"
  | "unknown";

/** How risky the selected action is — gates whether it may auto-run. */
export type SafetyLevel = "read_only" | "pending" | "write" | "blocked";

export interface LLMUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LLMRequest {
  text: string;
  role: SenderRole;
  channel: Channel;
  /** Intents the caller will accept for this role (the safety allowlist, passed to the prompt). */
  allowedIntents: LlmIntent[];
  /** Small extra context (conversation state summary, known skills). Kept compact. */
  context?: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
  /** "intent" (default) or "plan" — selects which prompt/parse the provider should run. */
  mode?: "intent" | "plan";
}

export interface LLMIntentResult {
  intent: LlmIntent;
  skill: string | null;
  confidence: number; // 0..1
  parameters: Record<string, unknown>;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
  safetyLevel: SafetyLevel;
}

export interface LLMError {
  code: string; // "no_key" | "http" | "timeout" | "invalid_json" | "exception" | "unavailable"
  message: string;
  provider?: string;
}

export interface LLMProviderResult {
  ok: boolean;
  result?: LLMIntentResult;
  plan?: LLMPlanResult;
  usage?: LLMUsage;
  error?: LLMError;
  /** Raw model text (never logged with secrets) — for debugging in tests. */
  raw?: string;
}

export type ProviderHealth = "available" | "unavailable" | "unknown";

export interface LLMProviderStatus {
  name: string;
  health: ProviderHealth;
  reason?: string;
}

// ── Agent Reasoning ─────────────────────────────────────────────────────────────

export interface PlanStep {
  skill: string;
  action: string;
  parameters: Record<string, unknown>;
  safety: SafetyLevel;
}

export interface LLMPlanResult {
  goal: string;
  steps: PlanStep[];
  requiresApproval: boolean;
  riskLevel: "low" | "medium" | "high";
}

/** Outcome of the orchestrated router (index.routeMessage). */
export interface RouteOutcome {
  /** "llm" → use `result`; "deterministic" → caller runs the deterministic classifier. */
  mode: "llm" | "deterministic";
  result?: LLMIntentResult;
  provider?: string;
  usage?: LLMUsage;
  /** Why deterministic fallback was chosen (audit, no message content). */
  reason: string;
}

export type { SenderRole, Channel };
