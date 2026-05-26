import "server-only";
import type { Intent, IntentResult, SenderRole } from "../types";
import { classifyIntent } from "../intent";

/**
 * LLM intent classifier — the optional semantic layer ON TOP of the deterministic one.
 *
 * Dormant by default: it activates only when `JARVIS_LLM_ENABLED=true` AND an API key is
 * set. Otherwise (and on ANY error / invalid output) it falls back to the deterministic
 * `classifyIntent`, so behavior with no key is byte-identical to today. Uses plain fetch —
 * no new dependency. The API key lives only in env and is never logged.
 *
 * SAFETY: this only chooses an intent; role gating is enforced by the registry, so an LLM
 * misclassification can never escalate an external sender to owner skills.
 *
 * To enable: set `JARVIS_LLM_ENABLED=true` + `ANTHROPIC_API_KEY` (optionally
 * `JARVIS_LLM_MODEL`). A Vercel AI Gateway base can be added behind the same interface.
 */

const VALID: Intent[] = [
  "order_intake", "ocr_document", "ceo_manager", "personal", "status", "help", "greeting", "unclear",
];

const SYSTEM =
  "You classify a Hebrew WhatsApp message into exactly ONE intent for a road-sign company " +
  "assistant (Jarvis). Reply with ONLY one of these tokens, nothing else: " +
  VALID.join(", ") + ".";

function llmEnabled(): boolean {
  return process.env.JARVIS_LLM_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY;
}

async function classifyViaLlm(text: string, role: SenderRole): Promise<IntentResult | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.JARVIS_LLM_MODEL ?? "claude-haiku-4-5-20251001";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        system: SYSTEM,
        messages: [{ role: "user", content: `sender_role=${role}\nmessage: ${text}` }],
      }),
    });
    if (!res.ok) {
      console.warn(`[jarvis:llm] classify failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const out = (data.content?.[0]?.text ?? "").trim().toLowerCase();
    const intent = VALID.find((v) => out.includes(v)) ?? null;
    return intent ? { intent, confidence: 0.95 } : null;
  } catch (err) {
    console.warn("[jarvis:llm] classify threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** LLM-first (if enabled) with deterministic fallback. Always resolves to a valid intent. */
export async function classifyIntentSmart(text: string, role: SenderRole): Promise<IntentResult> {
  if (llmEnabled()) {
    const llm = await classifyViaLlm(text, role);
    if (llm) return llm;
  }
  return classifyIntent(text, role);
}
