import "server-only";
import type { LLMProvider } from "./types";
import type { LLMRequest, LLMProviderResult } from "../types";
import { buildIntentPrompt, buildPlanPrompt, parseIntentJson, parsePlanJson } from "../prompt";
import { postJson, resolveModel } from "./http";

/**
 * Gemini provider (Google Generative Language API) — FIRST priority, free-tier friendly.
 * Key from GEMINI_API_KEY (sent as a header, never in the URL/logs). Disabled automatically when
 * no key is present (`available()` → false). One tiny JSON-mode call per classification.
 */

const DEFAULT_MODEL = "gemini-2.0-flash";

function key(): string | undefined {
  return process.env.GEMINI_API_KEY;
}

async function call(req: LLMRequest, kind: "intent" | "plan"): Promise<LLMProviderResult> {
  const k = key();
  if (!k) return { ok: false, error: { code: "no_key", message: "GEMINI_API_KEY missing", provider: "gemini" } };
  const model = resolveModel("gemini", DEFAULT_MODEL);
  const { system, user } =
    kind === "plan"
      ? buildPlanPrompt(req, String(req.context?.actionsCatalog ?? ""))
      : buildIntentPrompt(req);

  const res = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": k },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, maxOutputTokens: req.maxTokens, responseMimeType: "application/json" },
    },
    req.timeoutMs,
  );
  if (!res.ok) return { ok: false, error: { code: res.error ?? "http", message: res.error ?? "error", provider: "gemini" } };

  const data = res.json as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const usage = {
    promptTokens: data?.usageMetadata?.promptTokenCount,
    completionTokens: data?.usageMetadata?.candidatesTokenCount,
    totalTokens: data?.usageMetadata?.totalTokenCount,
  };
  if (kind === "plan") {
    const plan = parsePlanJson(raw);
    return plan ? { ok: true, plan, usage, raw } : { ok: false, error: { code: "invalid_json", message: "plan parse failed", provider: "gemini" }, raw };
  }
  const result = parseIntentJson(raw);
  return result ? { ok: true, result, usage, raw } : { ok: false, error: { code: "invalid_json", message: "intent parse failed", provider: "gemini" }, raw };
}

async function generate(req: LLMRequest): Promise<{ ok: boolean; text?: string; usage?: { totalTokens?: number }; error?: { code: string; message: string; provider: string } }> {
  const k = key();
  if (!k) return { ok: false, error: { code: "no_key", message: "GEMINI_API_KEY missing", provider: "gemini" } };
  const model = resolveModel("gemini", DEFAULT_MODEL);
  const system = String(req.context?.systemPrompt ?? "You are Jarvis, the owner's helpful Hebrew personal assistant.");
  const res = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": k },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: req.text }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: req.maxTokens },
    },
    req.timeoutMs,
  );
  if (!res.ok) return { ok: false, error: { code: res.error ?? "http", message: res.error ?? "error", provider: "gemini" } };
  const data = res.json as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { totalTokenCount?: number } };
  const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  return out ? { ok: true, text: out, usage: { totalTokens: data?.usageMetadata?.totalTokenCount } } : { ok: false, error: { code: "empty", message: "empty completion", provider: "gemini" } };
}

export const geminiProvider: LLMProvider = {
  name: "gemini",
  available: () => !!key(),
  classifyIntent: (req) => call(req, "intent"),
  planSteps: (req) => call(req, "plan"),
  generateText: (req) => generate(req),
  async health() {
    return key()
      ? { name: "gemini", health: "available" as const }
      : { name: "gemini", health: "unavailable" as const, reason: "GEMINI_API_KEY missing" };
  },
};
