import type { LlmConfig } from "./config";
import type { LLMUsage } from "./types";

/**
 * Usage guardrails. PURE module with process-local mutable counters.
 *
 * HONEST LIMITATION: the counter lives in memory of a single serverless instance, so on
 * Fluid Compute (instances reused, but several may exist) it is a best-effort per-instance cap,
 * NOT a hard global daily limit. A DB-backed counter is the documented next step. The real
 * protection against paid overage is using a free-tier provider key + provider-side rate limits.
 */

interface DayCounter {
  day: string; // UTC YYYY-MM-DD
  requests: number;
  tokens: number;
}

let counter: DayCounter = { day: utcDay(), requests: 0, tokens: 0 };

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function rollover(): void {
  const today = utcDay();
  if (counter.day !== today) counter = { day: today, requests: 0, tokens: 0 };
}

export interface BudgetDecision {
  ok: boolean;
  reason?: string;
}

/** Call BEFORE a provider request. */
export function checkBudget(cfg: LlmConfig): BudgetDecision {
  rollover();
  if (cfg.dailyRequestLimit > 0 && counter.requests >= cfg.dailyRequestLimit) {
    return { ok: false, reason: "daily_request_limit" };
  }
  if (cfg.dailyTokenLimit > 0 && counter.tokens >= cfg.dailyTokenLimit) {
    return { ok: false, reason: "daily_token_limit" };
  }
  return { ok: true };
}

/** Call AFTER a successful provider request to account usage. */
export function recordUsage(usage?: LLMUsage): void {
  rollover();
  counter.requests += 1;
  counter.tokens += usage?.totalTokens ?? 0;
}

export function budgetSnapshot(): Readonly<DayCounter> {
  rollover();
  return { ...counter };
}

/** Test-only reset. */
export function __resetBudget(): void {
  counter = { day: utcDay(), requests: 0, tokens: 0 };
}
