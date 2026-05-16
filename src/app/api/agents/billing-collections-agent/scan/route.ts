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
import { extractDiaryData } from "@/lib/agents/types";
import type { DbOrderRow, DbDiaryRow } from "@/lib/agents/types";

const AGENT_ID   = "billing-collections-agent";
const AGENT_NAME = "מנהל גביה וחשבונות";

// Thresholds for billing delays
const BILLING_WARN_HOURS    = 72;   // 3 days → warn
const BILLING_CRITICAL_HOURS = 168; // 7 days → critical

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const start = Date.now();
  const result = emptyScanResult(AGENT_ID, AGENT_NAME);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await updateAgentRunStatus(db, AGENT_ID, "active");

    const [ordersRes, diariesRes, consumptionsRes] = await Promise.all([
      db.from("work_orders")
        .select("id,order_number,status,priority,customer,city,order_date,created_at,updated_at,accounting_status,invoiced_at,billed_amount,data,warehouse_required")
        .eq("status", "completed"),
      db.from("work_diaries")
        .select("id,diary_number,status,customer_name,site_name,execution_date,submitted_at,order_id,approval_status,approved_at,created_at,updated_at,data")
        .in("status", ["submitted"])
        .eq("approval_status", "approved"),
      db.from("inventory_consumptions")
        .select("order_id,status")
        .in("status", ["consumed", "pending_review"]),
    ]);

    if (ordersRes.error) throw new Error(ordersRes.error.message);
    if (diariesRes.error) throw new Error(diariesRes.error.message);

    const orders   = (ordersRes.data ?? []) as DbOrderRow[];
    const diaries  = (diariesRes.data ?? []) as DbDiaryRow[];
    result.entitiesScanned = orders.length + diaries.length;

    // Build sets for fast lookup
    const reconciledOrderIds = new Set(
      (consumptionsRes.data ?? []).map((c: { order_id: string }) => c.order_id).filter(Boolean)
    );
    const approvedDiaryOrderIds = new Set(
      diaries.map(d => d.order_id).filter(Boolean)
    );

    const dedupeMap = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const taskDedupeMap = await loadAgentTaskDedupeMap(db, AGENT_ID);
    const activeDedupeKeys = new Set<string>();
    const nowMs = Date.now();

    // ── Scan completed orders ─────────────────────────────────────────────
    for (const order of orders) {
      const notInvoiced = !order.invoiced_at;
      const acctStatus  = order.accounting_status ?? "pending";

      // approved or invoiced/paid — no billing exceptions needed
      if (!notInvoiced || acctStatus === "approved" || acctStatus === "invoiced" ||
          acctStatus === "paid" || acctStatus === "partial") continue;

      const hrs = hoursSince(order.updated_at, nowMs);

      if (acctStatus === "pending" || !order.accounting_status) {
        // Stage 1: needs billing verification (blocker check not yet done)
        if (hrs >= BILLING_WARN_HOURS) {
          const severity = hrs >= BILLING_CRITICAL_HOURS ? "critical" : "warn";
          const category = "order_pending_billing_verification";
          const k = dedupeKey(category, "work_order", order.id);
          activeDedupeKeys.add(k);

          await upsertException(db, AGENT_ID, {
            category,
            entityType: "work_order",
            entityId: order.id,
            severity,
            title: `הזמנה ${order.order_number} ממתינה לאימות מוכנות לחיוב — ${Math.round(hrs / 24)} ימים`,
            description: `לקוח: ${order.customer} | הושלמה תפעולית לפני ${Math.round(hrs)} שעות. נדרש אימות בהנה״ח.`,
            detectedFromData: {
              orderNumber: order.order_number,
              customer: order.customer,
              completedAt: order.updated_at,
              hoursUnbilled: Math.round(hrs),
              accountingStatus: acctStatus,
            },
            recommendedResolution: `פתח את הזמנה ${order.order_number} בהנהלת חשבונות ← ממתין לחיוב, ולחץ "בדוק מוכנות לחיוב"`,
          }, dedupeMap, result);

          await upsertTask(db, AGENT_ID, {
            category,
            entityType: "work_order",
            entityId: order.id,
            title: `אמת מוכנות לחיוב — הזמנה ${order.order_number}`,
            description: `לקוח: ${order.customer} | ${Math.round(hrs / 24)} ימים ממתינה לאימות`,
            priority: severity === "critical" ? "critical" : "high",
            recommendedAction: "פתח הנה״ח ← ממתין לחיוב ולחץ 'בדוק מוכנות לחיוב'",
            requiresApproval: false,
          }, taskDedupeMap, result);
        }
      } else if (acctStatus === "verified") {
        // Stage 2: verified but not yet approved for billing
        const VERIFIED_WARN_H = 48;
        const VERIFIED_CRIT_H = 120;
        if (hrs >= VERIFIED_WARN_H) {
          const severity = hrs >= VERIFIED_CRIT_H ? "critical" : "warn";
          const category = "order_awaiting_billing_approval";
          const k = dedupeKey(category, "work_order", order.id);
          activeDedupeKeys.add(k);

          await upsertException(db, AGENT_ID, {
            category,
            entityType: "work_order",
            entityId: order.id,
            severity,
            title: `הזמנה ${order.order_number} מאומתת — ממתינה לאישור חיוב (${Math.round(hrs / 24)} ימים)`,
            description: `לקוח: ${order.customer} | עברה אימות אך טרם אושרה לחיוב`,
            detectedFromData: {
              orderNumber: order.order_number,
              customer: order.customer,
              verifiedAt: order.updated_at,
              hoursWaiting: Math.round(hrs),
            },
            recommendedResolution: `פתח הנה״ח ← ממתין לחיוב, מצא את ההזמנה בטבלה "מאומת ומוכן לחיוב" ולחץ "אשר לחיוב"`,
          }, dedupeMap, result);
        }
      }

      // ── Inventory reconciliation blocker ────────────────────────────────
      // Flag warehouse/inventory orders that have an approved diary but no consumption record.
      const orderData = order.data as Record<string, unknown> | null ?? {};
      const accessoryRows = (orderData.accessoryRows ?? []) as Array<{ catalogItemId?: string; quantity?: string }>;
      const miscRows      = (orderData.miscRows ?? [])      as Array<{ catalogItemId?: string; quantity?: string }>;
      const allRows = [...accessoryRows, ...miscRows];
      const hasMappedItems = allRows.some(r => r.catalogItemId && (parseFloat(r.quantity ?? "0") || 0) > 0);
      const inventoryRequired = (order.warehouse_required as boolean | null) || hasMappedItems;

      if (inventoryRequired && hasMappedItems && !reconciledOrderIds.has(order.id) && approvedDiaryOrderIds.has(order.id)) {
        const category = "inventory_reconciliation_missing";
        const k = dedupeKey(category, "work_order", order.id);
        activeDedupeKeys.add(k);

        await upsertException(db, AGENT_ID, {
          category,
          entityType: "work_order",
          entityId: order.id,
          severity: "warn",
          title: `הזמנה ${order.order_number} — נדרשת התאמת מלאי לפני חיוב`,
          description: `לקוח: ${order.customer} | יומן שטח מאושר, אך טרם בוצעה התאמת מלאי`,
          detectedFromData: { orderNumber: order.order_number, customer: order.customer, accountingStatus: acctStatus },
          recommendedResolution: "בצע התאמת מלאי בלשונית מחסן ← הזמנות → לחץ 'בצע התאמה'",
        }, dedupeMap, result);

        await upsertTask(db, AGENT_ID, {
          category,
          entityType: "work_order",
          entityId: order.id,
          title: `התאמת מלאי — הזמנה ${order.order_number}`,
          description: `לקוח: ${order.customer} | נדרש לפני אישור חיוב`,
          priority: "high",
          recommendedAction: "מחסן ← הזמנות → 'בצע התאמה'",
          requiresApproval: false,
        }, taskDedupeMap, result);
      }
    }

    // ── Scan approved diaries not linked to billing ───────────────────────
    for (const diary of diaries) {
      const d = extractDiaryData(diary);
      const dLabel = diary.diary_number || diary.id.slice(0, 8);

      // Diary approved but no billed amount and isBillable not explicitly false
      if (d.isBillable !== false && d.billedAmount === 0) {
        const k = dedupeKey("diary_unbilled", "work_diary", diary.id);
        activeDedupeKeys.add(k);

        await upsertException(db, AGENT_ID, {
          category: "diary_unbilled",
          entityType: "work_diary",
          entityId: diary.id,
          severity: "warn",
          title: `יומן ${dLabel} מאושר — סכום חיוב לא הוזן`,
          description: `לקוח: ${diary.customer_name} | תאריך: ${diary.execution_date}`,
          detectedFromData: {
            diaryNumber: dLabel,
            customerName: diary.customer_name,
            executionDate: diary.execution_date,
            orderId: diary.order_id,
            isBillable: d.isBillable,
          },
          recommendedResolution: "הזן סכום חיוב ביומן האושר לפני סגירת החודש",
        }, dedupeMap, result);

        await upsertTask(db, AGENT_ID, {
          category: "diary_unbilled",
          entityType: "work_diary",
          entityId: diary.id,
          title: `הזן סכום חיוב — יומן ${dLabel}`,
          description: `לקוח: ${diary.customer_name} | תאריך ביצוע: ${diary.execution_date}`,
          priority: "normal",
          recommendedAction: "עדכן שדה billedAmount ביומן המאושר",
        }, taskDedupeMap, result);
      }
    }

    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    const summary = `סריקת חיוב: ${result.entitiesScanned} רשומות | ${result.exceptionsCreated} חריגות | ${result.tasksCreated} משימות | ${result.exceptionsResolved} נפתרו`;
    await writeAgentActivity(db, AGENT_ID, "detection", summary, {
      entitiesScanned: result.entitiesScanned,
      exceptionsCreated: result.exceptionsCreated,
      tasksCreated: result.tasksCreated,
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
