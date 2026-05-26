import { isPureStarter } from "./summary";

/**
 * External-message content classification (deterministic, keyword-based — NOT an LLM).
 *
 * The gateway uses this to decide, for an external customer, between:
 *   - a concrete order/request → create a pending draft directly
 *   - a greeting/starter/vague/noise opener → open the intake wizard (ask for details)
 *
 * It is intentionally conservative: a misjudged "order" at worst lands a draft staff
 * review anyway; a misjudged "opener" just costs the customer one extra guiding step
 * (the wizard then captures their next message as the request). No message is ever
 * dropped, and the owner menu is never reachable here.
 */

// Concrete Elkayam work items/services. Vague intent words (עבודה / הצעת מחיר / פרטים)
// are deliberately EXCLUDED so "אפשר הצעת מחיר?" opens the wizard instead of drafting.
const WORK_KEYWORDS =
  /תמרור|שלט|שילוט|סימ[ונ]|צבע|צביע|מחסום|אבני?\s*שפה|פס(י)?\s*האטה|במפר|כביש|חני(ה|יה|ון)|מעק[הות]|עמוד|רמזור|מדרכ|צומת|כיכר|נתיב|קונוס|ראש\s*חץ|עיני\s*חתול|דגלון|גדר\b|הצב[הת]|התקנ/;

/** True when the text names a concrete road-marking/sign work item → treat as an order. */
export function looksLikeOrder(text: string): boolean {
  return WORK_KEYWORDS.test(text);
}

const GREETING = /^(שלום|היי|הי|הלו|אהלן|אהלן וסהלן|בוקר טוב|ערב טוב|צהריים טובים|מה נשמע|מה קורה|מה המצב|hi|hello|hey)/i;

/**
 * True when the message has no usable request content: empty, very short, only
 * digits/punctuation/emoji, a bare greeting, or the wa.me starter phrase.
 */
export function isPureGreetingOrNoise(text: string): boolean {
  const s = text.trim();
  if (s.length <= 3) return true; // "", "?", "1", "123", ".."
  if (/^[\d\s\p{P}\p{S}]+$/u.test(s)) return true; // only numbers / punctuation / symbols / emoji
  if (isPureStarter(s)) return true; // the pre-filled wa.me starter (and close variants)
  if (GREETING.test(s) && s.replace(GREETING, "").replace(/[\s,.!?]/g, "").trim().length <= 3) {
    return true; // a greeting with nothing else attached
  }
  return false;
}
