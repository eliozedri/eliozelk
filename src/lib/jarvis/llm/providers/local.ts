import type { LLMProvider } from "./types";
import type { LLMRequest, LLMProviderResult, LlmIntent, SafetyLevel } from "../types";

/**
 * Local / mock provider. PURE — no network, no key, always "available". It returns a
 * deterministic structured result from light Hebrew keyword heuristics, so:
 *  - integration tests have a real LLMProvider to exercise the router/safety pipeline, and
 *  - if an operator explicitly puts "local" in the priority while LLM is enabled, Jarvis still
 *    produces structured output offline (quality ≈ deterministic; it is a mock, not a model).
 * It never throws and never claims high confidence it cannot justify.
 */

interface Rule {
  re: RegExp;
  intent: LlmIntent;
  skill: string | null;
  safety: SafetyLevel;
}

const OWNER_RULES: Rule[] = [
  { re: /תפריט|menu/i, intent: "owner_menu", skill: null, safety: "read_only" },
  { re: /ceo|מנהל\s+המערכת|מנכ"?ל/i, intent: "ceo_manager_request", skill: "ceoManager", safety: "pending" },
  { re: /מלאי|חוסר|low\s*stock|ללא\s+מחיר|סיכון/i, intent: "operations_inventory_query", skill: "ceoManager", safety: "read_only" },
  { re: /סטטוס|מצב\s+המערכת|תקוע/i, intent: "system_status", skill: "ceoManager", safety: "read_only" },
  { re: /תזכיר|תזכורת/i, intent: "reminder_request", skill: "personalArea", safety: "pending" },
  { re: /משימה|תרשום/i, intent: "personal_task", skill: "personalArea", safety: "pending" },
  { re: /פתק/i, intent: "personal_note", skill: "personalArea", safety: "pending" },
  { re: /דוח\s+יומי/i, intent: "daily_report", skill: "personalArea", safety: "read_only" },
  { re: /סרוק|מסמך|קרא\s+את/i, intent: "ocr_document", skill: "ocrDocument", safety: "pending" },
  { re: /הזמנה|טיוטה|הוסף|הסר|כמות/i, intent: "order_intake", skill: "orderIntake", safety: "pending" },
];

const EXTERNAL_RULES: Rule[] = [
  { re: /^(שלום|היי|הי|אהלן|בוקר טוב|ערב טוב)/i, intent: "external_greeting", skill: null, safety: "read_only" },
  { re: /מאשר|אישור|זה בסדר|שלח/i, intent: "confirmation", skill: "orderIntake", safety: "pending" },
  { re: /בטל|ביטול/i, intent: "cancellation", skill: "orderIntake", safety: "pending" },
  { re: /נציג|לדבר עם/i, intent: "representative_request", skill: "orderIntake", safety: "read_only" },
  { re: /.*/, intent: "external_order_request", skill: "orderIntake", safety: "pending" },
];

function classify(text: string, role: string): { intent: LlmIntent; skill: string | null; safety: SafetyLevel; conf: number } {
  const rules = role === "external" || role === "unknown" ? EXTERNAL_RULES : OWNER_RULES;
  for (const r of rules) {
    if (r.re.test(text)) return { intent: r.intent, skill: r.skill, safety: r.safety, conf: 0.7 };
  }
  return { intent: "unknown", skill: null, safety: "read_only", conf: 0.3 };
}

export const localProvider: LLMProvider = {
  name: "local",
  available: () => true,
  async classifyIntent(req: LLMRequest): Promise<LLMProviderResult> {
    const c = classify(req.text ?? "", req.role);
    return {
      ok: true,
      result: {
        intent: c.intent,
        skill: c.skill,
        confidence: c.conf,
        parameters: {},
        requiresClarification: c.intent === "unknown",
        clarificationQuestion: c.intent === "unknown" ? "אפשר לנסח קצת אחרת?" : null,
        safetyLevel: c.safety,
      },
      usage: { totalTokens: 0 },
    };
  },
  async health() {
    return { name: "local", health: "available" as const };
  },
};
