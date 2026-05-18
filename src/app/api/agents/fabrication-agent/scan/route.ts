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

const AGENT_ID   = "fabrication-agent";
const AGENT_NAME = "מנהל ייצור מסגרייה";

// Hours before flagging stuck in_progress. Normal fabrication duration
// is set as 72h (3 days). Urgent orders use 0.5× factor = 36h.
// Requires owner calibration once fabrication duration data is available.
const FABRICATION_STUCK_H = 72;

// Hours before flagging an acknowledged-but-stale order.
const FABRICATION_ACKNOWLEDGED_OVERDUE_H = 24;

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

    // Load only orders where fabrication is required and not yet complete.
    // Excludes cancelled orders. Completed orders are excluded because
    // fabrication_status = "completed" is the terminal state we don't flag.
    const ordersRes = await db
      .from("work_orders")
      .select("id,order_number,status,priority,customer,updated_at,fabrication_required,fabrication_status")
      .eq("fabrication_required", true)
      .not("fabrication_status", "eq", "completed")
      .neq("status", "cancelled")
      .neq("status", "completed");

    if (ordersRes.error) throw new Error(ordersRes.error.message);
    const orders = (ordersRes.data ?? []) as DbOrderRow[];
    result.entitiesScanned = orders.length;

    const dedupeMap = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const nowMs = Date.now();
    const activeDedupeKeys = new Set<string>();

    for (const order of orders) {
      const urgent = order.priority === "urgent";
      const hoursFactor = urgent ? 0.5 : 1;

      // ── Active production issue ──────────────────────────────────────────
      // fabrication_status = "issue" means the fabrication team has flagged
      // an explicit problem. This is always critical regardless of time elapsed.
      if (order.fabrication_status === "issue") {
        const k = dedupeKey("fabrication_issue", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "fabrication_issue",
          entityType: "work_order",
          entityId: order.id,
          severity: "critical",
          title: `בעיה בייצור — הזמנה ${order.order_number}`,
          description: `מסגרייה דיווחה על בעיה. לקוח: ${order.customer} | שלב הזמנה: ${order.status}`,
          detectedFromData: {
            orderNumber: order.order_number,
            fabricationStatus: order.fabrication_status,
            orderStatus: order.status,
            customer: order.customer,
          },
          recommendedResolution: "צור קשר עם מחלקת מסגרייה לבירור הבעיה ועדכון הסטטוס",
        }, dedupeMap, result);
      }

      // ── Stuck in_progress ────────────────────────────────────────────────
      // An order in_progress for longer than the expected fabrication window
      // without a status change. Flagged as error (not critical — no explicit
      // failure signal, only elapsed time).
      if (order.fabrication_status === "in_progress") {
        const hrs = hoursSince(order.updated_at, nowMs);
        const threshold = FABRICATION_STUCK_H * hoursFactor;
        if (hrs >= threshold) {
          const k = dedupeKey("fabrication_stuck_in_progress", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "fabrication_stuck_in_progress",
            entityType: "work_order",
            entityId: order.id,
            severity: "error",
            title: `ייצור תקוע — הזמנה ${order.order_number} (${Math.round(hrs)} שעות בייצור)`,
            description: `לקוח: ${order.customer} | ייצור פעיל מעל ${Math.round(hrs)} שעות ללא עדכון`,
            detectedFromData: {
              orderNumber: order.order_number,
              fabricationStatus: order.fabrication_status,
              hoursInProgress: Math.round(hrs),
              thresholdH: FABRICATION_STUCK_H,
              customer: order.customer,
            },
            recommendedResolution: "בדוק עם המסגרייה את סטטוס ההתקדמות ועדכן את הסטטוס לאחד מ: ready / completed / issue",
          }, dedupeMap, result);
        }
      }

      // ── Acknowledged overdue ─────────────────────────────────────────────
      // "acknowledged" means the fabrication team confirmed receipt of the
      // order but hasn't started. Flagged if no update within 24h of acknowledgement.
      if (order.fabrication_status === "acknowledged") {
        const hrs = hoursSince(order.updated_at, nowMs);
        const threshold = FABRICATION_ACKNOWLEDGED_OVERDUE_H * hoursFactor;
        if (hrs >= threshold) {
          const k = dedupeKey("fabrication_acknowledged_overdue", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "fabrication_acknowledged_overdue",
            entityType: "work_order",
            entityId: order.id,
            severity: "warn",
            title: `הזמנה ${order.order_number} — אושר קבלה אך ייצור טרם החל (${Math.round(hrs)} שעות)`,
            description: `לקוח: ${order.customer} | ייצור אושר לקבלה אך לא עבר ל-in_progress`,
            detectedFromData: {
              orderNumber: order.order_number,
              fabricationStatus: order.fabrication_status,
              hoursAcknowledged: Math.round(hrs),
              thresholdH: FABRICATION_ACKNOWLEDGED_OVERDUE_H,
              customer: order.customer,
            },
            recommendedResolution: "בדוק עם המסגרייה מתי תתחיל הייצור — עדכן ל-in_progress או תזמן תאריך התחלה",
          }, dedupeMap, result);
        }
      }

      // ── Gate open: ready but not completed ───────────────────────────────
      // fabrication_status = "ready" is an internal fabrication state.
      // The workflow gate (canMarkReadyForInstallation) only closes when
      // fabrication_status = "completed". If an order is stuck in "ready"
      // without being advanced to "completed", the gate remains open and
      // the order cannot proceed. Surfaced as warn — no time gate.
      if (order.fabrication_status === "ready") {
        const k = dedupeKey("fabrication_gate_open", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "fabrication_gate_open",
          entityType: "work_order",
          entityId: order.id,
          severity: "warn",
          title: `הזמנה ${order.order_number} — מסגרייה: מוכן, שער טרם נסגר`,
          description: `לקוח: ${order.customer} | fabrication_status = "ready" אך נדרש "completed" לסגירת השער`,
          detectedFromData: {
            orderNumber: order.order_number,
            fabricationStatus: order.fabrication_status,
            orderStatus: order.status,
            customer: order.customer,
          },
          recommendedResolution: "עדכן fabrication_status ל-completed כדי לאפשר מעבר לשלב ready_installation",
        }, dedupeMap, result);
      }
    }

    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    const summary = `סריקה הושלמה: ${result.entitiesScanned} הזמנות ייצור | ${result.exceptionsCreated} חריגות חדשות | ${result.exceptionsUpdated} עודכנו | ${result.exceptionsResolved} נפתרו`;
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
