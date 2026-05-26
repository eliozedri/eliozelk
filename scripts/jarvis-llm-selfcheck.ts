/**
 * Jarvis LLM Router + Agent Reasoning self-check.
 *
 * Runs the PURE decision core (router / safety / budget / config / prompt / planner) against
 * mock providers — no network, no env keys, no server-only modules. Covers the 10 required
 * safety/fallback scenarios. Run: `npx tsx scripts/jarvis-llm-selfcheck.ts`
 */
import { routeViaProviders } from "../src/lib/jarvis/llm/router";
import { validateRoute, llmIntentToCoarse } from "../src/lib/jarvis/llm/safety";
import { loadLlmConfig } from "../src/lib/jarvis/llm/config";
import { checkBudget, recordUsage, __resetBudget } from "../src/lib/jarvis/llm/budget";
import { parseIntentJson, extractJsonObject } from "../src/lib/jarvis/llm/prompt";
import { localProvider } from "../src/lib/jarvis/llm/providers/local";
import { planDeterministic } from "../src/lib/jarvis/agent/planner";
import type { LLMProvider } from "../src/lib/jarvis/llm/providers/types";
import type { LLMRequest, LLMIntentResult, LLMProviderResult, SenderRole } from "../src/lib/jarvis/llm/types";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`✓  ${name}`); }
  else { failed++; console.log(`✗  ${name}${detail ? `  — ${detail}` : ""}`); }
}

function req(text: string, role: SenderRole = "master", mode: "intent" | "plan" = "intent"): LLMRequest {
  return { text, role, channel: "whatsapp", allowedIntents: [], maxTokens: 256, timeoutMs: 200, mode };
}
function result(partial: Partial<LLMIntentResult>): LLMIntentResult {
  return { intent: "order_intake", skill: "orderIntake", confidence: 0.9, parameters: {}, requiresClarification: false, clarificationQuestion: null, safetyLevel: "pending", ...partial };
}
function fake(name: string, fn: (r: LLMRequest) => Promise<LLMProviderResult>, avail = true): LLMProvider {
  return { name, available: () => avail, classifyIntent: fn, async health() { return { name, health: avail ? "available" : "unavailable" }; } };
}
const MIN = 0.6;

async function main() {
  // 1. LLM disabled (no env) → config.enabled false → deterministic path.
  check("1. LLM disabled by default → config.enabled === false", loadLlmConfig({}).enabled === false);

  // 2. No provider key → router has no usable provider → fallback.
  {
    const r = await routeViaProviders([fake("gemini", async () => ({ ok: true, result: result({}) }), false)], req("שלום"), { minConfidence: MIN });
    check("2. No provider key (unavailable) → router fallback", r.ok === false && r.attempts[0]?.reason === "unavailable");
  }

  // 3. Mock provider valid intent → routes, maps to correct coarse skill.
  {
    const r = await routeViaProviders([localProvider], req("כמה מוצרים ללא מחיר"), { minConfidence: MIN });
    const coarse = r.result ? llmIntentToCoarse(r.result.intent) : "none";
    check("3. Mock valid intent → routes & maps to ceo_manager", r.ok && coarse === "ceo_manager", `got intent=${r.result?.intent} coarse=${coarse}`);
  }

  // 4. Unsafe EXTERNAL → CEO intent → safety clamps to customer intake (blocked from owner skill).
  {
    const decision = validateRoute(result({ intent: "ceo_manager_request", skill: "ceoManager", safetyLevel: "pending" }), { role: "external", minConfidence: MIN });
    check("4. External CEO intent → clamped to intake", decision.action === "clamp" && decision.sanitized?.intent === "external_order_request");
  }

  // 5. Low confidence → router skips → fallback; safety also rejects.
  {
    const r = await routeViaProviders([fake("p", async () => ({ ok: true, result: result({ confidence: 0.3 }) }))], req("..."), { minConfidence: MIN });
    const dec = validateRoute(result({ confidence: 0.3 }), { role: "master", minConfidence: MIN });
    check("5. Low confidence → router fallback + safety fallback", r.ok === false && dec.action === "fallback");
  }

  // 6. Owner complex ops request → deterministic planner builds a safe multi-step plan.
  {
    const plan = planDeterministic("תבדוק מה יכול לתקוע עבודות השבוע ותן לי המלצות");
    const allReadOnly = !!plan && plan.steps.every((s) => s.safety === "read_only");
    check("6. Owner complex ops → planner returns read-only multi-step plan", !!plan && plan.steps.length >= 3 && allReadOnly, `steps=${plan?.steps.length}`);
  }

  // 7. External order text → safety accepts as customer intake (order skill only).
  {
    const decision = validateRoute(result({ intent: "external_order_request", skill: "orderIntake", safetyLevel: "pending" }), { role: "external", minConfidence: MIN });
    check("7. External order text → accepted as order intake", decision.action === "accept" && decision.sanitized?.skill === "orderIntake");
  }

  // 8. External tries personal/system → clamped (defense in depth, not just CEO).
  {
    const decision = validateRoute(result({ intent: "system_status", skill: "ceoManager", safetyLevel: "read_only" }), { role: "external", minConfidence: MIN });
    check("8. External system_status → clamped to intake", decision.action === "clamp");
  }

  // 9. Invalid provider JSON → parse null → router fallback.
  {
    check("9a. parseIntentJson(garbage) === null", parseIntentJson("not json at all") === null && extractJsonObject("nope") === null);
    const r = await routeViaProviders([fake("p", async () => ({ ok: false, error: { code: "invalid_json", message: "x" } }))], req("..."), { minConfidence: MIN });
    check("9b. Provider invalid_json → router fallback", r.ok === false && r.attempts[0]?.reason === "invalid_json");
  }

  // 10. Timeout simulation → router moves on → fallback.
  {
    const hang = fake("slow", () => new Promise<LLMProviderResult>(() => {})); // never resolves
    const r = await routeViaProviders([hang], { ...req("..."), timeoutMs: 80 }, { minConfidence: MIN });
    check("10. Hanging provider → timeout → fallback", r.ok === false && r.attempts[0]?.reason === "timeout");
  }

  // Bonus: owner write/blocked safety level → fallback (no write tooling).
  {
    const dec = validateRoute(result({ intent: "order_update", safetyLevel: "write" }), { role: "master", minConfidence: MIN });
    check("11. Owner write action → fallback (no auto-mutation)", dec.action === "fallback");
  }

  // Bonus: budget guard blocks over the daily request cap.
  {
    __resetBudget();
    const cfg = { ...loadLlmConfig({}), dailyRequestLimit: 2, enabled: true };
    recordUsage(); recordUsage();
    check("12. Budget over daily request limit → checkBudget not ok", checkBudget(cfg).ok === false);
    __resetBudget();
  }

  // Bonus: failover — first provider invalid, second valid.
  {
    const r = await routeViaProviders(
      [fake("a", async () => ({ ok: false, error: { code: "http", message: "500" } })), fake("b", async () => ({ ok: true, result: result({ intent: "personal_task", confidence: 0.8 }) }))],
      req("תרשום משימה"),
      { minConfidence: MIN },
    );
    check("13. Provider failover → second provider used", r.ok && r.provider === "b" && r.attempts[0]?.provider === "a");
  }

  console.log(`\n${passed}/${passed + failed} checks passed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
