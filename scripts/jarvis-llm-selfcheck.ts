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
import { classifyDevIntent, classifyDevRisk, isAmbiguousDevRequest } from "../src/lib/jarvis/skills/development/classify";
import { DEV_PROJECTS, findProject } from "../src/lib/jarvis/skills/development/registry";
import { evaluateGate } from "../src/lib/jarvis/skills/development/approvalGate";
import { makeMockGithubClient } from "../src/lib/jarvis/skills/development/githubClient";
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
  check("4b. warehouse: 'מה עומד להיגמר במחסן?' → inventory_low_stock",
    deterministicDomainIntent("מה עומד להיגמר במחסן?") === "inventory_low_stock");

  check("5. fleet: 'איזה כלים לא שמישים?' → fleet_equipment_status → fleet command",
    deterministicDomainIntent("איזה כלים לא שמישים?") === "fleet_equipment_status" && intentToCommandId("fleet_equipment_status") === "fleet_unusable_equipment" && departmentFor("fleet_equipment_status").domain === "fleet");

  check("6. CEO delegation: 'תבקש מה-CEO לבדוק את ההתראות' → recognized as CEO request",
    isCeoRequest("תבקש מה-CEO לבדוק למה ההתראות לא מופיעות"));
  check("6b. capability build: 'תבנה יכולת לבדוק חוסרים לפי הזמנות פתוחות' → capability_request (no fake report)",
    deterministicDomainIntent("תבנה יכולת לבדוק חוסרים לפי הזמנות פתוחות") === "capability_request" && departmentFor("capability_request").hasCapability === false);

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

  // ── Provider priority + NO-OVERRIDE (dispatcher fallback must not override an accepted LLM decision) ──
  {
    // Gemini returns a valid stock decision → it resolves to its OWN command, never re-mapped to price.
    const r = await routeViaProviders([fake("gemini", async () => ({ ok: true, result: result({ intent: "inventory_stock_lookup", confidence: 0.9 }) }))], req("כמה קונוסים נשארו"), { minConfidence: MIN });
    const cmd = r.result ? intentToCommandId(r.result.intent) : null;
    check("17. Gemini stock decision honored → command stays inventory_stock_lookup (NOT price)",
      r.ok && r.provider === "gemini" && cmd === "inventory_stock_lookup" && cmd !== intentToCommandId("catalog_missing_price"));
  }
  {
    // Gemini fails → Groq returns the stock decision → honored (not overridden).
    const r = await routeViaProviders(
      [fake("gemini", async () => ({ ok: false, error: { code: "http", message: "429" } })), fake("groq", async () => ({ ok: true, result: result({ intent: "inventory_stock_lookup", confidence: 0.85 }) }))],
      req("כמה קונוסים נשארו"), { minConfidence: MIN },
    );
    check("18. Gemini fails → Groq stock decision honored (provider=groq, command=stock)",
      r.ok && r.provider === "groq" && intentToCommandId(r.result!.intent) === "inventory_stock_lookup");
  }
  {
    // Both providers fail → only THEN may the deterministic dispatcher fallback run.
    const r = await routeViaProviders(
      [fake("gemini", async () => ({ ok: false, error: { code: "timeout", message: "t" } })), fake("groq", async () => ({ ok: false, error: { code: "http", message: "500" } }))],
      req("כמה קונוסים נשארו"), { minConfidence: MIN },
    );
    check("19. Both providers fail → router !ok → deterministic fallback allowed (then matchCommandId→stock)",
      r.ok === false && matchCommandId("כמה קונוסים נשארו") === "inventory_stock_lookup");
  }
  check("20. invariant: an accepted stock intent can NEVER resolve to the missing-price command",
    intentToCommandId("inventory_stock_lookup") === "inventory_stock_lookup" && intentToCommandId("inventory_stock_lookup") !== "items_missing_price");

  // ── Personal + General assistant (owner conversational) ──
  {
    const r1 = await localProvider.classifyIntent(req("תזכיר לי להתקשר לדניאל מחר"));
    check("21. personal: 'תזכיר לי להתקשר לדניאל מחר' → reminder_request (personal)", r1.result?.intent === "reminder_request" && llmIntentToCoarse("reminder_request") === "personal");
    const r2 = await localProvider.classifyIntent(req("תעזור לי לחשוב איך להתקדם עם המחסן"));
    check("22. general: 'תעזור לי לחשוב…' → general_assistant (open reasoning)", r2.result?.intent === "general_assistant" && llmIntentToCoarse("general_assistant") === "general");
  }

  // ── Development / Claude Code skill ──
  check("23. dev: 'בדוק למה הבילד נפל' → build_error_analysis / READ_ONLY",
    classifyDevIntent("בדוק למה הבילד נפל") === "build_error_analysis" && classifyDevRisk("בדוק למה הבילד נפל", "build_error_analysis") === "READ_ONLY");
  check("24. dev: 'תכין פרומפט לקלוד לתקן את ההתראות' → prepare_claude_prompt / TASK_ONLY",
    classifyDevIntent("תכין פרומפט לקלוד לתקן את ההתראות") === "prepare_claude_prompt" && classifyDevRisk("x", "prepare_claude_prompt") === "TASK_ONLY");
  check("25. dev DANGEROUS: 'תמחק את כל הטבלאות הישנות' → DANGEROUS (blocked)",
    classifyDevRisk("תמחק את כל הטבלאות הישנות", classifyDevIntent("תמחק את כל הטבלאות הישנות")) === "DANGEROUS");
  check("26. new project: 'תבנה לי אפליקציית ווב לאימון כושר' → new_project_request / NEW_PROJECT_PROPOSAL",
    classifyDevIntent("תבנה לי אפליקציית ווב לאימון כושר") === "new_project_request" && classifyDevRisk("x", "new_project_request") === "NEW_PROJECT_PROPOSAL");
  check("27. ambiguous: 'תתקן את זה' → ask clarification (not guess)", isAmbiguousDevRequest("תתקן את זה"));
  check("28. dev coarse mapping owner-only", llmIntentToCoarse("development_request") === "development" && llmIntentToCoarse("general_assistant") === "general");
  check("29. EXTERNAL dev/general → clamped to customer intake (no internal access)",
    validateRoute(result({ intent: "development_request" }), { role: "external", minConfidence: MIN }).action === "clamp" &&
    validateRoute(result({ intent: "general_assistant" }), { role: "external", minConfidence: MIN }).action === "clamp");

  // ── Elkayam production protection (registry policy) ──
  {
    const elk = DEV_PROJECTS.find((p) => p.projectId === "elkayam");
    check("30. Elkayam = sensitive production with full approval gates",
      !!elk && elk.projectType === "sensitive_production_project" && elk.requiresApprovalForMain === true &&
      elk.requiresApprovalForDeploy === true && elk.requiresApprovalForMigration === true && elk.requiresApprovalForSecrets === true);
  }

  // ── Media is context, not intent (the Nano Banana bug) ──
  {
    // LLM (gemini-mock) decides image+caption → creative, NOT OCR. Proves the brain, not media type, decides.
    const r = await routeViaProviders([fake("gemini", async () => ({ ok: true, result: result({ intent: "image_creation", confidence: 0.9 }) }))], req("אני רוצה שתיצור לי תמונה עם הכלי נאנו בננה 2"), { minConfidence: MIN });
    check("31. image+caption 'תיצור לי תמונה…נאנו בננה' → image_creation→creative (NOT OCR)",
      r.ok && r.provider === "gemini" && llmIntentToCoarse(r.result!.intent) === "creative" && llmIntentToCoarse(r.result!.intent) !== "ocr_document");
    const r2 = await localProvider.classifyIntent(req("אני רוצה שתיצור לי תמונה עם הכלי נאנו בננה 2"));
    check("31b. deterministic mock also → image_creation (not ocr)", r2.result?.intent === "image_creation");
  }
  {
    const r = await localProvider.classifyIntent(req("קרא את המסמך"));
    check("32. image+caption 'קרא את המסמך' → ocr_document", r.result?.intent === "ocr_document" && llmIntentToCoarse("ocr_document") === "ocr_document");
  }
  {
    const r = await localProvider.classifyIntent(req("תחבר לי יכולת לייצר תמונות"));
    check("33. 'תחבר לי יכולת לייצר תמונות' → development_request", r.result?.intent === "development_request");
  }
  check("34. EXTERNAL image-creation → clamped to customer intake (no owner creative)",
    validateRoute(result({ intent: "image_creation" }), { role: "external", minConfidence: MIN }).action === "clamp" &&
    validateRoute(result({ intent: "image_editing" }), { role: "external", minConfidence: MIN }).action === "clamp");
  check("35. creative coarse mapping", llmIntentToCoarse("image_creation") === "creative" && llmIntentToCoarse("image_editing") === "creative");

  // ── Autonomous capability resolution: tool-connection routing ──
  {
    const r = await localProvider.classifyIntent(req("תחבר לי כלי יצירת תמונות"));
    check("36. 'תחבר לי כלי יצירת תמונות' → tool_connection_request → development",
      r.result?.intent === "tool_connection_request" && llmIntentToCoarse("tool_connection_request") === "development");
  }
  check("37. dev sub 'תחבר את נאנו בננה' → tool_connection_request / SAFE_EDIT (approval)",
    classifyDevIntent("תחבר את נאנו בננה 2 ליצירת תמונות") === "tool_connection_request" &&
    classifyDevRisk("תחבר את נאנו בננה 2", "tool_connection_request") === "SAFE_EDIT");
  check("38. 'תכין לי פרומפט לנאנו בננה לפי התמונה' → image_creation (creative, not OCR)",
    (await localProvider.classifyIntent(req("תכין לי פרומפט לנאנו בננה לפי התמונה"))).result?.intent === "image_creation");

  // ── Development approval gates (structured) ──
  check("39. gate: external → blocked_external_user", evaluateGate({ role: "external", risk: "READ_ONLY", githubConfigured: false, claudeConfigured: false }) === "blocked_external_user");
  check("40. gate: DANGEROUS → blocked_dangerous", evaluateGate({ role: "master", risk: "DANGEROUS", githubConfigured: true, claudeConfigured: true }) === "blocked_dangerous");
  check("41. gate: paid → requires_paid_api_approval", evaluateGate({ role: "master", risk: "SAFE_EDIT", githubConfigured: true, claudeConfigured: true, paid: true }) === "requires_paid_api_approval");
  check("42. gate: READ_ONLY → allowed_read_only", evaluateGate({ role: "master", risk: "READ_ONLY", githubConfigured: false, claudeConfigured: false }) === "allowed_read_only");
  check("43. gate: TASK_ONLY → allowed_now", evaluateGate({ role: "master", risk: "TASK_ONLY", githubConfigured: false, claudeConfigured: false }) === "allowed_now");
  check("44. gate: new repo, no github → requires_github_config", evaluateGate({ role: "master", risk: "NEW_PROJECT_PROPOSAL", githubConfigured: false, claudeConfigured: false, needsRepoCreate: true }) === "requires_github_config");
  check("45. gate: SAFE_EDIT, github but no claude → requires_claude_setup", evaluateGate({ role: "master", risk: "SAFE_EDIT", githubConfigured: true, claudeConfigured: false }) === "requires_claude_setup");
  check("46. gate: SAFE_EDIT, no github → requires_github_config", evaluateGate({ role: "master", risk: "SAFE_EDIT", githubConfigured: false, claudeConfigured: false }) === "requires_github_config");

  // ── Mock GitHub client (issue/repo flow without live creds) ──
  {
    const { client, calls } = makeMockGithubClient();
    const issue = await client.createIssue("eliozedri", "eliozelk", "[Jarvis] test", "body", ["jarvis"]);
    const repo = await client.createRepo("fitness-app", true);
    check("47. mock github: createIssue returns url + records call",
      issue.ok && !!issue.url && issue.number! > 0 && calls.some((c) => c.method === "createIssue"));
    check("48. mock github: createRepo returns url", repo.ok && !!repo.url);
  }

  // ── Multi-project resolution ──
  check("49. 'אלקיים' → elkayam project", findProject("תתקן את בעיית ההתראות באלקיים")?.projectId === "elkayam");
  check("50. 'jarvis' → jarvis project", findProject("תבדוק את מודול ה-jarvis")?.projectId === "jarvis");
  check("51. no project named (2 registered) → null (ambiguous → ask)", findProject("בדוק למה הבילד נפל") === null && DEV_PROJECTS.length >= 2);

  console.log(`\n${passed}/${passed + failed} checks passed`);
  if (failed > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
