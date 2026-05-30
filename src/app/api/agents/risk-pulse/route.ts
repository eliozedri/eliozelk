import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";

// Cross-domain operational risk pulse for the Command Center. Aggregates REAL,
// read-only signals from existing tables only — no mutation, no business logic,
// no fake data. Each group is computed independently and guarded: if a source
// table is unavailable the group is returned with available:false rather than
// faking a number. Datasets here are small (tens of rows) so we fetch the
// relevant columns and compute in JS for clarity and correctness.

export const dynamic = "force-dynamic";

const PROD_ORIGIN = "https://eliozelk.vercel.app";
function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  if (origin === PROD_ORIGIN) return { "Access-Control-Allow-Origin": origin };
  if (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost:")) {
    return { "Access-Control-Allow-Origin": origin };
  }
  return {};
}

export type PulseSeverity = "critical" | "warning" | "info";
export interface PulseSignal {
  key: string;
  label: string;
  count: number;
  severity: PulseSeverity;
  href: string;
}
export interface PulseGroup {
  group: string;
  title: string;
  available: boolean;
  note?: string;
  signals: PulseSignal[];
}

const MS_DAY = 86_400_000;
function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / MS_DAY);
}
function olderThanHours(iso: string | null | undefined, hours: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true; // unknown age → treat as stuck
  return Date.now() - t > hours * 3_600_000;
}
const isBlank = (v: unknown): boolean => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export async function OPTIONS(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  return new NextResponse(null, {
    status: 204,
    headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "Content-Type" },
  });
}

export async function GET(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const db = getServiceSupabase();
  const groups: PulseGroup[] = [];

  // Helper: run a guarded group computation; on any error mark unavailable.
  async function group(
    groupKey: string,
    title: string,
    compute: () => Promise<PulseSignal[]>,
    note?: string,
  ): Promise<void> {
    try {
      const signals = await compute();
      groups.push({ group: groupKey, title, available: true, note, signals });
    } catch (e) {
      groups.push({ group: groupKey, title, available: false, note: (e as Error).message, signals: [] });
    }
  }

  // 1 — Documents (supplier_documents OCR pipeline)
  await group("documents", "מסמכים", async () => {
    const { data, error } = await db
      .from("supplier_documents")
      .select("status, extraction_confidence, created_at");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const stuck = rows.filter(r => ["extracting", "processing"].includes(r.status as string) && olderThanHours(r.created_at as string, 0.25)).length;
    const review = rows.filter(r => ["pending_review", "needs_review", "review", "uploaded"].includes(r.status as string)).length;
    const lowConf = rows.filter(r => typeof r.extraction_confidence === "number" && (r.extraction_confidence as number) < 0.6 && !["archived", "rejected"].includes(r.status as string)).length;
    return [
      { key: "stuck", label: "מסמכים תקועים בעיבוד", count: stuck, severity: "critical", href: "/supplier-documents" },
      { key: "review", label: "ממתינים לבדיקה", count: review, severity: "warning", href: "/supplier-documents" },
      { key: "low_conf", label: "ביטחון OCR נמוך", count: lowConf, severity: "warning", href: "/supplier-documents" },
    ];
  });

  // 2 — Fleet (equipment documents expiry)
  await group("fleet", "צי רכב ומכונות", async () => {
    const { data, error } = await db
      .from("equipment")
      .select("is_active, status, license_expiry_date, next_inspection_date, next_insurance_date");
    if (error) throw new Error(error.message);
    const rows = (data ?? []).filter(r => r.is_active !== false);
    const dateCols = (r: Record<string, unknown>) => [r.license_expiry_date, r.next_inspection_date, r.next_insurance_date] as (string | null)[];
    const expired = rows.filter(r => dateCols(r).some(d => { const n = daysUntil(d); return n !== null && n < 0; })).length;
    const soon = rows.filter(r => {
      const ds = dateCols(r).map(daysUntil).filter((n): n is number => n !== null);
      return !ds.some(n => n < 0) && ds.some(n => n >= 0 && n <= 30);
    }).length;
    const pending = rows.filter(r => r.status === "pending_approval").length;
    return [
      { key: "expired", label: "מסמכי צי שפגו", count: expired, severity: "critical", href: "/fleet" },
      { key: "soon", label: "מסמכים שיפוגו ב-30 יום", count: soon, severity: "warning", href: "/fleet" },
      { key: "pending", label: "ממתינים לאישור", count: pending, severity: "info", href: "/fleet" },
    ];
  });

  // 3 — Inventory (catalog_items stock). Only items that are actually stock-tracked
  // (a minimum or safety-stock threshold is set) are evaluated — otherwise the
  // many made-to-order catalog products with 0/null quantity would produce
  // misleading "zero stock" noise.
  await group(
    "inventory",
    "מלאי",
    async () => {
      const { data, error } = await db
        .from("catalog_items")
        .select("is_active, current_quantity, minimum_quantity, safety_stock");
      if (error) throw new Error(error.message);
      const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
      const tracked = (data ?? []).filter(r => {
        if (r.is_active === false) return false;
        const m = num(r.minimum_quantity), s = num(r.safety_stock);
        return (m !== null && m > 0) || (s !== null && s > 0);
      });
      const zero = tracked.filter(r => { const q = num(r.current_quantity); return q !== null && q <= 0; }).length;
      const low = tracked.filter(r => {
        const q = num(r.current_quantity), m = num(r.minimum_quantity);
        return q !== null && q > 0 && m !== null && m > 0 && q <= m;
      }).length;
      const missing = tracked.filter(r => r.current_quantity === null).length;
      return [
        { key: "zero", label: "מלאי אפס (פריטים במעקב)", count: zero, severity: "critical", href: "/warehouse" },
        { key: "low", label: "מלאי נמוך (מתחת למינימום)", count: low, severity: "warning", href: "/warehouse" },
        { key: "missing", label: "פריט במעקב ללא ערך מלאי", count: missing, severity: "info", href: "/warehouse" },
      ];
    },
    "נמדד רק לפריטים עם מינימום/מלאי בטחון מוגדר",
  );

  // 4 — Finance / billing blockers (supplier_documents missing core fields)
  await group("finance", "כספים וחיוב", async () => {
    const { data, error } = await db
      .from("supplier_documents")
      .select("status, supplier_name_raw, supplier_id, document_date, total_after_vat, document_number");
    if (error) throw new Error(error.message);
    const open = (data ?? []).filter(r => !["archived", "rejected"].includes(r.status as string));
    const missingFields = open.filter(r =>
      (isBlank(r.supplier_name_raw) && isBlank(r.supplier_id)) ||
      isBlank(r.document_date) ||
      r.total_after_vat === null ||
      isBlank(r.document_number),
    ).length;
    // Completed orders not yet billing-ready (no invoice_number on a completed WO).
    const { data: wo } = await db.from("work_orders").select("status, invoice_number, accounting_status");
    const notBillingReady = (wo ?? []).filter(r =>
      r.status === "completed" && isBlank(r.invoice_number),
    ).length;
    return [
      { key: "missing_fields", label: "מסמכי ספק חסרי שדות ליבה", count: missingFields, severity: "warning", href: "/financial-management" },
      { key: "not_billing_ready", label: "הזמנות שהושלמו וטרם חויבו", count: notBillingReady, severity: "warning", href: "/accounting" },
    ];
  });

  // 5 — Stuck drafts / orders / intake
  await group("intake", "טיוטות והזמנות תקועות", async () => {
    const { data: drafts } = await db.from("team_bot_order_drafts").select("status, created_at");
    const stuckDrafts = (drafts ?? []).filter(r =>
      !["promoted", "rejected", "archived", "completed"].includes(r.status as string) &&
      olderThanHours(r.created_at as string, 48),
    ).length;

    const { data: intake } = await db.from("jarvis_intake_records").select("status, created_at");
    const pendingIntake = (intake ?? []).filter(r =>
      ["pending", "pending_review", "new", "received"].includes(r.status as string) &&
      olderThanHours(r.created_at as string, 24),
    ).length;

    const { data: wo } = await db.from("work_orders").select("status, customer, city");
    const incomplete = (wo ?? []).filter(r =>
      !["completed", "cancelled", "archived"].includes(r.status as string) &&
      (isBlank(r.customer) || isBlank(r.city)),
    ).length;

    return [
      { key: "stuck_drafts", label: "טיוטות בוט תקועות (48 ש׳+)", count: stuckDrafts, severity: "warning", href: "/team-bot-orders" },
      { key: "pending_intake", label: "קליטת JARVIS ממתינה (24 ש׳+)", count: pendingIntake, severity: "warning", href: "/jarvis-requests" },
      { key: "incomplete_orders", label: "הזמנות חסרות לקוח/עיר", count: incomplete, severity: "info", href: "/orders" },
    ];
  });

  // 6 — JARVIS / agent workflow
  await group("workflow", "זרימת עבודה — JARVIS וסוכנים", async () => {
    const { data: cmds } = await db.from("jarvis_ceo_agent_commands").select("status, routed_to_agent");
    const all = cmds ?? [];
    const terminal = new Set(["executed", "failed", "reverted", "rejected", "archived", "execution_disabled", "executed_later"]);
    const openReq = all.filter(r => !terminal.has(r.status as string)).length;
    const clarify = all.filter(r => r.status === "needs_info").length;
    const routedOpen = all.filter(r => !terminal.has(r.status as string) && !isBlank(r.routed_to_agent)).length;

    const { data: excRows } = await db.from("agent_exceptions").select("status").in("status", ["open", "acknowledged"]);
    const exc = excRows ?? [];
    const openExc = exc.filter(e => e.status === "open").length;
    const ackExc = exc.filter(e => e.status === "acknowledged").length;

    // Task lifecycle states (read-only, from stored fields): created/unassigned
    // vs assigned vs stale. Distinguishes "risk has a task but no owner" from
    // "owned & in flight" from "owned but going stale".
    const { data: taskRows } = await db.from("agent_tasks").select("status, assigned_to, updated_at").in("status", ["open", "in_progress"]);
    const tasks = taskRows ?? [];
    const STALE_DAYS = 7;
    const unassignedTasks = tasks.filter(t => isBlank(t.assigned_to)).length;
    const assignedTasks = tasks.filter(t => !isBlank(t.assigned_to)).length;
    const staleTasks = tasks.filter(t => {
      const n = daysUntil(t.updated_at as string | null);
      return n !== null && n < -STALE_DAYS; // updated_at older than STALE_DAYS ago
    }).length;

    return [
      { key: "open_requests", label: "בקשות JARVIS פתוחות", count: openReq, severity: "warning", href: "/jarvis-requests" },
      { key: "clarification", label: "ממתינות להבהרה", count: clarify, severity: "warning", href: "/jarvis-requests" },
      { key: "routed_open", label: "נותבו וממתינות לטיפול", count: routedOpen, severity: "info", href: "/jarvis-requests" },
      { key: "open_exceptions", label: "חריגות פתוחות (טרם טופלו)", count: openExc, severity: "warning", href: "/agents" },
      { key: "ack_exceptions", label: "חריגות בטיפול (אושרו)", count: ackExc, severity: "info", href: "/agents" },
      { key: "unassigned_tasks", label: "משימות ללא הקצאה", count: unassignedTasks, severity: "warning", href: "/agents" },
      { key: "assigned_tasks", label: "משימות מוקצות", count: assignedTasks, severity: "info", href: "/agents" },
      { key: "stale_tasks", label: `משימות תקועות (${STALE_DAYS} ימים+)`, count: staleTasks, severity: "critical", href: "/agents" },
    ];
  });

  // ── CEO / System-Manager aggregation (READ-ONLY) ──────────────────────────
  // Turns the live signals into a prioritised, owner-assigned recommendation list
  // WITHOUT writing any task rows (avoids duplicate-on-every-scan). Each active
  // signal is mapped to a responsible department/agent + a recommended next
  // action. This is an actionable recommendation surface, not autonomous action.
  const OWNERS: Record<string, { department: string; owner: string }> = {
    documents: { department: "מסמכים / כספים", owner: "cfo-agent" },
    fleet: { department: "צי רכב ומכונות", owner: "equipment-fleet-agent" },
    inventory: { department: "מחסן", owner: "inventory-agent" },
    finance: { department: "כספים", owner: "cfo-agent" },
    intake: { department: "תפעול / הזמנות", owner: "orders-agent" },
    workflow: { department: "הנהלה (CEO)", owner: "ceo" },
  };
  const ACTIONS: Record<string, string> = {
    stuck: "בדוק מסמכים תקועים בעיבוד OCR",
    review: "בצע בדיקת מסמכים ממתינים",
    low_conf: "אמת מסמכים בביטחון OCR נמוך",
    expired: "חדש מסמכי צי שפגו תוקף",
    soon: "תזמן חידוש מסמכי צי לפני פקיעה",
    pending: "אשר פריטי צי ממתינים",
    zero: "השלם מלאי אפס לפריטים במעקב",
    low: "פתח רכש לפריטים מתחת למינימום",
    missing: "השלם ערכי מלאי חסרים",
    missing_fields: "השלם שדות חסרים במסמכי ספק",
    not_billing_ready: "הכן הזמנות שהושלמו לחיוב",
    stuck_drafts: "טפל בטיוטות בוט תקועות",
    pending_intake: "מיין קליטת JARVIS ממתינה",
    incomplete_orders: "השלם פרטי לקוח/עיר בהזמנות",
    open_requests: "מיין בקשות JARVIS פתוחות",
    clarification: "ספק הבהרה לבקשות ממתינות",
    routed_open: "ודא טיפול בבקשות שנותבו",
    open_exceptions: "הקצה בעלות מחלקתית לחריגות פתוחות",
    ack_exceptions: "המשך טיפול בחריגות שאושרו",
    unassigned_tasks: "הקצה בעלים למשימות ללא הקצאה",
    assigned_tasks: "עקוב אחר משימות מוקצות פתוחות",
    stale_tasks: "טפל במשימות תקועות / עבר זמנן",
  };
  const sevRank: Record<PulseSeverity, number> = { critical: 0, warning: 1, info: 2 };
  const ceoAggregation = groups
    .filter(g => g.available)
    .flatMap(g =>
      g.signals
        .filter(s => s.count > 0)
        .map(s => ({
          domain: g.group,
          domainTitle: g.title,
          key: s.key,
          label: s.label,
          count: s.count,
          severity: s.severity,
          href: s.href,
          department: OWNERS[g.group]?.department ?? "—",
          owner: OWNERS[g.group]?.owner ?? "ceo",
          recommendedAction: ACTIONS[s.key] ?? "סקירה ידנית",
          readOnly: true,
        })),
    )
    .sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.count - a.count);

  return NextResponse.json(
    { groups, ceoAggregation, generatedAt: new Date().toISOString() },
    { headers: { ...cors, "Cache-Control": "no-store" } },
  );
}
