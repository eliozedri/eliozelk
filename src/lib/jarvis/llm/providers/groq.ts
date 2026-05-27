import "server-only";
import type { LLMProvider } from "./types";
import type { LLMRequest, LLMProviderResult } from "../types";
import { buildIntentPrompt, buildPlanPrompt, parseIntentJson, parsePlanJson } from "../prompt";
import { postJson, resolveModel } from "./http";

/**
 * Groq provider (OpenAI-compatible chat completions) — SECOND priority, free-tier friendly.
 * Key from GROQ_API_KEY (Bearer; never logged). JSON mode via response_format. Disabled when no
 * key is present.
 */

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function key(): string | undefined {
  return process.env.GROQ_API_KEY;
}

async function call(req: LLMRequest, kind: "intent" | "plan"): Promise<LLMProviderResult> {
  const k = key();
  if (!k) return { ok: false, error: { code: "no_key", message: "GROQ_API_KEY missing", provider: "groq" } };
  const model = resolveModel("groq", DEFAULT_MODEL);
  const { system, user } =
    kind === "plan" ? buildPlanPrompt(req, String(req.context?.actionsCatalog ?? "")) : buildIntentPrompt(req);

  const res = await postJson(
    "https://api.groq.com/openai/v1/chat/completions",
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
  if (!res.ok) return { ok: false, error: { code: res.error ?? "http", message: res.error ?? "error", provider: "groq" } };

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
    return plan ? { ok: true, plan, usage, raw } : { ok: false, error: { code: "invalid_json", message: "plan parse failed", provider: "groq" }, raw };
  }
  const result = parseIntentJson(raw);
  return result ? { ok: true, result, usage, raw } : { ok: false, error: { code: "invalid_json", message: "intent parse failed", provider: "groq" }, raw };
}

async function generate(req: LLMRequest): Promise<{ ok: boolean; text?: string; usage?: { totalTokens?: number }; error?: { code: string; message: string; provider: string } }> {
  const k = key();
  if (!k) return { ok: false, error: { code: "no_key", message: "GROQ_API_KEY missing", provider: "groq" } };
  const model = resolveModel("groq", DEFAULT_MODEL);
  const system = String(req.context?.systemPrompt ?? "You are Jarvis, the owner's helpful Hebrew personal assistant.");
  const res = await postJson(
    "https://api.groq.com/openai/v1/chat/completions",
    { authorization: `Bearer ${k}` },
    { model, temperature: 0.4, max_tokens: req.maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: req.text }] },
    req.timeoutMs,
  );
  if (!res.ok) return { ok: false, error: { code: res.error ?? "http", message: res.error ?? "error", provider: "groq" } };
  const data = res.json as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
  const out = (data?.choices?.[0]?.message?.content ?? "").trim();
  return out ? { ok: true, text: out, usage: { totalTokens: data?.usage?.total_tokens } } : { ok: false, error: { code: "empty", message: "empty completion", provider: "groq" } };
}

export const groqProvider: LLMProvider = {
  name: "groq",
  available: () => !!key(),
  classifyIntent: (req) => call(req, "intent"),
  planSteps: (req) => call(req, "plan"),
  generateText: (req) => generate(req),
  async health() {
    return key()
      ? { name: "groq", health: "available" as const }
      : { name: "groq", health: "unavailable" as const, reason: "GROQ_API_KEY missing" };
  },
};
