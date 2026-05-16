import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  loadAgentExceptionDedupeMap,
  upsertException,
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

const AGENT_ID   = "ops-orchestrator";
const AGENT_NAME = "מנהל תפעול";

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
    const [ordersRes, problemsRes, diariesRes, consumptionsRes] = await Promise.all([
      db.from("work_orders")
        .select("id,order_number,status,priority,customer,city,order_date,created_at,updated_at,graphics_sent_at,graphics_acknowledged_at,graphics_completed_at,fabrication_required,fabrication_status,accounting_status,invoiced_at,billed_amount,scheduled_date,ready_for_execution_at,order_type,customer_approval_status,warehouse_required,warehouse_status,data")
        .neq("status", "cancelled"),
      db.from("order_problems")
        .select("id,order_id,status,category,department")
        .not("status", "in", '("resolved","cancelled")'),
      db.from("work_diaries")
        .select("id,order_id,status,approval_status,submitted_at,execution_date"),
      db.from("inventory_consumptions")
        .select("order_id,status")
        .in("status", ["consumed", "pending_review"]),
    ]);

    if (ordersRes.error) throw new Error(ordersRes.error.message);
    const orders      = (ordersRes.data ?? []) as DbOrderRow[];
    const problems    = problemsRes.data ?? [];
    const diaries     = diariesRes.data ?? [];
    result.entitiesScanned = orders.length;

    // Build open-problems per order
    const openProbsByOrder = new Map<string, number>();
    for (const p of problems) {
      const oid = p.order_id as string;
      openProbsByOrder.set(oid, (openProbsByOrder.get(oid) ?? 0) + 1);
    }

    // Build submitted diary set per order
    const submittedDiaryByOrder = new Map<string, boolean>();
    for (const d of diaries) {
      if (d.order_id && d.status === "submitted") {
        submittedDiaryByOrder.set(d.order_id as string, true);
      }
    }

    // Build reconciled order set from inventory_consumptions
    const reconciledOrderIds = new Set(
      (consumptionsRes.data ?? []).map((c: { order_id: string }) => c.order_id).filter(Boolean)
    );

    // ── Load existing exceptions ──────────────────────────────────────────
    const dedupeMap = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const nowMs = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
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

      // ── Unscheduled ready for installation ────────────────────────────
      if (order.status === "ready_installation" && !order.scheduled_date) {
        const hrs = hoursSince(order.ready_for_execution_at ?? order.updated_at, nowMs);
        if (hrs >= 24) {
          const severity = hrs >= 72 ? "critical" : "warn";
          const k = dedupeKey("unscheduled_ready", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "unscheduled_ready",
            entityType: "work_order",
            entityId: order.id,
            severity,
            title: `הזמנה ${order.order_number} מוכנה להתקנה ללא תיאום`,
            description: `${Math.round(hrs)} שעות בלי תאריך שיבוץ. לקוח: ${order.customer}`,
            detectedFromData: { orderNumber: order.order_number, hoursWaiting: Math.round(hrs) },
            recommendedResolution: "שבץ תאריך ביצוע בסידור השבועי",
          }, dedupeMap, result);
        }
      }

      // ── Missing diary after scheduled date ───────────────────────────
      if (order.status === "ready_installation" &&
          order.scheduled_date && order.scheduled_date < todayStr &&
          !submittedDiaryByOrder.get(order.id)) {
        const k = dedupeKey("missing_diary", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "missing_diary",
          entityType: "work_order",
          entityId: order.id,
          severity: "error",
          title: `הזמנה ${order.order_number} בוצעה — יומן שטח חסר`,
          description: `תאריך שיבוץ: ${order.scheduled_date} | לקוח: ${order.customer}`,
          detectedFromData: { orderNumber: order.order_number, scheduledDate: order.scheduled_date },
          recommendedResolution: "דרוש מהצוות הגשת יומן שטח עבור יום הביצוע",
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

      // ── Open problems on active order ─────────────────────────────────
      const probCount = openProbsByOrder.get(order.id) ?? 0;
      if (probCount > 0 && order.status !== "completed") {
        const k = dedupeKey("open_problems", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "open_problems",
          entityType: "work_order",
          entityId: order.id,
          severity: probCount >= 3 ? "error" : "warn",
          title: `${probCount} בעיות פתוחות — הזמנה ${order.order_number}`,
          description: `לקוח: ${order.customer} | שלב: ${order.status}`,
          detectedFromData: { orderNumber: order.order_number, openProblemsCount: probCount },
          recommendedResolution: "בדוק ופתור את הבעיות הפתוחות עבור ההזמנה",
        }, dedupeMap, result);
      }

      // ── Operationally complete but not yet entered billing verification ─
      // The billing-collections-agent owns deeper billing exceptions.
      // ops-orchestrator gives a short nudge: if an order sits in "pending"
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
            recommendedResolution: "בצע אימות מוכנות לחיוב בהנהלת חשבונות — בדוק חסמים ואשר",
          }, dedupeMap, result);
        }
      }

      // ── Completed warehouse order missing inventory reconciliation ────────
      // Ops nudge: warehouse orders with mapped items that have no consumption yet.
      // Ownership: inventory-agent owns deeper reconciliation exceptions;
      // ops-orchestrator only flags if the order is stuck before billing.
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

    // ── Auto-resolve stale exceptions ─────────────────────────────────────
    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    // ── Activity summary ──────────────────────────────────────────────────
    const summary = `סריקה הושלמה: ${result.entitiesScanned} הזמנות | ${result.exceptionsCreated} חריגות חדשות | ${result.exceptionsUpdated} עודכנו | ${result.exceptionsResolved} נפתרו`;
    await writeAgentActivity(db, AGENT_ID, "detection", summary, {
      entitiesScanned: result.entitiesScanned,
      exceptionsCreated: result.exceptionsCreated,
      exceptionsUpdated: result.exceptionsUpdated,
      exceptionsResolved: result.exceptionsResolved,
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
