import type { LLMProvider } from "./providers/types";
import type { LLMRequest, LLMProviderResult, LLMUsage } from "./types";

/**
 * Pure routing core: try providers in the given order, with a hard per-call timeout, until one
 * returns a usable result. Knows nothing about env or which providers exist — they are injected,
 * which is what makes this unit-testable with fakes. The orchestration index builds the ordered
 * provider list from config + the registry and calls this.
 */

export interface RouterResult {
  ok: boolean;
  result?: LLMProviderResult["result"];
  plan?: LLMProviderResult["plan"];
  usage?: LLMUsage;
  provider?: string;
  /** Per-provider failure reasons in order tried (audit; no message content). */
  attempts: Array<{ provider: string; reason: string }>;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | { __timeout: true }> {
  if (!ms || ms <= 0) return p;
  return Promise.race([
    p,
    new Promise<{ __timeout: true }>((resolve) => setTimeout(() => resolve({ __timeout: true }), ms)),
  ]);
}

export async function routeViaProviders(
  providers: LLMProvider[],
  req: LLMRequest,
  opts: { minConfidence: number },
): Promise<RouterResult> {
  const attempts: RouterResult["attempts"] = [];
  const wantPlan = req.mode === "plan";

  for (const provider of providers) {
    if (!provider.available()) {
      attempts.push({ provider: provider.name, reason: "unavailable" });
      continue;
    }
    if (wantPlan && !provider.planSteps) {
      attempts.push({ provider: provider.name, reason: "no_plan_support" });
      continue;
    }

    let res: LLMProviderResult | { __timeout: true };
    try {
      const call = wantPlan ? provider.planSteps!(req) : provider.classifyIntent(req);
      res = await withTimeout(call, req.timeoutMs);
    } catch (err) {
      attempts.push({ provider: provider.name, reason: `exception:${err instanceof Error ? err.message : "?"}` });
      continue;
    }

    if ((res as { __timeout?: true }).__timeout) {
      attempts.push({ provider: provider.name, reason: "timeout" });
      continue;
    }
    const r = res as LLMProviderResult;
    if (!r.ok) {
      attempts.push({ provider: provider.name, reason: r.error?.code ?? "not_ok" });
      continue;
    }

    if (wantPlan) {
      if (!r.plan) {
        attempts.push({ provider: provider.name, reason: "invalid_plan" });
        continue;
      }
      return { ok: true, plan: r.plan, usage: r.usage, provider: provider.name, attempts };
    }

    if (!r.result) {
      attempts.push({ provider: provider.name, reason: "invalid_json" });
      continue;
    }
    if (r.result.confidence < opts.minConfidence) {
      attempts.push({ provider: provider.name, reason: "low_confidence" });
      continue;
    }
    return { ok: true, result: r.result, usage: r.usage, provider: provider.name, attempts };
  }

  return { ok: false, attempts };
}
