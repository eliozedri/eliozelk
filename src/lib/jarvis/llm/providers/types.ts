import type { LLMRequest, LLMProviderResult, LLMProviderStatus } from "../types";

/**
 * Provider contract. A provider turns an `LLMRequest` into a structured `LLMProviderResult`.
 * Implementations are server-side (fetch) EXCEPT the mock, which is pure. The router treats every
 * provider uniformly and applies its own timeout + failover, so a provider that ignores the
 * timeout still cannot hang the pipeline.
 */
export interface LLMProvider {
  readonly name: string;
  /** Cheap sync check: is this provider configured (key present / always-on for mock)? */
  available(): boolean;
  /** Classify intent (and optionally extract params). Must never throw — return ok:false instead. */
  classifyIntent(req: LLMRequest): Promise<LLMProviderResult>;
  /** Optional: produce an agent-reasoning plan. */
  planSteps?(req: LLMRequest): Promise<LLMProviderResult>;
  /** Optional: generate a free-text reply (for the General Assistant). Returns plain text. */
  generateText?(req: LLMRequest): Promise<{ ok: boolean; text?: string; usage?: import("../types").LLMUsage; error?: import("../types").LLMError }>;
  /** Lightweight reachability/config check (no business call). */
  health(): Promise<LLMProviderStatus>;
}
