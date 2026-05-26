/**
 * Jarvis Brain self-check — reasoning-first + department routing + safety.
 *
 * Exercises the PURE decision core (router / safety / budget / config / prompt / planner /
 * department routing / deterministic resolver) with mock providers — no network, no env keys,
 * no server-only modules. Run: `npx tsx scripts/jarvis-llm-selfcheck.ts`
 */
import { routeViaProviders } from "../src/lib/jarvis/llm/router";
import { validateRoute, llmIntentToCoarse } from "../src/lib/jarvis/llm/safety";
import { loadLlmConfig } from "../src/lib/jarvis/llm/config";
import { checkBudget, recordUsage, __resetBudget } from "../src/lib/jarvis/llm/budget";
import { parseIntentJson } from "../src/lib/jarvis/llm/prompt";
import { localProvider } from "../src/lib/jarvis/llm/providers/local";
import { planDeterministic } from "../src/lib/jarvis/agent/planner";
import { deterministicDomainIntent, matchCommandId, intentToCommandId, extractItemName } from "../src/lib/jarvis/skills/ceoManager/match";
import { departmentFor } from "../src/lib/jarvis/departments";
import { isCeoRequest } from "../src/lib/jarvis/skills/ceoManager/intent";
import type { LLMProvider } from "../src/lib/jarvis/llm/providers/types";
import type { LLMRequest, LLMIntentResult, LLMProviderResult, SenderRole } from "../src/lib/jarvis/llm/types";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`✓  ${name}`); }
  else { failed++; console.log(`✗  ${name}${detail ? `  — ${detail}` : ""}`); }
}
function req(text: string, role: SenderRole = "master"): LLMRequest {
  return { text, role, channel: "whatsapp", allowedIntents: [], maxTokens: 256, timeoutMs: 150, mode: "intent" };
}
function result(p: Partial<LLMIntentResult>): LLMIntentResult {
  return { intent: "order_intake", skill: null, confidence: 0.9, parameters: {}, requiresClarification: false, clarificationQuestion: null, safetyLevel: "read_only", ...p };
}
function fake(name: string, fn: (r: LLMRequest) => Promise<LLMProviderResult>, avail = true): LLMProvider {
  return { name, available: () => avail, classifyIntent: fn, async health() { return { name, health: avail ? "available" : "unavailable" }; } };
}
const MIN = 0.6;

async function main() {
  // ── Department routing (deterministic resolver — the LLM-off path) ──
  check("1. finance: 'סך החשבון הפתוח ללקוחות' → finance_open_balance (NOT inventory/price)",
    deterministicDomainIntent("מה סך כל החשבון שפתוח ללקוחות?") === "finance_open_balance");
  check("1b. finance has NO command (pending request, never a wrong command)",
    intentToCommandId("finance_open_balance") === null && departmentFor("finance_open_balance").domain === "finance" && departmentFor("finance_open_balance").hasCapability === false);

  check("2. inventory: 'כמה קונוסים נשארו?' → inventory_stock_lookup (NOT missing-price)",
    deterministicDomainIntent("כמה קונוסים נשארו?") === "inventory_stock_lookup" && matchCommandId("כמה קונוסים נשארו?") === "inventory_stock_lookup");
  check("2b. item-name extracted = קונוסים", extractItemName("כמה קונוסים נשארו?") === "קונוסים");
  check("2c. yellow paint → stock + item 'צבע צהוב'",
    deterministicDomainIntent("מה המלאי של צבע צהוב?") === "inventory_stock_lookup" && extractItemName("מה המלאי של צבע צהוב?") === "צבע צהוב");

  check("3. catalog: 'כמה מוצרים ללא מחיר?' → catalog_missing_price (warehouse≠catalog)",
    deterministicDomainIntent("כמה מוצרים ללא מחיר?") === "catalog_missing_price" && departmentFor("catalog_missing_price").domain === "catalog");

  check("4. operations: 'מה יכול לתקוע אותנו השבוע?' → multi-step routine",
    (() => { const p = planDeterministic("מה יכול לתקוע אותנו השבוע?"); return !!p && p.steps.length >= 4 && p.steps.every((s) => s.safety === "read_only"); })());

  check("5. fleet: 'איזה כלים לא שמישים?' → fleet_equipment_status → fleet command",
    deterministicDomainIntent("איזה כלים לא שמישים?") === "fleet_equipment_status" && intentToCommandId("fleet_equipment_status") === "fleet_unusable_equipment" && departmentFor("fleet_equipment_status").domain === "fleet");

  check("6. CEO delegation: 'תבקש מה-CEO לבדוק את ההתראות' → recognized as CEO request",
    isCeoRequest("תבקש מה-CEO לבדוק למה ההתראות לא מופיעות"));

  check("7. orders: 'איזה הזמנות תקועות?' → stuck_orders (operations)",
    deterministicDomainIntent("איזה הזמנות תקועות?") === "stuck_orders");
  check("7b. 'כמה הזמנות פתוחות?' → orders_status (orders dept)",
    deterministicDomainIntent("כמה הזמנות פתוחות יש?") === "orders_status" && departmentFor("orders_status").domain === "orders");

  // ── Safety: external customers blocked from internal departments ──
  check("8. EXTERNAL finance question → clamped to customer intake (no internal data)",
    validateRoute(result({ intent: "finance_open_balance" }), { role: "external", minConfidence: MIN }).action === "clamp");
  check("8b. EXTERNAL stock question → clamped to customer intake",
    validateRoute(result({ intent: "inventory_stock_lookup" }), { role: "external", minConfidence: MIN }).action === "clamp");
  check("8c. all internal department intents map to the ceo_manager dispatcher (owner)",
    ["finance_open_balance", "fleet_equipment_status", "inventory_stock_lookup", "catalog_missing_price", "orders_status", "stuck_orders", "system_status"].every((i) => llmIntentToCoarse(i as never) === "ceo_manager"));

  // ── LLM lifecycle / fallback / budget ──
  check("9. LLM disabled by default → config.enabled === false", loadLlmConfig({}).enabled === false);
  {
    const r = await routeViaProviders([localProvider], req("כמה קונוסים נשארו"), { minConfidence: MIN });
    check("10. mock provider routes a stock question (not price)", r.ok && r.result?.intent === "inventory_stock_lookup", `got ${r.result?.intent}`);
  }
  {
    const r = await routeViaProviders([fake("p", async () => ({ ok: true, result: result({ confidence: 0.3 }) }))], req("..."), { minConfidence: MIN });
    check("11. low confidence → router fallback", r.ok === false);
  }
  check("12. invalid JSON → parse null → fallback", parseIntentJson("garbage") === null);
  {
    const hang = fake("slow", () => new Promise<LLMProviderResult>(() => {}));
    const r = await routeViaProviders([hang], { ...req("..."), timeoutMs: 60 }, { minConfidence: MIN });
    check("13. hanging provider → timeout → fallback", r.ok === false && r.attempts[0]?.reason === "timeout");
  }
  {
    const r = await routeViaProviders(
      [fake("a", async () => ({ ok: false, error: { code: "http", message: "500" } })), fake("b", async () => ({ ok: true, result: result({ intent: "fleet_equipment_status", confidence: 0.8 }) }))],
      req("איזה כלים לא שמישים"), { minConfidence: MIN },
    );
    check("14. provider failover gemini→groq style (a fails → b)", r.ok && r.provider === "b");
  }
  check("15. owner write safetyLevel → fallback (no auto-mutation)",
    validateRoute(result({ intent: "order_update", safetyLevel: "write" }), { role: "master", minConfidence: MIN }).action === "fallback");
  {
    __resetBudget();
    const cfg = { ...loadLlmConfig({}), dailyRequestLimit: 1, enabled: true };
    recordUsage();
    check("16. budget cap → checkBudget not ok", checkBudget(cfg).ok === false);
    __resetBudget();
  }

  console.log(`\n${passed}/${passed + failed} checks passed`);
  if (failed > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
