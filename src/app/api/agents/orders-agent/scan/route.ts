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

const AGENT_ID   = "orders-agent";
const AGENT_NAME = "מנהל הזמנות";

// Thresholds for draft orders awaiting submission.
// Calibration: adjust once owner reviews first scan results.
const DRAFT_WARN_H  = 48;
const DRAFT_ERROR_H = 96;

// Threshold for orders stuck in graphics_pending without graphics being sent.
// 4h grace period accounts for normal same-day order creation → dispatch flow.
const GRAPHICS_NOT_SENT_WARN_H  = 4;
const GRAPHICS_NOT_SENT_ERROR_H = 24;

// Threshold for orders with customer_approval_status = 'pending' that have
// been idle for an extended period. These are standby orders awaiting customer
// confirmation of execution timing. Different from the immediate
// pending_approval_blocking exception (coordination-qa-agent) — this flags
// long-running standby that may have been forgotten.
const STANDBY_WARN_H  = 720;  // 30 days
const STANDBY_ERROR_H = 2160; // 90 days

// External / bot / Jarvis order submissions land as pending_review drafts in
// team_bot_order_drafts and must be reviewed by staff before becoming real orders.
// Flag drafts left unreviewed so customer-facing intake never silently disappears.
const EXTERNAL_DRAFT_WARN_H  = 24;
const EXTERNAL_DRAFT_ERROR_H = 72;

const EXTERNAL_SOURCE_LABEL: Record<string, string> = {
  external_web_form: "טופס חיצוני",
  telegram_orders_bot: "בוט הזמנות",
  jarvis: "הזמנת מנהל",
};

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

    // Load all non-final orders. Includes: draft, all active statuses.
    // completed and cancelled are excluded — no intake checks needed there.
    const ordersRes = await db
      .from("work_orders")
      .select("id,order_number,status,priority,customer,city,order_date,contact_person,order_type,customer_approval_status,graphics_sent_at,created_at,updated_at,required_date")
      .not("status", "in", '("completed","cancelled")');

    if (ordersRes.error) throw new Error(ordersRes.error.message);
    const orders = (ordersRes.data ?? []) as (DbOrderRow & { contact_person: string | null })[];
    result.entitiesScanned = orders.length;

    const dedupeMap = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const taskDedupeMap = await loadAgentTaskDedupeMap(db, AGENT_ID);
    const nowMs = Date.now();
    const activeDedupeKeys = new Set<string>();

    for (const order of orders) {
      const urgent = order.priority === "urgent";
      const hoursFactor = urgent ? 0.5 : 1;

      // ── Draft order not submitted ────────────────────────────────────────
      // Orders in 'draft' status have been created but not yet submitted
      // to the graphics/production pipeline. Aging draft orders risk being
      // forgotten before reaching a customer.
      if (order.status === "draft") {
        const hrs = hoursSince(order.created_at, nowMs);
        const warnThreshold  = DRAFT_WARN_H  * hoursFactor;
        const errorThreshold = DRAFT_ERROR_H * hoursFactor;
        if (hrs >= warnThreshold) {
          const severity = hrs >= errorThreshold ? "error" : "warn";
          const k = dedupeKey("draft_overdue", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "draft_overdue",
            entityType: "work_order",
            entityId: order.id,
            severity,
            title: `הזמנה ${order.order_number} תקועה בטיוטה — ${Math.round(hrs)} שעות`,
            description: `לקוח: ${order.customer || "(ללא שם)"} | ממתינה לסיום הקלטה והגשה לגרפיקה`,
            detectedFromData: {
              orderNumber: order.order_number,
              hoursDraft: Math.round(hrs),
              customer: order.customer,
            },
            recommendedResolution: "השלם את הקלטת ההזמנה והגש לגרפיקה, או בטל אם אינה רלוונטית",
          }, dedupeMap, result);
        }
      }

      // ── Incomplete required fields ───────────────────────────────────────
      // Checks for orders in intake stages (draft or graphics_pending) that
      // are missing mandatory data. An order missing customer name, city, or
      // date cannot be processed or billed correctly downstream.
      // Skipped check: order_type — column has NOT NULL DEFAULT 'field_work',
      // so it is always populated; a missing-type check would never fire.
      if (order.status === "draft" || order.status === "graphics_pending") {
        const missingFields: string[] = [];
        if (!order.customer || order.customer.trim() === "") missingFields.push("שם לקוח");
        if (!order.city    || order.city.trim()    === "") missingFields.push("עיר");
        if (!order.order_date || order.order_date.trim() === "") missingFields.push("תאריך הזמנה");

        if (missingFields.length > 0) {
          const k = dedupeKey("incomplete_order_fields", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "incomplete_order_fields",
            entityType: "work_order",
            entityId: order.id,
            severity: "warn",
            title: `הזמנה ${order.order_number} — שדות חובה חסרים`,
            description: `חסר: ${missingFields.join(", ")} | לקוח: ${order.customer || "(ללא שם)"}`,
            detectedFromData: {
              orderNumber: order.order_number,
              missingFields,
              status: order.status,
            },
            recommendedResolution: `השלם את השדות החסרים: ${missingFields.join(", ")}`,
          }, dedupeMap, result);

          // Actionable human-review task (safe metadata; no business mutation).
          // Stable title → re-scans update the same task (no dup spam). Auto-assigned
          // to orders-agent by upsertTask's default owner.
          await upsertTask(db, AGENT_ID, {
            category: "incomplete_order_fields",
            entityType: "work_order",
            entityId: order.id,
            title: `הזמנה ${order.order_number} — השלמת שדות חובה`,
            description: `חסר: ${missingFields.join(", ")} | לקוח: ${order.customer || "(ללא שם)"} | שלב: ${order.status}`,
            priority: "high",
            recommendedAction: `השלם את השדות החסרים (${missingFields.join(", ")}) בדף ההזמנות, או בטל אם אינה רלוונטית`,
          }, taskDedupeMap, result);
        }
      }

      // ── Graphics not sent ────────────────────────────────────────────────
      // An order in graphics_pending with no graphics_sent_at means the order
      // was created and placed in the graphics queue but the graphics team was
      // never formally notified. The SLA clock may already be running from
      // created_at (per stageEntryTime fallback), but this exception specifically
      // flags the missing dispatch action.
      if (order.status === "graphics_pending" && !order.graphics_sent_at) {
        const hrs = hoursSince(order.created_at, nowMs);
        const warnThreshold  = GRAPHICS_NOT_SENT_WARN_H  * hoursFactor;
        const errorThreshold = GRAPHICS_NOT_SENT_ERROR_H * hoursFactor;
        if (hrs >= warnThreshold) {
          const severity = hrs >= errorThreshold ? "error" : "warn";
          const k = dedupeKey("graphics_not_sent", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "graphics_not_sent",
            entityType: "work_order",
            entityId: order.id,
            severity,
            title: `הזמנה ${order.order_number} — גרפיקה לא נשלחה (${Math.round(hrs)} שעות)`,
            description: `לקוח: ${order.customer} | ההזמנה ב-graphics_pending אך לא נשלחה לגרפיקה`,
            detectedFromData: {
              orderNumber: order.order_number,
              hoursWaiting: Math.round(hrs),
              graphicsSentAt: null,
              customer: order.customer,
            },
            recommendedResolution: "שלח את ההזמנה לגרפיקה דרך מסך ניהול הגרפיקה",
          }, dedupeMap, result);
        }
      }

      // ── Long-running standby orders ──────────────────────────────────────
      // Orders where customer_approval_status = 'pending' that have been
      // sitting idle for >30 days. These are customer-standby orders awaiting
      // execution timing confirmation. The coordination-qa-agent flags the
      // immediate dispatch blocker; this exception flags orders that may have
      // been forgotten over a longer period.
      // Note: this check applies to ALL non-final statuses — not just
      // ready_installation — so it catches standby orders earlier in pipeline.
      if (order.customer_approval_status === "pending") {
        const hrs = hoursSince(order.updated_at, nowMs);
        if (hrs >= STANDBY_WARN_H) {
          const severity = hrs >= STANDBY_ERROR_H ? "error" : "warn";
          const k = dedupeKey("standby_order_aged", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "standby_order_aged",
            entityType: "work_order",
            entityId: order.id,
            severity,
            title: `הזמנה ${order.order_number} — ממתינה לאישור לקוח ${Math.round(hrs / 24)} ימים`,
            description: `לקוח: ${order.customer} | שלב: ${order.status} | ממתינה לאישור ביצוע מזה ${Math.round(hrs / 24)} ימים`,
            detectedFromData: {
              orderNumber: order.order_number,
              daysWaiting: Math.round(hrs / 24),
              status: order.status,
              customer: order.customer,
            },
            recommendedResolution: "צור קשר עם הלקוח לאישור מועד ביצוע, או סמן כבוטלת אם אינה רלוונטית",
          }, dedupeMap, result);
        }
      }

      // ── Required date overdue ────────────────────────────────────────────
      // Orders with a customer-committed required_date that has passed without
      // the order reaching completed or cancelled status.
      if (order.required_date) {
        const daysOverdue = (nowMs - new Date(order.required_date + "T00:00:00Z").getTime()) / 86_400_000;
        if (daysOverdue >= 0) {
          const severity = daysOverdue >= 7 ? "error" : "warn";
          const k = dedupeKey("required_date_overdue", "work_order", order.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "required_date_overdue",
            entityType: "work_order",
            entityId: order.id,
            severity,
            title: `הזמנה ${order.order_number} — עברה את תאריך הספקה (${Math.round(daysOverdue)} ימים)`,
            description: `לקוח: ${order.customer} | תאריך נדרש: ${order.required_date} | שלב נוכחי: ${order.status}`,
            detectedFromData: {
              orderNumber: order.order_number,
              customer: order.customer,
              requiredDate: order.required_date,
              currentStatus: order.status,
              daysOverdue: Math.round(daysOverdue),
            },
            recommendedResolution: "תאם עם הלקוח תאריך חדש ועדכן את required_date, או סמן כבוטלת",
          }, dedupeMap, result);
        }
      }
    }

    // ── External / bot / Jarvis order drafts awaiting review ─────────────────
    // These never auto-become work_orders; staff must promote them. Flag aged
    // pending_review drafts so external intake is not forgotten / does not bypass
    // the approval queue by sitting unseen.
    const draftsRes = await db
      .from("team_bot_order_drafts")
      .select("id,status,source,customer,city,cart,created_at")
      .eq("status", "pending_review");
    if (!draftsRes.error) {
      const drafts = draftsRes.data ?? [];
      result.entitiesScanned += drafts.length;
      for (const d of drafts) {
        const hrs = hoursSince(d.created_at as string, nowMs);
        if (hrs < EXTERNAL_DRAFT_WARN_H) continue;
        const severity = hrs >= EXTERNAL_DRAFT_ERROR_H ? "error" : "warn";
        const id = String(d.id);
        const k = dedupeKey("external_order_review_aged", "team_bot_order_draft", id);
        activeDedupeKeys.add(k);
        const srcLabel = EXTERNAL_SOURCE_LABEL[String(d.source)] ?? String(d.source ?? "מקור לא ידוע");
        const itemCount = Array.isArray(d.cart) ? d.cart.length : 0;
        await upsertException(db, AGENT_ID, {
          category: "external_order_review_aged",
          entityType: "team_bot_order_draft",
          entityId: id,
          severity,
          title: `בקשת הזמנה (${srcLabel}) ממתינה לאישור ${Math.round(hrs)} שעות`,
          description: `לקוח: ${d.customer || "(ללא שם)"} | עיר: ${d.city || "—"} | פריטים: ${itemCount} | טרם נסקרה ע״י צוות`,
          detectedFromData: { draftId: id, source: d.source, customer: d.customer, city: d.city, itemCount, hoursWaiting: Math.round(hrs) },
          recommendedResolution: "פתח את 'הזמנות מהבוט' וקדם/דחה את הבקשה",
        }, dedupeMap, result);

        // Actionable human-review task — promote/reject the external intake.
        // Stable title (per draft id + source) → no dup spam. Auto-assigned to orders-agent.
        await upsertTask(db, AGENT_ID, {
          category: "external_order_review_aged",
          entityType: "team_bot_order_draft",
          entityId: id,
          title: `אישור בקשת הזמנה חיצונית — ${srcLabel}`,
          description: `לקוח: ${d.customer || "(ללא שם)"} | עיר: ${d.city || "—"} | פריטים: ${itemCount} | טרם נסקרה`,
          priority: severity === "error" ? "critical" : "high",
          recommendedAction: "פתח 'הזמנות מהבוט' וקדם/דחה את הבקשה",
        }, taskDedupeMap, result);
      }
    }

    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    const summary = `סריקה הושלמה: ${result.entitiesScanned} ישויות | ${result.exceptionsCreated} חריגות חדשות | ${result.exceptionsUpdated} עודכנו | ${result.exceptionsResolved} נפתרו | ${result.tasksCreated} משימות נוצרו`;
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
