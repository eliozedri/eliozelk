/**
 * CEO / Manager intent detection (deterministic; LLM-swappable later).
 * Owner-only — the orchestrator never routes external senders here.
 */

const CEO_REQUEST = /(תעביר|תבקש|שאל|תן|תשאל|תשלח|העבר|בקש)\s+.*\b(ceo|סי?\.?או|מנהל\s+המערכת|מנכ"?ל|המנהל)\b|\bל-?\s*ceo\b|למנהל\s+המערכת/i;
const CEO_STATUS = /(מה|תראה|הצג|איזה|מהן|מהם).*(משימ(ות|ה)|בקש(ות|ה)|סטטוס).*(ceo|מנהל)|משימות\s+ceo|בקשות\s+ceo|סטטוס.*ceo|מה\s+קורה\s+עם\s+הבקשה|מה\s+הסטטוס|מה\s+נסגר\s+עם/i;

export function isCeoRequest(text: string): boolean {
  return CEO_REQUEST.test(text);
}
export function isCeoStatusQuery(text: string): boolean {
  return CEO_STATUS.test(text);
}

/** Short normalized task title from the request text. */
export function ceoTitle(text: string): string {
  const cleaned = text
    .replace(/^(ג׳ארוויס|גארוויס)[,\s]*/i, "")
    .replace(/(תעביר|תבקש|שאל|תן|תשאל|תשלח|העבר|בקש)\s+(מ?ה?-?\s*ceo|ל-?\s*ceo|מ?ה?מנהל\s+המערכת|ל?מנהל\s+המערכת|ממנו|לו)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || text.trim()).slice(0, 80);
}

export function ceoPriority(text: string): "high" | "normal" {
  return /דחוף|בהקדם|מיידי|קריטי|עכשיו/.test(text) ? "high" : "normal";
}
