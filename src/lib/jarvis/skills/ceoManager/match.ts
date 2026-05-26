import type { LlmIntent } from "../../llm/types";

/**
 * PURE routing helpers — the RESOLUTION + DETERMINISTIC-FALLBACK layer (no `server-only`, no DB),
 * unit-tested in scripts/jarvis-llm-selfcheck.ts. This is NOT the brain: the brain (brain.ts)
 * reasons about intent first; these helpers only (a) resolve a rich intent → an exact read-only
 * command id, and (b) deterministically classify text into a domain intent when the LLM is off.
 * Patterns are distinct enough that stock / low-stock / missing-price / finance never collide.
 */

export interface CommandPattern {
  id: string;
  re: RegExp;
}

// FIRST match wins. Specific inventory/catalog/fleet patterns precede generic ones.
export const COMMAND_PATTERNS: CommandPattern[] = [
  { id: "inventory_missing_or_zero", re: /נגמר|אזל|אפס\s*מלאי|חסר\s+במלאי|ללא\s+מלאי|out\s*of\s*stock/i },
  { id: "inventory_low_stock", re: /נמוך|עומד\s+להיגמר|להיגמר|לקראת\s+סיום|מתחת\s+למינימום|low\s*stock/i },
  { id: "fleet_unusable_equipment", re: /כלי(ם)?\s+(לא\s+שמיש|תקול)|לא\s+שמיש(ים|ה)?|ציוד\s+(תקול|לא\s+תקין|בטיפול)|רכב(ים)?\s+(תקול|בטיפול|מושבת)|טסט\s+פג|ביטוח\s+פג|unserviceable|מושבת/i },
  { id: "catalog_missing_supplier", re: /(ללא|בלי|חסר|אין)\s+ספק/i },
  { id: "items_missing_price", re: /(מוצר|מוצרים|פריט|פריטים).*(ללא|בלי|בלא|חסר|אין).*(מחיר|תמחור)|(?:ללא|בלי|חסר)\s+מחיר|מחיר.*(חסר|ללא)|לא\s+מתומחר/i },
  { id: "purchase_recommendation", re: /מה\s+כדאי\s+להזמין|המלצ.*רכש|מה\s+(צריך\s+)?להזמין|רשימת\s+קניות|מה\s+לרכוש/i },
  { id: "inventory_stock_lookup", re: /(כמה|מלאי\s+של|יש|נשאר|נותר|כמות).*(נשאר|נותר|מלאי|במלאי|כמות)|מלאי\s+של|כמה\s+נשאר/i },
  { id: "pending_drafts", re: /טיוט(ות|ה)|בקשות\s+הזמנה|ממתינ(ות|ים)\s+לאישור|תור\s+(ה)?הזמנות|הזמנות\s+מהבוט/i },
  { id: "stuck_orders", re: /(הזמנ(ות|ה)).*(תקוע|מתעכב|חריג|באיחור|איחור)|תקוע(ות|ה)|חריגות\s+תפעוליות|איזה\s+הזמנות\s+תקועות/i },
  { id: "open_orders_overview", re: /(כמה|מה\s+מצב|סטטוס|תמונת\s+מצב).*(הזמנ(ות|ה))|הזמנות\s+פתוחות|מצב\s+ההזמנות|כמה\s+הזמנות/i },
  { id: "exceptions_overview", re: /(כמה|כל\s+ה|מה\s+ה).*(חריג(ות|ה)|שגיא(ות|ה)|התרא(ות|ה))|מצב\s+כללי|סקירה\s+כללית|מצב\s+המערכת|מה\s+דורש\s+טיפול/i },
];

// Finance has NO executable command (no verified AR source) — detected so the brain can file an
// honest pending Finance request rather than guessing or running a wrong command.
const FINANCE_RE = /חשבון.{0,12}(פתוח|לקוח)|(פתוח|חוב|יתר|חייב).{0,14}לקוח|כמה\s+כסף|סך\s+(כל\s+)?ה?חשבון|גביי?ה|חובות|מאזן\s+לקוח|accounts?\s+receivable|open\s+balance/i;

/** Maps a rich LLM intent to an exact read-only command id (or null when handled otherwise). */
const INTENT_TO_COMMAND: Record<string, string> = {
  inventory_stock_lookup: "inventory_stock_lookup",
  inventory_low_stock: "inventory_low_stock",
  inventory_missing_or_zero: "inventory_missing_or_zero",
  catalog_missing_price: "items_missing_price",
  catalog_missing_supplier: "catalog_missing_supplier",
  purchase_recommendation_readonly: "purchase_recommendation",
  orders_status: "open_orders_overview",
  stuck_orders: "stuck_orders",
  pending_order_drafts: "pending_drafts",
  fleet_equipment_status: "fleet_unusable_equipment",
  system_status: "exceptions_overview",
  // finance_open_balance, ceo_manager_request, operations_risk_report → no single command
};

/** Reverse: command id → the rich intent it represents (for deterministic decisions + logging). */
const COMMAND_TO_INTENT: Record<string, LlmIntent> = {
  inventory_stock_lookup: "inventory_stock_lookup",
  inventory_low_stock: "inventory_low_stock",
  inventory_missing_or_zero: "inventory_missing_or_zero",
  items_missing_price: "catalog_missing_price",
  catalog_missing_supplier: "catalog_missing_supplier",
  purchase_recommendation: "purchase_recommendation_readonly",
  open_orders_overview: "orders_status",
  stuck_orders: "stuck_orders",
  pending_drafts: "pending_order_drafts",
  fleet_unusable_equipment: "fleet_equipment_status",
  exceptions_overview: "system_status",
};

export function intentToCommandId(intent: string | null | undefined): string | null {
  return intent ? INTENT_TO_COMMAND[intent] ?? null : null;
}

export function commandIdToLlmIntent(id: string | null | undefined): LlmIntent | null {
  return id ? COMMAND_TO_INTENT[id] ?? null : null;
}

export function matchCommandId(text: string): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  for (const p of COMMAND_PATTERNS) if (p.re.test(t)) return p.id;
  return null;
}

/**
 * Deterministic domain classification (LLM off): returns the rich LlmIntent for a business
 * question, including command-less domains (finance). Returns null when no business domain fits
 * (caller then tries other skills or asks clarification — never a wrong command).
 */
export function deterministicDomainIntent(text: string): LlmIntent | null {
  const id = matchCommandId(text);
  if (id) return commandIdToLlmIntent(id);
  if (FINANCE_RE.test(text ?? "")) return "finance_open_balance";
  return null;
}

// ── Item-name extraction for stock lookups ──────────────────────────────────────

const STOP = new Set([
  "כמה", "מה", "יש", "של", "עוד", "לי", "את", "כרגע", "עכשיו", "כמות", "קיים", "קיימים",
  "נשאר", "נשארו", "נשארים", "נשארה", "נותר", "נותרו", "נותרים", "נותרה",
  "מלאי", "במלאי", "המלאי", "במחסן", "מחסן", "ה", "עדיין", "בערך", "תבדוק", "תבדקי", "בדוק",
]);

/** Best-effort Hebrew item-name extraction from a stock question. */
export function extractItemName(text: string): string | null {
  const cleaned = (text ?? "").replace(/[?؟.,!״"']/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const kept = cleaned.split(" ").filter((tok) => tok && !STOP.has(tok));
  return kept.join(" ").trim() || null;
}
