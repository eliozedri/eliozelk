/**
 * LLM configuration, loaded from env. PURE (no `server-only`) so tests can pass a fake env.
 * Reading process.env is safe in Node; nothing here performs I/O or touches secrets beyond
 * presence checks. Secret VALUES are never returned or logged — only provider availability.
 */

export interface LlmConfig {
  enabled: boolean;
  /** Forced single provider, or "auto" to use the priority list. */
  provider: string;
  /** Ordered provider names to try (failover). */
  priority: string[];
  /** Optional model override (provider-specific default otherwise). */
  model: string | null;
  maxTokens: number;
  timeoutMs: number;
  minConfidence: number;
  /** 0 = unlimited. Per-instance daily request cap. */
  dailyRequestLimit: number;
  /** 0 = unlimited. Per-instance daily token cap. */
  dailyTokenLimit: number;
  /**
   * Whether providers that bill per-use (anthropic, openai) may actually run. Default FALSE —
   * even if a key is present, paid providers stay off unless the owner explicitly opts in.
   */
  allowPaid: boolean;
}

const DEFAULT_PRIORITY = ["gemini", "groq", "anthropic", "openai", "local"];
const PAID_PROVIDERS = new Set(["anthropic", "openai"]);

function num(v: string | undefined, fallback: number): number {
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  const priority = (env.JARVIS_LLM_PROVIDER_PRIORITY ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return {
    enabled: env.JARVIS_LLM_ENABLED === "true",
    provider: (env.JARVIS_LLM_PROVIDER ?? "auto").trim().toLowerCase(),
    priority: priority.length ? priority : DEFAULT_PRIORITY,
    model: env.JARVIS_LLM_MODEL?.trim() || null,
    maxTokens: num(env.JARVIS_LLM_MAX_TOKENS, 512),
    timeoutMs: num(env.JARVIS_LLM_TIMEOUT_MS, 8000),
    minConfidence: (() => {
      const c = Number(env.JARVIS_LLM_MIN_CONFIDENCE);
      return Number.isFinite(c) && c > 0 && c <= 1 ? c : 0.6;
    })(),
    dailyRequestLimit: num(env.JARVIS_LLM_DAILY_BUDGET_LIMIT, 1000),
    dailyTokenLimit: num(env.JARVIS_LLM_DAILY_TOKEN_LIMIT, 0),
    allowPaid: env.JARVIS_LLM_ALLOW_PAID === "true",
  };
}

export function isPaidProvider(name: string): boolean {
  return PAID_PROVIDERS.has(name.toLowerCase());
}

/** Env var name that holds a provider's API key (presence only — never the value). */
export function providerKeyEnvName(name: string): string | null {
  switch (name.toLowerCase()) {
    case "gemini": return "GEMINI_API_KEY";
    case "groq": return "GROQ_API_KEY";
    case "anthropic": return "ANTHROPIC_API_KEY";
    case "openai": return "OPENAI_API_KEY";
    case "local": return null; // mock — no key
    default: return null;
  }
}
