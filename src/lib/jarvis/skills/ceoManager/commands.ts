import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractItemName } from "./match";

/**
 * Read-only CAPABILITY commands — the execution tools the brain's decisions resolve to. EVERY
 * command here is STRICTLY READ-ONLY: it queries live data and returns a report; it never mutates
 * a row, creates an order, or changes a price/stock. Commands are tools, not the brain — the
 * reasoning layer (brain.ts) decides WHICH capability is needed; this module only executes it.
 *
 * A command may need parameters (e.g. an item name for a stock lookup) — passed via `CommandCtx`.
 */

export interface CommandReport {
  ok: boolean;
  title: string;
  headline: string;
  details: string[];
  count?: number;
  /** True when the command could not answer definitively and the user should be asked to refine. */
  needsClarification?: boolean;
}

export interface CommandCtx {
  /** Item name extracted by the brain (LLM parameter) — falls back to extraction from `raw`. */
  itemName?: string;
  /** Raw message text (for deterministic parameter extraction). */
  raw?: string;
}

export interface ManagerCommand {
  id: string;
  /** Agent that owns this domain (command-center attribution). */
  agentId: string;
  agentName: string;
  description: string;
  run(db: SupabaseClient, ctx?: CommandCtx): Promise<CommandReport>;
}

const COMMERCIAL_TYPES = new Set(["product", "material", "service", "equipment"]);
const OPEN_ORDER_EXCLUDED = new Set(["cancelled", "completed"]);

const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה", intake: "הקלטה", graphics_pending: "ממתין לגרפיקה", graphics_active: "בגרפיקה",
  graphics_done: "גרפיקה הושלמה", production: "בייצור", ready_installation: "מוכן להתקנה",
  scheduled: "מתוזמן", in_progress: "בביצוע",
};
const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;
const fmt = (n: number | null | undefined) => {
  const v = typeof n === "number" ? n : 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

// ── Item-name matching for stock lookups (stem-tolerant, small catalog) ─────────
interface StockItem {
  name: string;
  current_quantity: number;
  reserved_quantity: number;
  minimum_quantity: number;
  unit_of_measure: string | null;
}
const norm = (s: string) => (s ?? "").trim().toLowerCase().replace(/[״"'.,]/g, "");
const stem = (s: string) => norm(s).replace(/(ים|ות|יות|י|ה)$/u, "");
function matchItemsByName<T extends { name: string }>(items: T[], query: string): T[] {
  const nq = norm(query);
  if (!nq) return [];
  const contains = items.filter((i) => norm(i.name).includes(nq) || nq.includes(norm(i.name)));
  if (contains.length) return contains;
  const sq = stem(query);
  return items.filter((i) => {
    const ni = norm(i.name);
    return ni.includes(sq) || stem(i.name) === sq || ni.split(/\s+/).some((tok) => stem(tok) === sq);
  });
}
const stockLine = (i: StockItem) =>
  `• ${i.name}: ${fmt(i.current_quantity)} ${i.unit_of_measure || "יח׳"} (זמין ${fmt((i.current_quantity ?? 0) - (i.reserved_quantity ?? 0))})`;

// ── Capability commands ─────────────────────────────────────────────────────────

const COMMANDS: ManagerCommand[] = [
  // ── Inventory: stock lookup for a specific item ──
  {
    id: "inventory_stock_lookup",
    agentId: "inventory-agent",
    agentName: "מנהל מחסן",
    description: "Current stock quantity of a specific item (needs item_name).",
    async run(db, ctx) {
      const name = (ctx?.itemName || extractItemName(ctx?.raw ?? "") || "").trim();
      if (!name) {
        return { ok: true, title: "בדיקת מלאי", headline: "לא הצלחתי לזהות איזה פריט לבדוק.", details: ['נסה למשל: "כמה קונוסים נשארו?"'], needsClarification: true };
      }
      const { data, error } = await db
        .from("catalog_items")
        .select("name,current_quantity,reserved_quantity,minimum_quantity,unit_of_measure")
        .eq("is_active", true);
      if (error) return { ok: false, title: "בדיקת מלאי", headline: `שגיאה בקריאת המלאי: ${error.message}`, details: [] };

      const items = (data ?? []) as StockItem[];
      const matches = matchItemsByName(items, name);
      if (matches.length === 0) {
        return { ok: true, title: "בדיקת מלאי", headline: `לא נמצא פריט בשם "${name}" בקטלוג.`, details: ["בדוק את שם הפריט או נסה ניסוח אחר."], needsClarification: true };
      }
      if (matches.length > 1) {
        return {
          ok: true, title: "בדיקת מלאי",
          headline: `נמצאו ${matches.length} פריטים שמתאימים ל-"${name}" — על איזה מהם לבדוק?`,
          details: matches.slice(0, 6).map(stockLine),
          needsClarification: true,
        };
      }
      const it = matches[0];
      const avail = (it.current_quantity ?? 0) - (it.reserved_quantity ?? 0);
      return {
        ok: true, title: "בדיקת מלאי", count: it.current_quantity,
        headline: `${it.name}: ${fmt(it.current_quantity)} ${it.unit_of_measure || "יח׳"} במלאי.`,
        details: [`זמין: ${fmt(avail)} · שמור להזמנות: ${fmt(it.reserved_quantity)} · מינימום: ${fmt(it.minimum_quantity)}`],
      };
    },
  },

  // ── Inventory: low stock (at/below minimum) ──
  {
    id: "inventory_low_stock",
    agentId: "inventory-agent",
    agentName: "מנהל מחסן",
    description: "Active items at or below their minimum quantity.",
    async run(db) {
      const { data, error } = await db
        .from("catalog_items")
        .select("name,current_quantity,reserved_quantity,minimum_quantity,unit_of_measure")
        .eq("is_active", true);
      if (error) return { ok: false, title: "מלאי נמוך", headline: `שגיאה בקריאת המלאי: ${error.message}`, details: [] };
      const low = ((data ?? []) as StockItem[]).filter((i) => (i.minimum_quantity ?? 0) > 0 && (i.current_quantity ?? 0) <= (i.minimum_quantity ?? 0));
      return {
        ok: true, title: "מלאי נמוך", count: low.length,
        headline: low.length === 0 ? "אין פריטים מתחת לרמת המינימום ✅" : `${low.length} פריטים ברמת מלאי נמוכה (מתחת/שווה למינימום).`,
        details: low.slice(0, 8).map((i) => `• ${i.name}: ${fmt(i.current_quantity)}/${fmt(i.minimum_quantity)} ${i.unit_of_measure || "יח׳"}`),
      };
    },
  },

  // ── Inventory: missing or zero stock ──
  {
    id: "inventory_missing_or_zero",
    agentId: "inventory-agent",
    agentName: "מנהל מחסן",
    description: "Active commercial items with zero (or negative) stock on hand.",
    async run(db) {
      const { data, error } = await db
        .from("catalog_items")
        .select("name,type,current_quantity,unit_of_measure")
        .eq("is_active", true);
      if (error) return { ok: false, title: "מלאי אפס", headline: `שגיאה בקריאת המלאי: ${error.message}`, details: [] };
      const zero = ((data ?? []) as Array<{ name: string; type: string; current_quantity: number; unit_of_measure: string | null }>)
        .filter((i) => COMMERCIAL_TYPES.has(i.type) && (i.current_quantity ?? 0) <= 0);
      return {
        ok: true, title: "מלאי אפס/נגמר", count: zero.length,
        headline: zero.length === 0 ? "אין פריטים מסחריים במלאי אפס ✅" : `${zero.length} פריטים מסחריים במלאי אפס.`,
        details: zero.slice(0, 8).map((i) => `• ${i.name}`),
      };
    },
  },

  // ── Catalog: missing price ──
  {
    id: "items_missing_price",
    agentId: "catalog-pricing-agent",
    agentName: "מנהל קטלוג",
    description: "Active commercial catalog items with no sell price.",
    async run(db) {
      const { data, error } = await db.from("catalog_items").select("name,type,default_price").eq("is_active", true);
      if (error) return { ok: false, title: "מוצרים ללא מחיר", headline: `שגיאה בקריאת הקטלוג: ${error.message}`, details: [] };
      const missing = ((data ?? []) as Array<{ name: string; type: string; default_price: number | null }>)
        .filter((i) => COMMERCIAL_TYPES.has(i.type) && i.default_price == null);
      const samples = missing.slice(0, 8).map((i) => `• ${i.name}`);
      return {
        ok: true, title: "מוצרים ללא מחיר", count: missing.length,
        headline: missing.length === 0 ? "כל הפריטים המסחריים הפעילים מתומחרים ✅" : `נמצאו ${missing.length} פריטים מסחריים פעילים ללא מחיר מכירה.`,
        details: missing.length > 8 ? [...samples, `…ועוד ${missing.length - 8}`] : samples,
      };
    },
  },

  // ── Catalog: missing supplier ──
  {
    id: "catalog_missing_supplier",
    agentId: "catalog-pricing-agent",
    agentName: "מנהל קטלוג",
    description: "Active commercial items with no supplier assigned.",
    async run(db) {
      const { data, error } = await db.from("catalog_items").select("name,type,supplier_id").eq("is_active", true);
      if (error) return { ok: false, title: "מוצרים ללא ספק", headline: `שגיאה בקריאת הקטלוג: ${error.message}`, details: [] };
      const missing = ((data ?? []) as Array<{ name: string; type: string; supplier_id: string | null }>)
        .filter((i) => COMMERCIAL_TYPES.has(i.type) && !i.supplier_id);
      return {
        ok: true, title: "מוצרים ללא ספק", count: missing.length,
        headline: missing.length === 0 ? "לכל הפריטים המסחריים הפעילים יש ספק ✅" : `נמצאו ${missing.length} פריטים מסחריים ללא ספק.`,
        details: missing.slice(0, 8).map((i) => `• ${i.name}`),
      };
    },
  },

  // ── Purchase recommendation (read-only suggestion) ──
  {
    id: "purchase_recommendation",
    agentId: "inventory-agent",
    agentName: "מנהל מחסן",
    description: "Read-only restock suggestion for items at/below minimum.",
    async run(db) {
      const { data, error } = await db
        .from("catalog_items")
        .select("name,current_quantity,reserved_quantity,minimum_quantity,unit_of_measure")
        .eq("is_active", true);
      if (error) return { ok: false, title: "המלצת רכש", headline: `שגיאה בקריאת המלאי: ${error.message}`, details: [] };
      const low = ((data ?? []) as StockItem[])
        .filter((i) => (i.minimum_quantity ?? 0) > 0 && (i.current_quantity ?? 0) - (i.reserved_quantity ?? 0) <= (i.minimum_quantity ?? 0))
        .map((i) => ({ ...i, suggest: Math.max(Math.ceil((i.minimum_quantity ?? 0) * 1.5 - ((i.current_quantity ?? 0) - (i.reserved_quantity ?? 0))), 1) }));
      return {
        ok: true, title: "המלצת רכש (קריאה בלבד)", count: low.length,
        headline: low.length === 0 ? "אין צורך ברכש כרגע — כל הפריטים מעל המינימום ✅" : `המלצה ראשונית: ${low.length} פריטים לחידוש (קריאה בלבד, לא בוצעה הזמנה).`,
        details: low.slice(0, 8).map((i) => `• ${i.name}: להזמין ~${fmt(i.suggest)} ${i.unit_of_measure || "יח׳"}`),
      };
    },
  },

  // ── Orders overview ──
  {
    id: "open_orders_overview",
    agentId: "orders-agent",
    agentName: "מנהל הזמנות",
    description: "Open work orders grouped by status.",
    async run(db) {
      const { data, error } = await db.from("work_orders").select("status");
      if (error) return { ok: false, title: "הזמנות פתוחות", headline: `שגיאה בקריאת ההזמנות: ${error.message}`, details: [] };
      const open = (data ?? []).filter((o) => !OPEN_ORDER_EXCLUDED.has(o.status as string));
      const byStatus = new Map<string, number>();
      for (const o of open) byStatus.set(o.status as string, (byStatus.get(o.status as string) ?? 0) + 1);
      return {
        ok: true, title: "הזמנות פתוחות", count: open.length,
        headline: open.length === 0 ? "אין כרגע הזמנות פתוחות." : `${open.length} הזמנות פתוחות בתהליך.`,
        details: [...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `• ${statusLabel(s)}: ${n}`),
      };
    },
  },

  // ── Stuck orders / operational risks (reads the ceo scanner's exceptions) ──
  {
    id: "stuck_orders",
    agentId: "ceo",
    agentName: "מנהל פעילות",
    description: "Orders flagged stuck / SLA-breaching / urgent.",
    async run(db) {
      const { data, error } = await db
        .from("agent_exceptions").select("category,severity,title,status").eq("agent_id", "ceo").in("status", ["open", "acknowledged"]);
      if (error) return { ok: false, title: "הזמנות תקועות", headline: `שגיאה בקריאת החריגות: ${error.message}`, details: [] };
      const relevant = (data ?? []).filter((e) => /^sla_|urgent_stuck|fabrication_issue/.test(e.category as string));
      const critical = relevant.filter((e) => e.severity === "critical").length;
      return {
        ok: true, title: "הזמנות תקועות / סיכונים תפעוליים", count: relevant.length,
        headline: relevant.length === 0 ? "אין כרגע הזמנות תקועות או חריגות SLA פתוחות ✅" : `${relevant.length} חריגות תפעוליות פתוחות${critical ? ` (מתוכן ${critical} קריטיות 🔴)` : ""}.`,
        details: relevant.slice(0, 6).map((e) => `• ${e.severity === "critical" ? "🔴 " : ""}${e.title}`),
      };
    },
  },

  // ── Pending order drafts ──
  {
    id: "pending_drafts",
    agentId: "orders-agent",
    agentName: "מנהל הזמנות",
    description: "Inbound order drafts awaiting human review.",
    async run(db) {
      const { data, error } = await db
        .from("team_bot_order_drafts").select("customer,source").eq("status", "pending_review").order("created_at", { ascending: false });
      if (error) return { ok: false, title: "טיוטות ממתינות", headline: `שגיאה בקריאת הטיוטות: ${error.message}`, details: [] };
      const rows = data ?? [];
      const srcLabel = (s: string) => (s === "whatsapp" ? "וואטסאפ" : s === "telegram_bot" ? "טלגרם" : s === "external_web_form" ? "טופס" : s || "");
      return {
        ok: true, title: "טיוטות הזמנה ממתינות", count: rows.length,
        headline: rows.length === 0 ? "אין טיוטות הזמנה ממתינות." : `${rows.length} טיוטות הזמנה ממתינות לאישור.`,
        details: rows.slice(0, 6).map((d) => `• ${d.customer || "ללא לקוח"}${d.source ? ` (${srcLabel(d.source as string)})` : ""}`),
      };
    },
  },

  // ── Cross-org exceptions overview / system status ──
  {
    id: "exceptions_overview",
    agentId: "ceo",
    agentName: "מנהל פעילות",
    description: "Open exceptions across all agents, grouped by severity.",
    async run(db) {
      const [excRes, agentsRes] = await Promise.all([
        db.from("agent_exceptions").select("agent_id,severity,status").in("status", ["open", "acknowledged"]),
        db.from("agents").select("id,name"),
      ]);
      if (excRes.error) return { ok: false, title: "סקירת חריגות", headline: `שגיאה בקריאת החריגות: ${excRes.error.message}`, details: [] };
      const exc = excRes.data ?? [];
      const nameById = new Map((agentsRes.data ?? []).map((a) => [a.id as string, a.name as string]));
      const bySeverity = new Map<string, number>();
      const byAgent = new Map<string, number>();
      for (const e of exc) {
        bySeverity.set(e.severity as string, (bySeverity.get(e.severity as string) ?? 0) + 1);
        byAgent.set(e.agent_id as string, (byAgent.get(e.agent_id as string) ?? 0) + 1);
      }
      const sevLabel: Record<string, string> = { critical: "קריטי 🔴", error: "שגיאה", warn: "אזהרה", info: "מידע" };
      const sevLines = ["critical", "error", "warn", "info"].filter((s) => bySeverity.has(s)).map((s) => `• ${sevLabel[s]}: ${bySeverity.get(s)}`);
      const topAgents = [...byAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `• ${nameById.get(id) ?? id}: ${n}`);
      return {
        ok: true, title: "סקירת מצב כלל-ארגונית", count: exc.length,
        headline: exc.length === 0 ? "אין חריגות פתוחות בכל המחלקות ✅" : `${exc.length} חריגות פתוחות בכלל המחלקות.`,
        details: exc.length === 0 ? [] : [...sevLines, ...(topAgents.length ? ["מחלקות מובילות:", ...topAgents] : [])],
      };
    },
  },

  // ── Fleet: unusable / dispatch-blocked equipment ──
  {
    id: "fleet_unusable_equipment",
    agentId: "equipment-fleet-agent",
    agentName: "מנהל ציוד ורכבים",
    description: "Active equipment that is not usable (in repair / unserviceable) or blocked by an expired test/insurance/license.",
    async run(db) {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await db
        .from("equipment")
        .select("display_name,status,next_inspection_date,next_insurance_date,license_expiry_date,is_active")
        .eq("is_active", true);
      if (error) return { ok: false, title: "כלים לא שמישים", headline: `שגיאה בקריאת הציוד: ${error.message}`, details: [] };

      type Eq = { display_name: string; status: string; next_inspection_date: string | null; next_insurance_date: string | null; license_expiry_date: string | null };
      const items = (data ?? []) as Eq[];
      const flagged = new Map<string, string[]>();
      const flag = (name: string, reason: string) => {
        const k = name || "(ללא שם)";
        flagged.set(k, [...(flagged.get(k) ?? []), reason]);
      };
      for (const e of items) {
        if (e.status === "in_repair") flag(e.display_name, "בטיפול");
        if (e.status === "unserviceable") flag(e.display_name, "לא תקין");
        if (e.status === "active") {
          if (e.next_inspection_date && e.next_inspection_date < today) flag(e.display_name, "טסט פג");
          if (e.next_insurance_date && e.next_insurance_date < today) flag(e.display_name, "ביטוח פג");
          if (e.license_expiry_date && e.license_expiry_date < today) flag(e.display_name, "רישיון פג");
        }
      }
      const lines = [...flagged.entries()].slice(0, 8).map(([name, reasons]) => `• ${name}: ${reasons.join(", ")}`);
      return {
        ok: true, title: "כלים לא שמישים / חסומים לשיגור", count: flagged.size,
        headline: flagged.size === 0 ? "כל הציוד הפעיל שמיש ובתוקף ✅" : `${flagged.size} פריטי ציוד אינם שמישים או חסומים לשיגור.`,
        details: lines,
      };
    },
  },
];

export const MANAGER_COMMANDS = COMMANDS;
const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));
export function commandById(id: string | null | undefined): ManagerCommand | null {
  return id ? BY_ID.get(id) ?? null : null;
}
