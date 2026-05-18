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

const AGENT_ID   = "coordination-qa-agent";
const AGENT_NAME = "מנהל התיאומים / QA";

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const start = Date.now();
  const result = emptyScanResult(AGENT_ID, AGENT_NAME);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await updateAgentRunStatus(db, AGENT_ID, "active");

    const [ordersRes, problemsRes, diariesRes] = await Promise.all([
      db.from("work_orders")
        .select("id,order_number,status,priority,customer,city,updated_at,scheduled_date,ready_for_execution_at,warehouse_required,warehouse_status,fabrication_required,fabrication_status,order_type,customer_approval_status")
        .eq("status", "ready_installation"),
      db.from("order_problems")
        .select("id,order_id,status")
        .not("status", "in", '("resolved","cancelled")'),
      db.from("work_diaries")
        .select("order_id,status")
        .eq("status", "submitted"),
    ]);

    if (ordersRes.error) throw new Error(ordersRes.error.message);
    const orders = (ordersRes.data ?? []) as DbOrderRow[];
    result.entitiesScanned = orders.length;

    // Build open-problem count per order
    const openProbsByOrder = new Map<string, number>();
    for (const p of problemsRes.data ?? []) {
      const oid = p.order_id as string;
      openProbsByOrder.set(oid, (openProbsByOrder.get(oid) ?? 0) + 1);
    }

    // Build submitted-diary set per order
    const submittedDiaryByOrder = new Set<string>();
    for (const d of diariesRes.data ?? []) {
      if (d.order_id) submittedDiaryByOrder.add(d.order_id as string);
    }

    const dedupeMap = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const nowMs = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
    const activeDedupeKeys = new Set<string>();

    for (const order of orders) {
      const urgent = order.priority === "urgent";
      const hoursFactor = urgent ? 0.5 : 1;

      // ── Unscheduled: no scheduled_date set ───────────────────────────────
      // An order in ready_installation without a scheduled date is a
      // scheduling gap. Flagged after 24h; escalated to critical after 72h.
      if (!order.scheduled_date) {
        const hrs = hoursSince(order.ready_for_execution_at ?? order.updated_at, nowMs);
        const effectiveWarn = 24 * hoursFactor;
        const effectiveCrit = 72 * hoursFactor;
        if (hrs >= effectiveWarn) {
          const severity = hrs >= effectiveCrit ? "critical" : "warn";
          const k = dedupeKey("unscheduled_ready", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "unscheduled_ready",
            entityType: "work_order",
            entityId: order.id,
            severity,
            title: `הזמנה ${order.order_number} מוכנה להתקנה ללא תיאום (${Math.round(hrs)} שעות)`,
            description: `לקוח: ${order.customer} | עיר: ${order.city} | ממתינה לשיבוץ תאריך`,
            detectedFromData: {
              orderNumber: order.order_number,
              hoursWaiting: Math.round(hrs),
              customer: order.customer,
              city: order.city,
            },
            recommendedResolution: "שבץ תאריך ביצוע בסידור השבועי",
          }, dedupeMap, result);
        }
      }

      // ── Gate open: fabrication not completed ─────────────────────────────
      // An order in ready_installation with fabrication_required=true but
      // fabrication_status != "completed" is a workflow integrity violation.
      // The gate (canMarkReadyForInstallation) should have blocked this transition.
      // Surfaced as error — data inconsistency requiring correction.
      if (order.fabrication_required && order.fabrication_status !== "completed") {
        const k = dedupeKey("gate_fabrication_open", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "gate_fabrication_open",
          entityType: "work_order",
          entityId: order.id,
          severity: "error",
          title: `הזמנה ${order.order_number} — שער ייצור פתוח בשלב ready_installation`,
          description: `לקוח: ${order.customer} | fabrication_status: ${order.fabrication_status ?? "null"} (נדרש: completed)`,
          detectedFromData: {
            orderNumber: order.order_number,
            fabricationStatus: order.fabrication_status,
            orderStatus: order.status,
            customer: order.customer,
          },
          recommendedResolution: "בדוק את שלב הייצור — עדכן fabrication_status ל-completed או החזר את ההזמנה לשלב production",
        }, dedupeMap, result);
      }

      // ── Gate open: warehouse not ready ───────────────────────────────────
      // An order in ready_installation with warehouse_required=true but
      // warehouse_status != "ready" is similarly a workflow integrity violation.
      if (order.warehouse_required && order.warehouse_status !== "ready") {
        const k = dedupeKey("gate_warehouse_open", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "gate_warehouse_open",
          entityType: "work_order",
          entityId: order.id,
          severity: "error",
          title: `הזמנה ${order.order_number} — שער מחסן פתוח בשלב ready_installation`,
          description: `לקוח: ${order.customer} | warehouse_status: ${order.warehouse_status ?? "null"} (נדרש: ready)`,
          detectedFromData: {
            orderNumber: order.order_number,
            warehouseStatus: order.warehouse_status,
            orderStatus: order.status,
            customer: order.customer,
          },
          recommendedResolution: "בדוק את שלב המחסן — עדכן warehouse_status ל-ready או החזר את ההזמנה לשלב production",
        }, dedupeMap, result);
      }

      // ── Missing diary after scheduled date ───────────────────────────────
      // Order has a past scheduled date but no submitted diary = field execution
      // completed with no documentation. Blocks billing verification.
      if (
        order.scheduled_date &&
        order.scheduled_date < todayStr &&
        !submittedDiaryByOrder.has(order.id)
      ) {
        const k = dedupeKey("missing_diary_post_scheduled", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "missing_diary_post_scheduled",
          entityType: "work_order",
          entityId: order.id,
          severity: "error",
          title: `הזמנה ${order.order_number} — יומן שטח חסר לאחר תאריך ביצוע`,
          description: `לקוח: ${order.customer} | תאריך שיבוץ: ${order.scheduled_date} | יומן שטח לא הוגש`,
          detectedFromData: {
            orderNumber: order.order_number,
            scheduledDate: order.scheduled_date,
            customer: order.customer,
          },
          recommendedResolution: "דרוש מהצוות הגשת יומן שטח — נדרש לפני אישור לחיוב",
        }, dedupeMap, result);
      }

      // ── Customer approval pending on field_work ──────────────────────────
      // A field_work order in ready_installation with approval still pending
      // cannot be dispatched. Flagged immediately (no time threshold) as a
      // blocking gate condition.
      if (
        order.order_type === "field_work" &&
        order.customer_approval_status === "pending"
      ) {
        const k = dedupeKey("pending_approval_blocking", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "pending_approval_blocking",
          entityType: "work_order",
          entityId: order.id,
          severity: "warn",
          title: `הזמנה ${order.order_number} — אישור לקוח ממתין, שיגור חסום`,
          description: `לקוח: ${order.customer} | נדרש אישור לקוח לפני שיגור לשטח`,
          detectedFromData: {
            orderNumber: order.order_number,
            orderType: order.order_type,
            customerApprovalStatus: order.customer_approval_status,
            customer: order.customer,
          },
          recommendedResolution: "קבל אישור לקוח לפני שיגור הצוות לשטח",
        }, dedupeMap, result);
      }

      // ── Open problems blocking dispatch ──────────────────────────────────
      // Active unresolved problems on a ready_installation order signal that
      // the order should not be dispatched without resolution.
      const probCount = openProbsByOrder.get(order.id) ?? 0;
      if (probCount > 0) {
        const k = dedupeKey("open_problems_blocking_dispatch", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "open_problems_blocking_dispatch",
          entityType: "work_order",
          entityId: order.id,
          severity: probCount >= 3 ? "error" : "warn",
          title: `${probCount} בעיות פתוחות חוסמות שיגור — הזמנה ${order.order_number}`,
          description: `לקוח: ${order.customer} | ${probCount} בעיות פתוחות על הזמנה מוכנה לשיגור`,
          detectedFromData: {
            orderNumber: order.order_number,
            openProblemsCount: probCount,
            customer: order.customer,
          },
          recommendedResolution: "פתור את הבעיות הפתוחות לפני שיגור הצוות לשטח",
        }, dedupeMap, result);
      }
    }

    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    const summary = `סריקה הושלמה: ${result.entitiesScanned} הזמנות לשיגור | ${result.exceptionsCreated} חריגות חדשות | ${result.exceptionsUpdated} עודכנו | ${result.exceptionsResolved} נפתרו`;
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
