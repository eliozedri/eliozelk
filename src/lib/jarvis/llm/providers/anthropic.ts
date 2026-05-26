import "server-only";
import type { LLMProvider } from "./types";
import type { LLMRequest, LLMProviderResult } from "../types";
import { buildIntentPrompt, buildPlanPrompt, parseIntentJson, parsePlanJson } from "../prompt";
import { postJson, resolveModel } from "./http";

/**
 * Anthropic provider (Messages API). Code-supported but PAID — the registry will NOT include it
 * unless `JARVIS_LLM_ALLOW_PAID=true`. The Anthropic API is separate metered billing and is NOT
 * covered by a Claude / Claude Code subscription. Key from ANTHROPIC_API_KEY (header; never logged).
 */

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

function key(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

async function call(req: LLMRequest, kind: "intent" | "plan"): Promise<LLMProviderResult> {
  const k = key();
  if (!k) return { ok: false, error: { code: "no_key", message: "ANTHROPIC_API_KEY missing", provider: "anthropic" } };
  const model = resolveModel("anthropic", DEFAULT_MODEL);
  const { system, user } =
    kind === "plan" ? buildPlanPrompt(req, String(req.context?.actionsCatalog ?? "")) : buildIntentPrompt(req);

  const res = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": k, "anthropic-version": "2023-06-01" },
    { model, max_tokens: req.maxTokens, system, messages: [{ role: "user", content: user }] },
    req.timeoutMs,
  );
  if (!res.ok) return { ok: false, error: { code: res.error ?? "http", message: res.error ?? "error", provider: "anthropic" } };

  const data = res.json as {
    content?: { text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const raw = data?.content?.map((c) => c.text ?? "").join("") ?? "";
  const usage = {
    promptTokens: data?.usage?.input_tokens,
    completionTokens: data?.usage?.output_tokens,
    totalTokens: (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0),
  };
  if (kind === "plan") {
    const plan = parsePlanJson(raw);
    return plan ? { ok: true, plan, usage, raw } : { ok: false, error: { code: "invalid_json", message: "plan parse failed", provider: "anthropic" }, raw };
  }
  const result = parseIntentJson(raw);
  return result ? { ok: true, result, usage, raw } : { ok: false, error: { code: "invalid_json", message: "intent parse failed", provider: "anthropic" }, raw };
}

export const anthropicProvider: LLMProvider = {
  name: "anthropic",
  available: () => !!key(),
  classifyIntent: (req) => call(req, "intent"),
  planSteps: (req) => call(req, "plan"),
  async health() {
    return key()
      ? { name: "anthropic", health: "available" as const }
      : { name: "anthropic", health: "unavailable" as const, reason: "ANTHROPIC_API_KEY missing" };
  },
};
