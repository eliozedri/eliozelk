import "server-only";
import type { LLMProvider } from "./types";
import type { LLMRequest, LLMProviderResult } from "../types";
import { buildIntentPrompt, buildPlanPrompt, parseIntentJson, parsePlanJson } from "../prompt";
import { postJson, resolveModel } from "./http";

/**
 * OpenAI provider (Chat Completions). Code-supported but PAID — the registry will NOT include it
 * unless `JARVIS_LLM_ALLOW_PAID=true`. Key from OPENAI_API_KEY (Bearer; never logged).
 */

const DEFAULT_MODEL = "gpt-4o-mini";

function key(): string | undefined {
  return process.env.OPENAI_API_KEY;
}

async function call(req: LLMRequest, kind: "intent" | "plan"): Promise<LLMProviderResult> {
  const k = key();
  if (!k) return { ok: false, error: { code: "no_key", message: "OPENAI_API_KEY missing", provider: "openai" } };
  const model = resolveModel("openai", DEFAULT_MODEL);
  const { system, user } =
    kind === "plan" ? buildPlanPrompt(req, String(req.context?.actionsCatalog ?? "")) : buildIntentPrompt(req);

  const res = await postJson(
    "https://api.openai.com/v1/chat/completions",
    { authorization: `Bearer ${k}` },
    {
      model,
      temperature: 0,
      max_tokens: req.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    req.timeoutMs,
  );
  if (!res.ok) return { ok: false, error: { code: res.error ?? "http", message: res.error ?? "error", provider: "openai" } };

  const data = res.json as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const raw = data?.choices?.[0]?.message?.content ?? "";
  const usage = {
    promptTokens: data?.usage?.prompt_tokens,
    completionTokens: data?.usage?.completion_tokens,
    totalTokens: data?.usage?.total_tokens,
  };
  if (kind === "plan") {
    const plan = parsePlanJson(raw);
    return plan ? { ok: true, plan, usage, raw } : { ok: false, error: { code: "invalid_json", message: "plan parse failed", provider: "openai" }, raw };
  }
  const result = parseIntentJson(raw);
  return result ? { ok: true, result, usage, raw } : { ok: false, error: { code: "invalid_json", message: "intent parse failed", provider: "openai" }, raw };
}

export const openaiProvider: LLMProvider = {
  name: "openai",
  available: () => !!key(),
  classifyIntent: (req) => call(req, "intent"),
  planSteps: (req) => call(req, "plan"),
  async health() {
    return key()
      ? { name: "openai", health: "available" as const }
      : { name: "openai", health: "unavailable" as const, reason: "OPENAI_API_KEY missing" };
  },
};
