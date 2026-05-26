import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * System-Manager command catalog.
 *
 * These are the operational questions the manager (the `ceo` agent) can answer on its own
 * when Jarvis forwards a directive. EVERY command here is STRICTLY READ-ONLY — it queries
 * live data and returns a report; it never mutates a row, never creates an order, never
 * changes a price. Anything that would require a write is NOT a command: the dispatcher
 * queues it as a human task instead (honest by design — we never fake an action).
 *
 * Each command names the agent that owns its domain so the dispatcher can attribute the
 * execution to the right room in the Digital Command Center.
 */

export interface CommandReport {
  ok: boolean;
  /** Short Hebrew action title, e.g. "מוצרים ללא מחיר". */
  title: string;
  /** One-line headline result. */
  headline: string;
  /** Optional supporting bullet lines. */
  details: string[];
  /** Primary numeric metric, when the command counts something. */
  count?: number;
}

export interface ManagerCommand {
  id: string;
  /** Agent that owns this domain (command-center attribution). */
  agentId: string;
  agentName: string;
  /** Deterministic Hebrew matcher. */
  keywords: RegExp;
  /** Plain-language description (used by the optional LLM selector + docs). */
  description: string;
  run(db: SupabaseClient): Promise<CommandReport>;
}

// Commercial item types that are expected to carry a sell price (mirrors catalog-pricing-agent).
const COMMERCIAL_TYPES = new Set(["product", "material", "service", "equipment"]);

// Order statuses considered "open" (not cancelled, not completed).
const OPEN_ORDER_EXCLUDED = new Set(["cancelled", "completed"]);

const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  intake: "הקלטה",
  graphics_pending: "ממתין לגרפיקה",
  graphics_active: "בגרפיקה",
  graphics_done: "גרפיקה הושלמה",
  production: "בייצור",
  ready_installation: "מוכן להתקנה",
  scheduled: "מתוזמן",
  in_progress: "בביצוע",
};

function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

// ── Command 1: catalog items missing a sell price ──────────────────────────────
const itemsMissingPrice: ManagerCommand = {
  id: "items_missing_price",
  agentId: "catalog-pricing-agent",
  agentName: "מנהל קטלוג",
  keywords:
    /(מוצר|מוצרים|פריט|פריטים|מוצרי?ם).*(ללא|בלי|בלא|חסר(?:ים|י)?|אין).*(מחיר|תמחור)|(?:ללא|בלי|חסר)\s+מחיר|מחיר.*(חסר|ללא)|לא\s+מתומחר/,
  description: "How many active commercial catalog items have no sell price set.",
  async run(db) {
    const { data, error } = await db
      .from("catalog_items")
      .select("id,name,type,default_price,is_active")
      .eq("is_active", true);
    if (error) return { ok: false, title: "מוצרים ללא מחיר", headline: `שגיאה בקריאת הקטלוג: ${error.message}`, details: [] };

    const missing = (data ?? []).filter(
      (i) => COMMERCIAL_TYPES.has(i.type as string) && (i.default_price == null),
    );
    const samples = missing.slice(0, 8).map((i) => `• ${i.name}`);
    const headline =
      missing.length === 0
        ? "כל הפריטים המסחריים הפעילים מתומחרים ✅"
        : `נמצאו ${missing.length} פריטים מסחריים פעילים ללא מחיר מכירה.`;
    return {
      ok: true,
      title: "מוצרים ללא מחיר",
      headline,
      count: missing.length,
      details: missing.length > 8 ? [...samples, `…ועוד ${missing.length - 8}`] : samples,
    };
  },
};

// ── Command 2: open orders overview (by status) ────────────────────────────────
const openOrdersOverview: ManagerCommand = {
  id: "open_orders_overview",
  agentId: "orders-agent",
  agentName: "מנהל הזמנות",
  keywords:
    /(כמה|מה\s+מצב|סטטוס|תמונת\s+מצב).*(הזמנ(ות|ה))|הזמנות\s+פתוחות|מצב\s+ההזמנות|כמה\s+הזמנות/,
  description: "Count of open work orders grouped by their current status.",
  async run(db) {
    const { data, error } = await db.from("work_orders").select("status");
    if (error) return { ok: false, title: "הזמנות פתוחות", headline: `שגיאה בקריאת ההזמנות: ${error.message}`, details: [] };

    const open = (data ?? []).filter((o) => !OPEN_ORDER_EXCLUDED.has(o.status as string));
    const byStatus = new Map<string, number>();
    for (const o of open) byStatus.set(o.status as string, (byStatus.get(o.status as string) ?? 0) + 1);
    const details = [...byStatus.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `• ${statusLabel(s)}: ${n}`);
    return {
      ok: true,
      title: "הזמנות פתוחות",
      headline: open.length === 0 ? "אין כרגע הזמנות פתוחות." : `${open.length} הזמנות פתוחות בתהליך.`,
      count: open.length,
      details,
    };
  },
};

// ── Command 3: stuck orders / live operational risks (reads the ceo scanner's output) ──
const stuckOrders: ManagerCommand = {
  id: "stuck_orders",
  agentId: "ceo",
  agentName: "מנהל פעילות",
  keywords:
    /(הזמנ(ות|ה)).*(תקוע|מתעכב|חריג|באיחור|איחור)|תקוע(ות|ה)?|חריגות\s+תפעוליות|מה\s+דחוף|בעיות\s+תפעוליות|מה\s+תקוע/,
  description: "Orders the activity manager flagged as stuck / SLA-breaching / urgent.",
  async run(db) {
    const { data, error } = await db
      .from("agent_exceptions")
      .select("category,severity,title,status")
      .eq("agent_id", "ceo")
      .in("status", ["open", "acknowledged"]);
    if (error) return { ok: false, title: "הזמנות תקועות", headline: `שגיאה בקריאת החריגות: ${error.message}`, details: [] };

    const relevant = (data ?? []).filter((e) =>
      /^sla_|urgent_stuck|fabrication_issue/.test(e.category as string),
    );
    const critical = relevant.filter((e) => e.severity === "critical").length;
    const samples = relevant.slice(0, 6).map((e) => `• ${e.severity === "critical" ? "🔴 " : ""}${e.title}`);
    return {
      ok: true,
      title: "הזמנות תקועות / סיכונים תפעוליים",
      headline:
        relevant.length === 0
          ? "אין כרגע הזמנות תקועות או חריגות SLA פתוחות ✅"
          : `${relevant.length} חריגות תפעוליות פתוחות${critical ? ` (מתוכן ${critical} קריטיות 🔴)` : ""}.`,
      count: relevant.length,
      details: relevant.length > 6 ? [...samples, `…ועוד ${relevant.length - 6}`] : samples,
    };
  },
};

// ── Command 4: pending order drafts (intake queue) ──────────────────────────────
const pendingDrafts: ManagerCommand = {
  id: "pending_drafts",
  agentId: "orders-agent",
  agentName: "מנהל הזמנות",
  keywords: /טיוט(ות|ה)|בקשות\s+הזמנה|ממתינ(ות|ים)\s+לאישור|תור\s+(ה)?הזמנות|הזמנות\s+מהבוט/,
  description: "How many inbound order drafts are awaiting human review.",
  async run(db) {
    const { data, error } = await db
      .from("team_bot_order_drafts")
      .select("customer,source,created_at")
      .eq("status", "pending_review")
      .order("created_at", { ascending: false });
    if (error) return { ok: false, title: "טיוטות ממתינות", headline: `שגיאה בקריאת הטיוטות: ${error.message}`, details: [] };

    const rows = data ?? [];
    const srcLabel = (s: string) =>
      s === "whatsapp" ? "וואטסאפ" : s === "telegram_bot" ? "טלגרם" : s === "external_web_form" ? "טופס" : s || "";
    const samples = rows.slice(0, 6).map((d) => `• ${d.customer || "ללא לקוח"}${d.source ? ` (${srcLabel(d.source as string)})` : ""}`);
    return {
      ok: true,
      title: "טיוטות הזמנה ממתינות",
      headline: rows.length === 0 ? "אין טיוטות הזמנה ממתינות." : `${rows.length} טיוטות הזמנה ממתינות לאישור.`,
      count: rows.length,
      details: rows.length > 6 ? [...samples, `…ועוד ${rows.length - 6}`] : samples,
    };
  },
};

// ── Command 5: cross-org exceptions overview (manager situational awareness) ────
const exceptionsOverview: ManagerCommand = {
  id: "exceptions_overview",
  agentId: "ceo",
  agentName: "מנהל פעילות",
  keywords:
    /(כמה|כל\s+ה|מה\s+ה).*(חריג(ות|ה)|שגיא(ות|ה)|התרא(ות|ה))|מצב\s+כללי|סקירה\s+כללית|תמונת\s+מצב\s+(כללית|מלאה)|מה\s+דורש\s+טיפול/,
  description: "Open exceptions across all agents, grouped by severity, with the busiest domains.",
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
    const sevOrder = ["critical", "error", "warn", "info"];
    const sevLabel: Record<string, string> = { critical: "קריטי 🔴", error: "שגיאה", warn: "אזהרה", info: "מידע" };
    const sevLines = sevOrder.filter((s) => bySeverity.has(s)).map((s) => `• ${sevLabel[s]}: ${bySeverity.get(s)}`);
    const topAgents = [...byAgent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => `• ${nameById.get(id) ?? id}: ${n}`);
    return {
      ok: true,
      title: "סקירת חריגות כלל-ארגונית",
      headline: exc.length === 0 ? "אין חריגות פתוחות בכל המחלקות ✅" : `${exc.length} חריגות פתוחות בכלל המחלקות.`,
      count: exc.length,
      details: exc.length === 0 ? [] : [...sevLines, ...(topAgents.length ? ["מחלקות מובילות:", ...topAgents] : [])],
    };
  },
};

export const MANAGER_COMMANDS: ManagerCommand[] = [
  itemsMissingPrice,
  openOrdersOverview,
  stuckOrders,
  pendingDrafts,
  exceptionsOverview,
];

/** Deterministic command match — first command whose keywords fire wins. */
export function matchCommand(text: string): ManagerCommand | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  for (const cmd of MANAGER_COMMANDS) {
    if (cmd.keywords.test(t)) return cmd;
  }
  return null;
}

export function commandById(id: string): ManagerCommand | null {
  return MANAGER_COMMANDS.find((c) => c.id === id) ?? null;
}
