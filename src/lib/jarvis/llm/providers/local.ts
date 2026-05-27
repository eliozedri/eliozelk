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
  // Inventory/catalog — specific intents BEFORE the generic ones (order matters).
  { re: /נגמר|אזל|אפס\s*מלאי|חסר\s+במלאי|ללא\s+מלאי|out\s*of\s*stock/i, intent: "inventory_missing_or_zero", skill: "operations_inventory", safety: "read_only" },
  { re: /נמוך|עומד\s+להיגמר|להיגמר|לקראת\s+סיום|מתחת\s+למינימום|low\s*stock/i, intent: "inventory_low_stock", skill: "operations_inventory", safety: "read_only" },
  { re: /(ללא|בלי|חסר|אין)\s+ספק/i, intent: "catalog_missing_supplier", skill: "operations_inventory", safety: "read_only" },
  { re: /(ללא|בלי|חסר)\s+מחיר|ללא\s+תמחור/i, intent: "catalog_missing_price", skill: "operations_inventory", safety: "read_only" },
  { re: /מה\s+כדאי\s+להזמין|המלצ.*רכש|מה\s+להזמין|רשימת\s+קניות|לרכוש/i, intent: "purchase_recommendation_readonly", skill: "operations_inventory", safety: "read_only" },
  { re: /חשבון.{0,12}(פתוח|לקוח)|(פתוח|חוב|יתר|חייב).{0,14}לקוח|כמה\s+כסף|סך\s+(כל\s+)?ה?חשבון|גביי?ה|חובות|מאזן\s+לקוח/i, intent: "finance_open_balance", skill: "finance", safety: "read_only" },
  { re: /כלי(ם)?\s+(לא\s+שמיש|תקול)|לא\s+שמיש|ציוד\s+(תקול|בטיפול)|רכב.*(תקול|בטיפול)|טסט\s+פג|ביטוח\s+פג|מושבת/i, intent: "fleet_equipment_status", skill: "fleet", safety: "read_only" },
  { re: /סיכון|מה\s+(יכול\s+)?לתקוע|דוח\s+תפעולי|בעיות\s+תפעוליות/i, intent: "operations_risk_report", skill: "operations", safety: "read_only" },
  { re: /הזמנות\s+תקועות|הזמנ.*תקוע|מה\s+תקוע/i, intent: "stuck_orders", skill: "operations", safety: "read_only" },
  { re: /טיוט(ות|ה)|ממתינ.*לאישור|תור\s+הזמנות/i, intent: "pending_order_drafts", skill: "orders", safety: "read_only" },
  { re: /הזמנות\s+פתוחות|כמה\s+הזמנות|מצב\s+ההזמנות/i, intent: "orders_status", skill: "orders", safety: "read_only" },
  { re: /(כמה|מלאי\s+של|יש|נשאר|נותר|כמות).*(נשאר|נותר|מלאי|במלאי|כמות)|מלאי\s+של/i, intent: "inventory_stock_lookup", skill: "operations_inventory", safety: "read_only" },
  { re: /תבנה\s+(לי\s+)?יכולת|תוסיף\s+(לי\s+)?יכולת|תפתח\s+(לי\s+)?(סקיל|skill|יכולת)|build\s+(a\s+)?skill|אין\s+לך\s+יכולת/i, intent: "capability_request", skill: "ceoManager", safety: "pending" },
  { re: /ceo|מנהל\s+המערכת|מנכ"?ל/i, intent: "ceo_manager_request", skill: "ceoManager", safety: "pending" },
  { re: /סטטוס|מצב\s+המערכת/i, intent: "system_status", skill: "ceoManager", safety: "read_only" },
  { re: /תזכיר|תזכורת/i, intent: "reminder_request", skill: "personalArea", safety: "pending" },
  { re: /משימה|תרשום/i, intent: "personal_task", skill: "personalArea", safety: "pending" },
  { re: /פתק/i, intent: "personal_note", skill: "personalArea", safety: "pending" },
  { re: /דוח\s+יומי/i, intent: "daily_report", skill: "personalArea", safety: "read_only" },
  { re: /סרוק|מסמך|קרא\s+את/i, intent: "ocr_document", skill: "ocrDocument", safety: "pending" },
  { re: /תערוך\s+(לי\s+)?(את\s+)?התמונה|לערוך\s+(את\s+)?התמונה|עריכת\s+תמונה/i, intent: "image_editing", skill: "imageCreative", safety: "read_only" },
  { re: /תיצור\s+(לי\s+)?תמונה|תעשה\s+(לי\s+)?תמונה|תייצר\s+תמונה|צור\s+תמונה|נאנו\s*בננה|nano\s*banana|בסגנון\s+הזה|תמונה\s+בסגנון/i, intent: "image_creation", skill: "imageCreative", safety: "read_only" },
  { re: /קוד|בילד|build|לוג(ים)?|logs|git|דיפלוי|deploy|פרומפט\s+לקלוד|claude|מודול\b|תקלה\s+בקוד|למה\s+ה?בילד|תבנה\s+לי\s+(אפליקצי|אתר|מערכת|פרויקט|רפו)|פרויקט\s+חדש|new\s+(project|app|repo)|תחבר\s+(לי\s+)?(כלי|יכולת)/i, intent: "development_request", skill: "development", safety: "read_only" },
  { re: /תעזור\s+לי\s+לחשוב|המלצה|תסביר\s+לי|מה\s+עדיף|בוא\s+נבנה\s+תוכנית|תוכנית\s+פעולה|רעיון/i, intent: "general_assistant", skill: "generalAssistant", safety: "read_only" },
  { re: /הזמנה|טיוטה|הוסף|הסר/i, intent: "order_intake", skill: "orderIntake", safety: "pending" },
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
