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

const AGENT_ID   = "graphics-production-agent";
const AGENT_NAME = "מנהל גרפיקה ועיצוב";

// SLA thresholds mirror STAGE_SLA in workflowEngine.ts
const SLA: Record<string, { warnH: number; criticalH: number }> = {
  graphics_pending: { warnH: 24,  criticalH: 48 },
  graphics_active:  { warnH: 48,  criticalH: 72 },
  graphics_done:    { warnH: 24,  criticalH: 48 },
};

const GRAPHICS_STATUSES = new Set([
  "graphics_pending",
  "graphics_active",
  "graphics_done",
]);

function stageEntryTs(order: DbOrderRow): string {
  switch (order.status) {
    case "graphics_pending": return order.graphics_sent_at   ?? order.created_at;
    case "graphics_active":  return order.graphics_acknowledged_at ?? order.updated_at;
    case "graphics_done":    return order.graphics_completed_at    ?? order.updated_at;
    default:                 return order.updated_at;
  }
}

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

    const ordersRes = await db
      .from("work_orders")
      .select("id,order_number,status,priority,customer,city,created_at,updated_at,graphics_sent_at,graphics_acknowledged_at,graphics_completed_at,order_type,customer_approval_status,design_approval_status,design_sent_at,design_approved_at")
      .in("status", ["graphics_pending", "graphics_active", "graphics_done"]);

    if (ordersRes.error) throw new Error(ordersRes.error.message);
    const orders = (ordersRes.data ?? []) as DbOrderRow[];
    result.entitiesScanned = orders.length;

    const dedupeMap = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const taskDedupeMap = await loadAgentTaskDedupeMap(db, AGENT_ID);
    const nowMs = Date.now();
    const activeDedupeKeys = new Set<string>();

    for (const order of orders) {
      const urgent = order.priority === "urgent";
      const hoursFactor = urgent ? 0.5 : 1;
      // Collected actionable reason → one consolidated graphics task per order
      // (stable title, no spam). Only set for genuine blockers.
      let graphicsTaskReason: string | null = null;

      // ── SLA breach in graphics stage ─────────────────────────────────────
      if (GRAPHICS_STATUSES.has(order.status)) {
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
              title: `הזמנה ${order.order_number} — ${Math.round(hrs)} שעות בשלב ${order.status}`,
              description: `לקוח: ${order.customer} | עיר: ${order.city} | עדיפות: ${urgent ? "דחוף" : "רגיל"}`,
              detectedFromData: {
                orderNumber: order.order_number,
                status: order.status,
                hoursInStage: Math.round(hrs),
                slaWarnH: sla.warnH,
                slaCritH: sla.criticalH,
                customer: order.customer,
              },
              recommendedResolution: `טפל בהזמנה ${order.order_number} בשלב הגרפיקה ועדכן את הסטטוס`,
            }, dedupeMap, result);
            if (severity === "critical") graphicsTaskReason = "תקוע בשלב הגרפיקה מעבר ל-SLA";
          }
        }
      }

      // ── Design proof approval pending (Track 1) ─────────────────────────
      // Fires when the design proof was sent to the customer (design_approval_status
      // = 'sent') but no response has been received within threshold hours.
      //
      // Does NOT fire for: 'approved', 'not_required', 'bypassed_by_manager'.
      // The bypassed_by_manager value means an authorized manager/owner approved
      // proceeding without explicit customer sign-off — this is a valid business
      // resolution, not customer approval. See spec §6.7 and §19.6 for bypass rules.
      //
      // Does NOT fire for: null (design flow not yet started), 'rejected',
      // 'revision_requested', 'pending_send' (future checks — Phase 2).
      if (order.design_approval_status === "sent") {
        const sentTs = order.design_sent_at ?? order.updated_at;
        const hrs = hoursSince(sentTs, nowMs);
        const warnH  = 24 * hoursFactor;
        const critH  = 72 * hoursFactor;
        if (hrs >= warnH) {
          const severity = hrs >= critH ? "critical" : "warn";
          const k = dedupeKey("design_approval_pending", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "design_approval_pending",
            entityType: "work_order",
            entityId: order.id,
            severity,
            title: `הזמנה ${order.order_number} — ממתינה לאישור טיוטת גרפיקה ${Math.round(hrs)} שעות`,
            description: `לקוח: ${order.customer} | טיוטה נשלחה ללא אישור. ניתן לאשר ע״י הלקוח או עקיפה מנהלית.`,
            detectedFromData: {
              orderNumber: order.order_number,
              customer: order.customer,
              designSentAt: order.design_sent_at,
              designApprovalStatus: order.design_approval_status,
              hoursWaiting: Math.round(hrs),
            },
            recommendedResolution: "קבל אישור לקוח לטיוטת הגרפיקה, או הגדר design_approval_status = bypassed_by_manager לאישור מנהלי",
          }, dedupeMap, result);
          graphicsTaskReason = "טיוטת גרפיקה ממתינה לאישור לקוח";
        }
      }

      // ── Consolidated graphics human-review task (safe metadata; no business mutation) ──
      // One stable task per order that has a genuine graphics blocker (SLA-critical
      // or pending design approval) → re-scans UPDATE the same task (no spam).
      // Auto-assigned to graphics-production-agent. Design-spec completeness checks
      // (missing dimensions/material/quantity/file) need the order line-item model
      // and are a documented follow-up — not inferred here.
      if (graphicsTaskReason) {
        await upsertTask(db, AGENT_ID, {
          category: "graphics_followup",
          entityType: "work_order",
          entityId: order.id,
          title: `הזמנה ${order.order_number} — טיפול גרפיקה/עיצוב נדרש`,
          description: `${graphicsTaskReason} | לקוח: ${order.customer || "(לא זוהה)"} | שלב: ${order.status}`,
          priority: "high",
          recommendedAction: "טפל בשלב הגרפיקה: השלם/שלח עיצוב או קבל אישור לקוח, ועדכן את הסטטוס",
        }, taskDedupeMap, result);
      }
    }

    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    const summary = `סריקה הושלמה: ${result.entitiesScanned} הזמנות גרפיקה | ${result.exceptionsCreated} חריגות חדשות | ${result.exceptionsUpdated} עודכנו | ${result.exceptionsResolved} נפתרו | ${result.tasksCreated} משימות נוצרו`;
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
