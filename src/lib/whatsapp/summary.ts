/**
 * Build a SAFE numbered Hebrew summary of an external customer's request.
 *
 * Heuristic only — never invents details. Splits the message into items on newlines,
 * commas, and the Hebrew conjunction "ו" when it clearly joins list items, and strips
 * common lead-ins ("שלום", "אני צריך", "אני רוצה", "תודה"). If it can't find a clear
 * multi-item structure, it returns the trimmed message as a single line. The caller
 * frames everything as "כפי שהתקבלה אצלנו" so nothing is presented as confirmed.
 */

const LEAD_INS = [
  /^שלום[!,. ]*/,
  /^היי[!,. ]*/,
  /^אני\s+צריך\s+/,
  /^אני\s+רוצה\s+/,
  /^רציתי\s+/,
  /^אפשר\s+/,
  /^צריך\s+/,
];

function stripLeadIns(s: string): string {
  let out = s.trim();
  for (const re of LEAD_INS) out = out.replace(re, "").trim();
  return out;
}

// Matches a "start an order request" intent (the pre-filled link message and variants).
const STARTER_HINT = /(לפתוח|פתיחת|רוצה|מעוניין|לבצע)\s*.*\s*הזמנה|בקשת\s+הזמנה/;

/**
 * True when the message is a BARE starter ("שלום ג׳ארוויס, אני רוצה לפתוח בקשת הזמנה")
 * with no actual order details. A message that also lists items (e.g. "...5 תמרורי עצור")
 * returns false → caller skips the wizard and creates the draft directly.
 */
export function isPureStarter(message: string): boolean {
  if (!STARTER_HINT.test(message)) return false;
  const rest = message
    .replace(/שלום|היי|ג׳ארוויס|גארוויס/g, "")
    .replace(/אני|רוצה|מעוניין|לפתוח|פתיחת|בקשת|בקשה|הזמנה|חדשה|בבקשה|נא|לבצע/g, "")
    .replace(/[\s,.\-!?״"']/g, "")
    .trim();
  return rest.length <= 2;
}

export function buildOrderItems(message: string): string[] {
  const cleaned = stripLeadIns(message.trim());
  if (!cleaned) return [];

  // Split on newlines and commas first.
  let parts = cleaned
    .split(/[\n،,]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // If still a single chunk, try splitting on a clear " ו" list conjunction.
  if (parts.length === 1) {
    parts = parts[0]
      .split(/\s+ו(?=[א-ת])/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  // Tidy each item: drop a leading conjunction "ו" and trailing punctuation.
  return parts
    .map((p) => p.replace(/^ו/, "").replace(/[.;]+$/, "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function buildCustomerSummary(message: string): string {
  const items = buildOrderItems(message);
  const opening = "שלום 👋 קיבלנו את פנייתך לאלקיים סימון כבישים.";
  const closing = "הפנייה נפתחה כטיוטה וממתינה לבדיקה. הצוות יחזור אליך בהקדם. תודה רבה.";

  if (items.length <= 1) {
    // Not structured enough — echo the single request safely, no invented breakdown.
    const single = items[0] ?? message.trim();
    return `${opening}\n\nסיכום הפנייה כפי שהתקבלה אצלנו:\n${single}\n\n${closing}`;
  }

  const numbered = items.map((it, i) => `${i + 1}. ${it}`).join("\n");
  return `${opening}\n\nסיכום הפנייה כפי שהתקבלה אצלנו:\n${numbered}\n\n${closing}`;
}
