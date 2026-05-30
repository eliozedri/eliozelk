import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  loadAgentExceptionDedupeMap,
  loadAgentTaskDedupeMap,
  upsertException,
  upsertTask,
  autoResolveStaleExceptions,
  writeAgentActivity,
  updateAgentRunStatus,
  logAgentAction,
  hoursSince,
  verifyMasterAuth,
  dedupeKey,
} from "@/lib/agents/scan-utils";
import { emptyScanResult } from "@/lib/agents/types";
import type { DbOrderRow } from "@/lib/agents/types";

const AGENT_ID   = "ceo";
const AGENT_NAME = "מנהל פעילות";

// ── SLA thresholds (hours) — mirrors useWorkflowAlerts ───────────────────────

const SLA: Record<string, { warnH: number; criticalH: number }> = {
  graphics_pending:   { warnH: 24,  criticalH: 48  },
  graphics_active:    { warnH: 48,  criticalH: 72  },
  graphics_done:      { warnH: 24,  criticalH: 48  },
  production:         { warnH: 72,  criticalH: 120 },
  ready_installation: { warnH: 24,  criticalH: 72  },
};

const ACTIVE_STATUSES = new Set([
  "graphics_pending", "graphics_active", "graphics_done",
  "production", "ready_installation",
]);

function stageEntryTs(order: DbOrderRow): string {
  switch (order.status) {
    case "graphics_pending":   return order.graphics_sent_at ?? order.created_at;
    case "graphics_active":    return order.graphics_acknowledged_at ?? order.updated_at;
    case "graphics_done":      return order.graphics_completed_at ?? order.updated_at;
    case "production":         return order.updated_at;
    case "ready_installation": return order.ready_for_execution_at ?? order.updated_at;
    default:                   return order.updated_at;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const start = Date.now();
  const result = emptyScanResult(AGENT_ID, AGENT_NAME);

  // Auth
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await updateAgentRunStatus(db, AGENT_ID, "active");

    // ── Load data ────────────────────────────────────────────────────────
    const [ordersRes, consumptionsRes] = await Promise.all([
      db.from("work_orders")
        .select("id,order_number,status,priority,customer,city,order_date,created_at,updated_at,graphics_sent_at,graphics_acknowledged_at,graphics_completed_at,fabrication_required,fabrication_status,accounting_status,invoiced_at,billed_amount,scheduled_date,ready_for_execution_at,order_type,customer_approval_status,warehouse_required,warehouse_status,data")
        .neq("status", "cancelled"),
      db.from("inventory_consumptions")
        .select("order_id,status")
        .in("status", ["consumed", "pending_review"]),
    ]);

    if (ordersRes.error) throw new Error(ordersRes.error.message);
    const orders = (ordersRes.data ?? []) as DbOrderRow[];
    result.entitiesScanned = orders.length;

    // Build reconciled order set from inventory_consumptions
    const reconciledOrderIds = new Set(
      (consumptionsRes.data ?? []).map((c: { order_id: string }) => c.order_id).filter(Boolean)
    );

    // ── Load existing exceptions ──────────────────────────────────────────
    const dedupeMap = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const taskDedupeMap = await loadAgentTaskDedupeMap(db, AGENT_ID);
    const nowMs = Date.now();
    const activeDedupeKeys = new Set<string>();

    // ── Scan each active order ────────────────────────────────────────────
    for (const order of orders) {
      const urgent = order.priority === "urgent";
      const hoursFactor = urgent ? 0.5 : 1;

      // ── SLA breach ────────────────────────────────────────────────────
      if (ACTIVE_STATUSES.has(order.status)) {
        const sla = SLA[order.status];
        if (sla) {
          const hrs = hoursSince(stageEntryTs(order), nowMs);
          const effectiveWarn = sla.warnH * hoursFactor;
          const effectiveCrit = sla.criticalH * hoursFactor;

          if (hrs >= effectiveWarn) {
            const severity = hrs >= effectiveCrit ? "critical" : "warn";
            const category = `sla_${order.status}`;
            const k = dedupeKey(category, "work_order", order.id);
            activeDedupeKeys.add(k);
            await upsertException(db, AGENT_ID, {
              category,
              entityType: "work_order",
              entityId: order.id,
              severity,
              title: `הזמנה ${order.order_number} תקועה — ${Math.round(hrs)} שעות בשלב ${order.status}`,
              description: `לקוח: ${order.customer} | עיר: ${order.city} | עדיפות: ${urgent ? "דחוף" : "רגיל"}`,
              detectedFromData: {
                orderNumber: order.order_number,
                status: order.status,
                hoursInStage: Math.round(hrs),
                slaWarnH: sla.warnH,
                slaCritH: sla.criticalH,
                customer: order.customer,
              },
              recommendedResolution: `בדוק את שלב ${order.status} עבור הזמנה ${order.order_number} ופעל להמשך התהליך`,
            }, dedupeMap, result);
          }
        }
      }

      // ── Fabrication issue ─────────────────────────────────────────────
      if (order.fabrication_required && order.fabrication_status === "issue" &&
          order.status !== "completed") {
        const k = dedupeKey("fabrication_issue", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "fabrication_issue",
          entityType: "work_order",
          entityId: order.id,
          severity: "critical",
          title: `בעיה בייצור — הזמנה ${order.order_number}`,
          description: `מסגרייה דיווחה על בעיה. לקוח: ${order.customer}`,
          detectedFromData: { orderNumber: order.order_number, fabricationStatus: order.fabrication_status },
          recommendedResolution: "צור קשר עם מחלקת מסגרייה לבירור הבעיה ועדכון הסטטוס",
        }, dedupeMap, result);
      }

      // ── Urgent order stuck > 24h ──────────────────────────────────────
      if (order.priority === "urgent" &&
          order.status !== "completed" &&
          ACTIVE_STATUSES.has(order.status)) {
        const hrs = hoursSince(order.created_at, nowMs);
        if (hrs >= 24) {
          const k = dedupeKey("urgent_stuck", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "urgent_stuck",
            entityType: "work_order",
            entityId: order.id,
            severity: "critical",
            title: `הזמנה דחופה ${order.order_number} פעילה מעל ${Math.round(hrs)} שעות`,
            description: `שלב נוכחי: ${order.status} | לקוח: ${order.customer}`,
            detectedFromData: { orderNumber: order.order_number, hoursActive: Math.round(hrs), status: order.status },
            recommendedResolution: "טפל בהזמנה הדחופה מיידית ועדכן את הסטטוס",
          }, dedupeMap, result);
        }
      }

      // ── Operationally complete but not yet entered billing verification ─
      // The billing-collections-agent owns deeper billing exceptions.
      // ceo gives a short nudge: if an order sits in "pending"
      // accounting status for more than 24h, flag it so it enters the billing flow.
      if (order.status === "completed" &&
          (!order.accounting_status || order.accounting_status === "pending") &&
          !order.invoiced_at) {
        const hrs = hoursSince(order.updated_at, nowMs);
        if (hrs >= 24) {
          const severity = hrs >= 72 ? "critical" : "warn";
          const k = dedupeKey("not_verified_for_billing", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "not_verified_for_billing",
            entityType: "work_order",
            entityId: order.id,
            severity,
            title: `הזמנה ${order.order_number} הושלמה תפעולית — נדרש אימות מוכנות לחיוב (${Math.round(hrs / 24)} ימים)`,
            description: `לקוח: ${order.customer} | הושלמה לפני ${Math.round(hrs)} שעות ועדיין בסטטוס "ממתין לאימות"`,
            detectedFromData: { orderNumber: order.order_number, hoursCompleted: Math.round(hrs), accountingStatus: order.accounting_status ?? "pending" },
            recommendedResolution: "בצע אימות מוכנות לחיוב בהנהלת כספים — בדוק חסמים ואשר",
          }, dedupeMap, result);
        }
      }

      // ── Completed warehouse order missing inventory reconciliation ────────
      // Ops nudge: warehouse orders with mapped items that have no consumption yet.
      // Ownership: inventory-agent owns deeper reconciliation exceptions;
      // ceo only flags if the order is stuck before billing.
      if (order.status === "completed" && !order.invoiced_at &&
          !reconciledOrderIds.has(order.id)) {
        const orderData = order.data as Record<string, unknown> | null ?? {};
        const accessoryRows = (orderData.accessoryRows ?? []) as Array<{ catalogItemId?: string; quantity?: string }>;
        const miscRows      = (orderData.miscRows ?? [])      as Array<{ catalogItemId?: string; quantity?: string }>;
        const hasMappedItems = [...accessoryRows, ...miscRows].some(r => r.catalogItemId && (parseFloat(r.quantity ?? "0") || 0) > 0);
        if ((order.warehouse_required || hasMappedItems) && hasMappedItems) {
          const k = dedupeKey("missing_inventory_reconciliation", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "missing_inventory_reconciliation",
            entityType: "work_order",
            entityId: order.id,
            severity: "warn",
            title: `הזמנה ${order.order_number} — פריטי מלאי ממופים ללא התאמה`,
            description: `לקוח: ${order.customer} | נדרשת התאמת מלאי לפני אישור לחיוב`,
            detectedFromData: { orderNumber: order.order_number, warehouseRequired: order.warehouse_required },
            recommendedResolution: "מחסן ← הזמנות → 'בצע התאמה' לפני העברה לחיוב",
          }, dedupeMap, result);
        }
      }
    }

    // ── System risk roll-up (executive monitor across all department agents) ──
    // Read-only aggregation of currently-open agent exceptions so the CEO / DigitalHQ
    // view surfaces real cross-department risk instead of per-agent silos. Excludes
    // its own summary category to avoid a self-referential feedback loop.
    const SYSTEM_RISK_CATEGORY = "system_risk_elevated";
    const openExcRes = await db
      .from("agent_exceptions")
      .select("agent_id,severity,category")
      .eq("status", "open")
      .neq("category", SYSTEM_RISK_CATEGORY);
    if (!openExcRes.error) {
      const rows = openExcRes.data ?? [];
      const bySeverity: Record<string, number> = { critical: 0, error: 0, warn: 0, info: 0 };
      const byAgent: Record<string, number> = {};
      for (const r of rows) {
        const sev = String(r.severity ?? "info");
        bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
        const a = String(r.agent_id ?? "unknown");
        byAgent[a] = (byAgent[a] ?? 0) + 1;
      }
      const critical = bySeverity.critical ?? 0;
      const errors = bySeverity.error ?? 0;
      await writeAgentActivity(
        db, AGENT_ID, "detection",
        `סקירת סיכון מערכתית: ${rows.length} חריגות פתוחות (${critical} קריטיות, ${errors} שגיאות) על פני ${Object.keys(byAgent).length} סוכנים`,
        { totalOpen: rows.length, bySeverity, byAgent },
      );

      const ELEVATED_CRITICAL = 3;
      if (critical >= ELEVATED_CRITICAL) {
        const k = dedupeKey(SYSTEM_RISK_CATEGORY, "system", "global");
        activeDedupeKeys.add(k);
        const topAgents = Object.entries(byAgent).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, n]) => `${a}:${n}`).join(", ");
        await upsertException(db, AGENT_ID, {
          category: SYSTEM_RISK_CATEGORY,
          entityType: "system",
          entityId: "global",
          severity: "critical",
          title: `סיכון מערכתי מוגבר — ${critical} חריגות קריטיות פתוחות`,
          description: `סה״כ ${rows.length} חריגות פתוחות | קריטיות: ${critical} | שגיאות: ${errors} | מובילים: ${topAgents}`,
          detectedFromData: { bySeverity, byAgent },
          recommendedResolution: "פתח את מרכז הסוכנים (DigitalHQ) וטפל בחריגות הקריטיות לפי מחלקה",
        }, dedupeMap, result);
      }

      // ── CEO escalation TASK (system manager: assigned, actionable, deduped) ──
      // Beyond the read-only roll-up: when criticals are elevated, or agent tasks
      // are unowned / going stale, raise ONE assigned escalation task (stable
      // global key → re-scans update, no spam). Safe metadata only — no business
      // mutation; the owner acts in DigitalHQ.
      const { data: openTaskRows } = await db
        .from("agent_tasks")
        .select("assigned_to, updated_at")
        .in("status", ["open", "in_progress"]);
      const openTasks = openTaskRows ?? [];
      const unassignedCount = openTasks.filter(t => !t.assigned_to || String(t.assigned_to).trim() === "").length;
      const STALE_MS = 7 * 86_400_000;
      const staleCount = openTasks.filter(t => {
        const ts = t.updated_at ? new Date(t.updated_at as string).getTime() : NaN;
        return !Number.isNaN(ts) && nowMs - ts > STALE_MS;
      }).length;

      if (critical >= ELEVATED_CRITICAL || unassignedCount > 0 || staleCount > 0) {
        const topAgentsList = Object.entries(byAgent).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, n]) => `${a}:${n}`).join(", ");
        await upsertTask(db, AGENT_ID, {
          category: "ceo_escalation",
          entityType: "system",
          entityId: "global",
          title: "הסלמת CEO — סיכון/משימות מערכתיות",
          description: `חריגות קריטיות פתוחות: ${critical} · שגיאות: ${errors} · משימות ללא הקצאה: ${unassignedCount} · תקועות (7 ימים+): ${staleCount} | מובילים: ${topAgentsList || "—"}`,
          priority: critical >= ELEVATED_CRITICAL ? "critical" : "high",
          recommendedAction: "פתח את מרכז הסוכנים (DigitalHQ): טפל בחריגות הקריטיות, הקצה בעלים למשימות ללא הקצאה, וקדם משימות תקועות",
        }, taskDedupeMap, result);
      }
    }

    // ── Auto-resolve stale exceptions ─────────────────────────────────────
    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    // ── Activity summary ──────────────────────────────────────────────────
    const summary = `סריקה הושלמה: ${result.entitiesScanned} הזמנות | ${result.exceptionsCreated} חריגות חדשות | ${result.exceptionsUpdated} עודכנו | ${result.exceptionsResolved} נפתרו | ${result.tasksCreated} משימות נוצרו`;
    await writeAgentActivity(db, AGENT_ID, "detection", summary, {
      entitiesScanned: result.entitiesScanned,
      exceptionsCreated: result.exceptionsCreated,
      exceptionsUpdated: result.exceptionsUpdated,
      exceptionsResolved: result.exceptionsResolved,
      tasksCreated: result.tasksCreated,
      tasksUpdated: result.tasksUpdated,
    });

    result.durationMs = Date.now() - start;
    await updateAgentRunStatus(db, AGENT_ID, "idle");
    await logAgentAction(db, AGENT_ID, "scan", result as unknown as Record<string, unknown>, "success");

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    result.durationMs = Date.now() - start;
    await updateAgentRunStatus(db, AGENT_ID, "error").catch(() => {});
    await logAgentAction(db, AGENT_ID, "scan", {}, "error", msg).catch(() => {});
    return NextResponse.json(result, { status: 500 });
  }
}
