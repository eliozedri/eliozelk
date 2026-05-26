import type { OrderItem } from "./state";

/**
 * Deterministic Hebrew order-edit parser (Stage 1).
 *
 * Turns free text into a structured `OrderEdit`. This is the swappable "brain": a future
 * LLM semantic parser can implement the same `parseOrderEdit` / `extractItems` contract
 * and drop in behind the skill with no change to state, persistence, or adapters.
 */

export type OrderEdit =
  | { kind: "add"; items: OrderItem[] }
  | { kind: "remove"; phrase: string }
  | { kind: "setQty"; phrase: string; qty: number }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "representative" }
  | { kind: "unclear" };

const CONFIRM = /(^|\s)(מאשר|מאושר|אישרתי|אישור|מאושר לשליחה|שלח|תשלח|שלחי|זה בסדר|בסדר גמור|אוקיי|אוקי|סגור|מצוין|ok)(\s|$|[!.])/i;
const CANCEL = /(בטל|ביטול|תבטל|לא רוצה|עזוב את זה|לא צריך יותר)/;
const REP = /נציג|לדבר עם|דבר איתי|תתקשר|שיחה עם נציג|בן אדם|מוקד/;
const REMOVE = /(תמחק|תוריד|הסר|תסיר|למחוק|בטל את|תבטל את)\s+(.*)/;
const CORRECTION = /(בעצם|במקום|תשנה|תעדכן|שנה|לא\s+\d)/;

// Words stripped before extracting concrete items (intent verbs / fillers, not items).
const FILLERS = /(תוסיף|הוסיף|תוסיפי|להוסיף|בנוסף|שכחתי|עוד|גם|לי|בבקשה|נא|אני|רוצה|צריך|מבקש|תוסיף לי|בעצם)/g;

function splitParts(text: string): string[] {
  return text
    .split(/[\n،,]+|\s+ו(?=[א-ת])/)
    .map((p) => p.replace(/^ו/, "").replace(/[.;]+$/, "").trim())
    .filter(Boolean);
}

/** Extract {name, quantity} items from a request fragment. */
export function extractItems(text: string): OrderItem[] {
  const cleaned = text.replace(FILLERS, " ").replace(/\s+/g, " ").trim();
  return splitParts(cleaned || text)
    .map((p) => {
      const m = p.match(/(\d+)/);
      const qty = m ? parseInt(m[1], 10) : 1;
      const name = p.replace(/\d+/g, "").replace(/\s+/g, " ").trim();
      return { name: name || p.trim(), quantity: qty > 0 ? qty : 1 };
    })
    .filter((it) => it.name.length > 0);
}

/** Interpret a message during an ACTIVE order as an edit operation. */
export function parseOrderEdit(text: string): OrderEdit {
  const t = text.trim();

  if (CONFIRM.test(t)) return { kind: "confirm" };
  if (CANCEL.test(t)) return { kind: "cancel" };
  if (REP.test(t)) return { kind: "representative" };

  const rm = t.match(REMOVE);
  if (rm) return { kind: "remove", phrase: rm[2].replace(/^את\s+/, "").trim() };

  if (CORRECTION.test(t)) {
    // New quantity = the number adjacent to an item word (e.g. "7 תמרורים במקום 5").
    const m = t.match(/(\d+)\s*([א-ת][א-ת"׳\s]{1,})/);
    if (m) {
      const qty = parseInt(m[1], 10);
      const phrase = m[2].replace(/במקום.*/, "").trim();
      if (qty > 0 && phrase) return { kind: "setQty", phrase, qty };
    }
  }

  // Default during an active order: treat as added items.
  const items = extractItems(t);
  if (items.length > 0) return { kind: "add", items };
  return { kind: "unclear" };
}
