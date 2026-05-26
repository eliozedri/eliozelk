import "server-only";
import type { Intent, IntentResult, SenderRole, Channel } from "../types";
import { classifyIntent } from "../intent";
import { sanitizeIntentForRole } from "../roleGate";
import { routeMessage } from "./index";
import { llmIntentToCoarse } from "./safety";
import type { LLMIntentResult } from "./types";

/**
 * Backward-compatible Brain entry. `classifyIntentSmart` keeps its 2-arg signature so the
 * orchestrator and the WhatsApp owner adapter need no change. Internally it now delegates to the
 * multi-provider LLM Router (`routeMessage`) and maps the rich result down to the coarse `Intent`
 * the registry routes on. When the router returns `deterministic` (disabled / keyless / over
 * budget / timeout / low-confidence / unsafe / invalid), it falls back to `classifyIntent` —
 * byte-identical to the previous behavior. Every result is still clamped by
 * `sanitizeIntentForRole` (defense in depth) before being returned.
 */

function deterministic(text: string, role: SenderRole): IntentResult {
  const det = classifyIntent(text, role);
  return { intent: sanitizeIntentForRole(det.intent, role), confidence: det.confidence };
}

export async function classifyIntentSmart(
  text: string,
  role: SenderRole,
  channel: Channel = "whatsapp",
): Promise<IntentResult> {
  const outcome = await routeMessage({ text: text ?? "", role, channel });
  if (outcome.mode === "llm" && outcome.result) {
    const coarse = sanitizeIntentForRole(llmIntentToCoarse(outcome.result.intent), role);
    return { intent: coarse, confidence: outcome.result.confidence };
  }
  return deterministic(text ?? "", role);
}

/**
 * Rich variant for callers that want the full structured result (parameters, clarification,
 * safetyLevel) — e.g. skills extracting parameters. Returns the coarse intent plus, when the LLM
 * ran, the raw `LLMIntentResult`. Falls back to deterministic with `llm: null`.
 */
export async function classifyMessageRich(
  text: string,
  role: SenderRole,
  channel: Channel = "whatsapp",
  context?: Record<string, unknown>,
): Promise<{ intent: Intent; confidence: number; llm: LLMIntentResult | null; provider?: string }> {
  const outcome = await routeMessage({ text: text ?? "", role, channel, context });
  if (outcome.mode === "llm" && outcome.result) {
    return {
      intent: sanitizeIntentForRole(llmIntentToCoarse(outcome.result.intent), role),
      confidence: outcome.result.confidence,
      llm: outcome.result,
      provider: outcome.provider,
    };
  }
  const det = deterministic(text ?? "", role);
  return { intent: det.intent, confidence: det.confidence, llm: null };
}
