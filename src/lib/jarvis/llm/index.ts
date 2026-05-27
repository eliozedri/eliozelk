import "server-only";
import type { SenderRole, Channel } from "../types";
import type { RouteOutcome, LLMRequest, LlmIntent, LLMPlanResult } from "./types";
import { loadLlmConfig } from "./config";
import { buildProviders, providerStatuses } from "./providers/registry";
import { routeViaProviders } from "./router";
import { validateRoute, isExternalRole } from "./safety";
import { checkBudget, recordUsage, budgetSnapshot } from "./budget";

/**
 * Orchestration entry for the LLM layer. This is the ONE place that reads env, assembles
 * providers, enforces budget, runs the router, and applies the safety validator. Everything it
 * depends on is pure + injectable, so the decision logic is tested in `scripts/jarvis-llm-selfcheck.ts`.
 *
 * Returns `{mode:"deterministic"}` whenever the LLM cannot or should not be used — the caller
 * then runs the deterministic classifier. This is what keeps Jarvis alive when the LLM is off,
 * keyless, over budget, timing out, low-confidence, or producing unsafe/invalid output.
 */

export interface RouteMessageInput {
  text: string;
  role: SenderRole;
  channel: Channel;
  context?: Record<string, unknown>;
}

const OWNER_INTENTS: LlmIntent[] = [
  "owner_menu", "order_intake", "order_update", "ceo_manager_request", "ocr_document",
  "personal_task", "personal_note", "reminder_request", "daily_report", "system_status",
  "inventory_stock_lookup", "inventory_low_stock", "inventory_missing_or_zero",
  "catalog_missing_price", "catalog_missing_supplier", "purchase_recommendation_readonly",
  "orders_status", "stuck_orders", "pending_order_drafts",
  "operations_risk_report", "finance_open_balance", "fleet_equipment_status", "capability_request",
  "development_request", "general_assistant", "image_creation", "image_editing",
  "clarification_needed", "unknown",
];
const EXTERNAL_INTENTS: LlmIntent[] = [
  "external_greeting", "external_order_request", "external_order_update",
  "external_document_attachment", "representative_request", "cancellation", "confirmation",
  "unknown_customer_intake", "clarification_needed", "unknown",
];

function allowedIntentsForRole(role: SenderRole): LlmIntent[] {
  return isExternalRole(role) ? EXTERNAL_INTENTS : OWNER_INTENTS;
}

/** PII-free audit: routing decision only, never message content. */
function audit(role: SenderRole, decision: string, provider?: string): void {
  console.log(`[jarvis:llm] route role=${role} decision=${decision}${provider ? ` provider=${provider}` : ""}`);
}

export async function routeMessage(input: RouteMessageInput): Promise<RouteOutcome> {
  const cfg = loadLlmConfig();
  if (!cfg.enabled) return { mode: "deterministic", reason: "llm_disabled" };

  const budget = checkBudget(cfg);
  if (!budget.ok) {
    audit(input.role, `budget_${budget.reason}`);
    return { mode: "deterministic", reason: `budget_${budget.reason}` };
  }

  const providers = buildProviders(cfg);
  if (providers.length === 0) {
    audit(input.role, "no_provider");
    return { mode: "deterministic", reason: "no_provider" };
  }

  const req: LLMRequest = {
    text: input.text ?? "",
    role: input.role,
    channel: input.channel,
    allowedIntents: allowedIntentsForRole(input.role),
    context: input.context,
    maxTokens: cfg.maxTokens,
    timeoutMs: cfg.timeoutMs,
    mode: "intent",
  };

  const routed = await routeViaProviders(providers, req, { minConfidence: cfg.minConfidence });
  if (!routed.ok || !routed.result) {
    audit(input.role, "router_fallback");
    return { mode: "deterministic", reason: "router_fallback" };
  }

  const decision = validateRoute(routed.result, { role: input.role, minConfidence: cfg.minConfidence });
  if (decision.action === "fallback" || !decision.sanitized) {
    audit(input.role, `safety_${decision.reason}`, routed.provider);
    return { mode: "deterministic", reason: `safety_${decision.reason}` };
  }

  recordUsage(routed.usage);
  audit(input.role, `llm_${decision.action}_${decision.sanitized.intent}`, routed.provider);
  return { mode: "llm", result: decision.sanitized, provider: routed.provider, usage: routed.usage, reason: decision.reason };
}

/** Owner-only LLM plan generation (agent reasoning). Returns null when the LLM can't/shouldn't run. */
export async function routePlan(input: RouteMessageInput & { actionsCatalog: string }): Promise<{ plan: LLMPlanResult; provider?: string } | null> {
  const cfg = loadLlmConfig();
  if (!cfg.enabled || isExternalRole(input.role)) return null;
  const budget = checkBudget(cfg);
  if (!budget.ok) return null;
  const providers = buildProviders(cfg).filter((p) => typeof p.planSteps === "function");
  if (providers.length === 0) return null;
  const req: LLMRequest = {
    text: input.text ?? "",
    role: input.role,
    channel: input.channel,
    allowedIntents: allowedIntentsForRole(input.role),
    context: { ...(input.context ?? {}), actionsCatalog: input.actionsCatalog },
    maxTokens: cfg.maxTokens,
    timeoutMs: cfg.timeoutMs,
    mode: "plan",
  };
  const routed = await routeViaProviders(providers, req, { minConfidence: cfg.minConfidence });
  if (!routed.ok || !routed.plan) return null;
  recordUsage(routed.usage);
  return { plan: routed.plan, provider: routed.provider };
}

/**
 * General Assistant free-text generation (owner-only). Read-only advice: the model produces a
 * Hebrew reply but performs NO actions. Returns null when the LLM is off / over budget / no
 * provider — the caller then gives an honest safe-mode message. Failover gemini→groq.
 */
export async function generateReply(input: RouteMessageInput & { systemPrompt: string }): Promise<{ text: string; provider?: string } | null> {
  const cfg = loadLlmConfig();
  if (!cfg.enabled || isExternalRole(input.role)) return null;
  const budget = checkBudget(cfg);
  if (!budget.ok) return null;
  const providers = buildProviders(cfg).filter((p) => typeof p.generateText === "function");
  if (providers.length === 0) return null;
  const req: LLMRequest = {
    text: input.text ?? "",
    role: input.role,
    channel: input.channel,
    allowedIntents: [],
    context: { ...(input.context ?? {}), systemPrompt: input.systemPrompt },
    maxTokens: Math.max(cfg.maxTokens, 400),
    timeoutMs: cfg.timeoutMs,
  };
  for (const p of providers) {
    try {
      const res = await p.generateText!(req);
      if (res.ok && res.text) {
        recordUsage(res.usage);
        audit(input.role, "general_reply", p.name);
        return { text: res.text, provider: p.name };
      }
    } catch {
      // try next provider
    }
  }
  return null;
}

/** Diagnostics for an owner status view (no secrets — presence + health only). */
export async function llmDiagnostics() {
  const cfg = loadLlmConfig();
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    priority: cfg.priority,
    allowPaid: cfg.allowPaid,
    minConfidence: cfg.minConfidence,
    budget: budgetSnapshot(),
    providers: await providerStatuses(cfg),
  };
}
