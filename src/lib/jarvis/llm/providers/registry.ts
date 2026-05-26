import "server-only";
import type { LLMProvider } from "./types";
import type { LLMProviderStatus } from "../types";
import { geminiProvider } from "./gemini";
import { groqProvider } from "./groq";
import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";
import { localProvider } from "./local";
import { isPaidProvider, type LlmConfig } from "../config";

/**
 * Builds the ordered list of usable providers from config. Enforces two gates here, before any
 * network call:
 *  - PAID GUARD: anthropic/openai are skipped unless `allowPaid` is true (no surprise billing).
 *  - KEY GUARD: a provider with no key reports `available()===false` and is skipped (local is
 *    always available — it is the mock).
 */

const ALL: Record<string, LLMProvider> = {
  gemini: geminiProvider,
  groq: groqProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
  local: localProvider,
};

export function buildProviders(cfg: LlmConfig): LLMProvider[] {
  const order = cfg.provider !== "auto" ? [cfg.provider] : cfg.priority;
  const out: LLMProvider[] = [];
  const seen = new Set<string>();
  for (const name of order) {
    if (seen.has(name)) continue;
    seen.add(name);
    const p = ALL[name];
    if (!p) continue;
    if (isPaidProvider(name) && !cfg.allowPaid) continue;
    if (!p.available()) continue;
    out.push(p);
  }
  return out;
}

export async function providerStatuses(cfg: LlmConfig): Promise<LLMProviderStatus[]> {
  const names = Object.keys(ALL);
  return Promise.all(
    names.map(async (name) => {
      const p = ALL[name];
      const base = await p.health();
      if (isPaidProvider(name) && !cfg.allowPaid) {
        return { ...base, health: "unavailable" as const, reason: "paid_disabled (set JARVIS_LLM_ALLOW_PAID=true)" };
      }
      return base;
    }),
  );
}
