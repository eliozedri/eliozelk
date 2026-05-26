/**
 * Order Intake state model — a channel-agnostic editable cart.
 *
 * Pure functions only (no I/O): the skill loads items from the draft, applies an edit,
 * and persists the result. Item matching for remove/setQty is keyword-based so a
 * customer can say "תמחק את סימון החניה" without naming the item exactly.
 */

export interface OrderItem {
  name: string;
  quantity: number;
}

/** Significant Hebrew/Latin words (≥2 chars) used for fuzzy item matching. */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^֐-׿\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

// Loose Hebrew stem match: equal, or a shared 4-char prefix (handles plural/construct
// forms like "תמרורים" ↔ "תמרורי", "קונוסים" ↔ "קונוס").
function stemEq(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < 3) return false;
  const k = Math.min(n, 4);
  return a.slice(0, k) === b.slice(0, k);
}

/** Index of the existing item that best matches a free-text phrase, or -1. */
export function matchItemIndex(items: OrderItem[], phrase: string): number {
  const target = words(phrase);
  if (target.length === 0) return -1;
  let best = -1;
  let bestScore = 0;
  items.forEach((it, i) => {
    const itw = words(it.name);
    const score = target.reduce((n, tw) => n + (itw.some((iw) => stemEq(tw, iw)) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore > 0 ? best : -1;
}

export function addItems(items: OrderItem[], toAdd: OrderItem[]): OrderItem[] {
  const next = items.slice();
  for (const a of toAdd) {
    const i = matchItemIndex(next, a.name);
    if (i >= 0) next[i] = { ...next[i], quantity: next[i].quantity + a.quantity };
    else next.push({ name: a.name.trim(), quantity: a.quantity });
  }
  return next;
}

export function removeItem(items: OrderItem[], phrase: string): { items: OrderItem[]; removed: OrderItem | null } {
  const i = matchItemIndex(items, phrase);
  if (i < 0) return { items, removed: null };
  const removed = items[i];
  return { items: items.filter((_, idx) => idx !== i), removed };
}

export function setQuantity(items: OrderItem[], phrase: string, qty: number): { items: OrderItem[]; changed: OrderItem | null } {
  const i = matchItemIndex(items, phrase);
  if (i < 0) return { items, changed: null };
  const next = items.slice();
  next[i] = { ...next[i], quantity: qty };
  return { items: next, changed: next[i] };
}

/** Numbered Hebrew summary of the current cart. */
export function summarize(items: OrderItem[]): string {
  if (items.length === 0) return "(אין כרגע פריטים בבקשה)";
  return items
    .map((it, i) => `${i + 1}. ${it.quantity > 1 ? `${it.quantity} ` : ""}${it.name}`)
    .join("\n");
}
