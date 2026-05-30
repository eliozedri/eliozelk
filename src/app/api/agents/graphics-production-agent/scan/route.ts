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
      .select("id,order_number,status,priority,customer,city,created_at,updated_at,graphics_sent_at,graphics_acknowledged_at,graphics_completed_at,order_type,customer_approval_status,design_approval_status,design_sent_at,design_approved_at,data")
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

      // ── Design-spec / production-readiness completeness (existing line-item data) ──
      // Uses the order's stored signRows/miscRows. Flags only genuinely-missing
      // fields (never invents values): signs without a quantity, signs not matched
      // in the catalog, signs without a design image, custom ("לפי מידה") items
      // without dimensions, and items without a quantity. Incomplete specs mean
      // production cannot proceed reliably → exception + human-review task.
      const data = (order as unknown as { data?: Record<string, unknown> | null }).data ?? {};
      const signRows = Array.isArray((data as Record<string, unknown>).signRows) ? ((data as Record<string, unknown>).signRows as Array<Record<string, unknown>>) : [];
      const miscRows = Array.isArray((data as Record<string, unknown>).miscRows) ? ((data as Record<string, unknown>).miscRows as Array<Record<string, unknown>>) : [];
      const qty = (v: unknown) => parseFloat(String(v ?? "")) || 0;
      const specIssues: string[] = [];
      const signMissingQty = signRows.filter(r => r.signNumber && qty(r.quantity) <= 0).length;
      const signNotFound   = signRows.filter(r => r.lookupStatus === "not_found").length;
      const signNoImage    = signRows.filter(r => r.signNumber && !r.imageUrl).length;
      const customMissingDims = miscRows.filter(r =>
        (r.customWidth !== undefined || r.customHeight !== undefined || /מידה/.test(String(r.description ?? ""))) &&
        !(String(r.customWidth ?? "").trim() && String(r.customHeight ?? "").trim()),
      ).length;
      const miscMissingQty = miscRows.filter(r => r.description && qty(r.quantity) <= 0).length;
      if (signMissingQty) specIssues.push(`${signMissingQty} שלטים ללא כמות`);
      if (signNotFound)   specIssues.push(`${signNotFound} שלטים לא נמצאו בקטלוג`);
      if (signNoImage)    specIssues.push(`${signNoImage} שלטים ללא תמונת עיצוב`);
      if (customMissingDims) specIssues.push(`${customMissingDims} שלטים לפי מידה ללא מידות`);
      if (miscMissingQty) specIssues.push(`${miscMissingQty} פריטים ללא כמות`);
      if (specIssues.length > 0) {
        const k = dedupeKey("design_spec_incomplete", "work_order", order.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "design_spec_incomplete",
          entityType: "work_order",
          entityId: order.id,
          severity: "warn",
          title: `הזמנה ${order.order_number} — מפרט עיצוב/ייצור חסר`,
          description: `${specIssues.join(" · ")} | לקוח: ${order.customer}`,
          detectedFromData: { orderNumber: order.order_number, specIssues },
          recommendedResolution: "השלם כמויות / מידות / קוד שלט / תמונת עיצוב לפני העברה לייצור",
        }, dedupeMap, result);
        if (!graphicsTaskReason) graphicsTaskReason = `מפרט עיצוב/ייצור חסר: ${specIssues.join(" · ")}`;
      }

      // ── Consolidated graphics human-review task (safe metadata; no business mutation) ──
      // One stable task per order with a genuine graphics blocker — SLA-critical,
      // pending design approval, or incomplete design/production spec (above) →
      // re-scans UPDATE the same task (no spam). Auto-assigned to
      // graphics-production-agent. Reflective-type / installation-notes / explicit
      // production_status are not first-class fields yet (see report — minimal
      // schema proposal); not inferred/faked here.
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
