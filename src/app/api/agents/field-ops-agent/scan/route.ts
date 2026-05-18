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
import type { DbDiaryRow } from "@/lib/agents/types";

const AGENT_ID   = "field-ops-agent";
const AGENT_NAME = "מנהל ביצוע שטח";

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

    // Load submitted and draft diaries (draft diaries may need attention too)
    const { data: rawDiaries, error: diaryErr } = await db
      .from("work_diaries")
      .select("id,diary_number,status,customer_name,site_name,execution_date,submitted_at,order_id,approval_status,approved_at,created_at,updated_at,data")
      .in("status", ["submitted", "draft"])
      .order("execution_date", { ascending: false })
      .limit(500);

    if (diaryErr) throw new Error(diaryErr.message);
    const diaries = (rawDiaries ?? []) as DbDiaryRow[];
    result.entitiesScanned = diaries.length;

    const dedupeMap = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const taskDedupeMap = await loadAgentTaskDedupeMap(db, AGENT_ID);
    const activeDedupeKeys = new Set<string>();
    const nowMs = Date.now();

    for (const diary of diaries) {
      const d = extractDiaryData(diary);
      const isSubmitted = diary.status === "submitted";
      const dId = diary.id;
      const dLabel = diary.diary_number || dId.slice(0, 8);

      // ── Missing crew ────────────────────────────────────────────────────
      const activeCrew = d.crewMembers.filter(m => m.trim());
      if (!d.crewLeaderName.trim() && activeCrew.length === 0 && isSubmitted) {
        const k = dedupeKey("diary_missing_crew", "work_diary", dId);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "diary_missing_crew",
          entityType: "work_diary",
          entityId: dId,
          severity: "warn",
          title: `יומן ${dLabel} — פרטי צוות חסרים`,
          description: `לקוח: ${diary.customer_name} | תאריך: ${diary.execution_date}`,
          detectedFromData: { diaryNumber: dLabel, customerName: diary.customer_name, executionDate: diary.execution_date },
          recommendedResolution: "עדכן שם ראש צוות ואנשי צוות ביומן השטח",
        }, dedupeMap, result);
      }

      // ── Missing vehicle ─────────────────────────────────────────────────
      if (!d.vehicleNumber.trim() && isSubmitted) {
        const k = dedupeKey("diary_missing_vehicle", "work_diary", dId);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "diary_missing_vehicle",
          entityType: "work_diary",
          entityId: dId,
          severity: "info",
          title: `יומן ${dLabel} — מספר רכב חסר`,
          description: `לקוח: ${diary.customer_name}`,
          detectedFromData: { diaryNumber: dLabel, executionDate: diary.execution_date },
          recommendedResolution: "הוסף מספר רכב ליומן לחישוב עלות מדויק",
        }, dedupeMap, result);
      }

      // ── Missing customer signature ───────────────────────────────────────
      if (!d.customerSignature && isSubmitted) {
        const k = dedupeKey("diary_missing_signature", "work_diary", dId);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "diary_missing_signature",
          entityType: "work_diary",
          entityId: dId,
          severity: "warn",
          title: `יומן ${dLabel} — חתימת לקוח חסרה`,
          description: `לקוח: ${diary.customer_name} | תאריך: ${diary.execution_date}`,
          detectedFromData: { diaryNumber: dLabel, customerName: diary.customer_name },
          recommendedResolution: "השג חתימת לקוח לאימות ביצוע העבודה",
        }, dedupeMap, result);
      }

      // ── Missing execution time ──────────────────────────────────────────
      if ((!d.startTime || !d.endTime) && isSubmitted) {
        const k = dedupeKey("diary_missing_time", "work_diary", dId);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "diary_missing_time",
          entityType: "work_diary",
          entityId: dId,
          severity: "info",
          title: `יומן ${dLabel} — שעות ביצוע חסרות`,
          description: `חסר שעת התחלה ו/או סיום. לקוח: ${diary.customer_name}`,
          detectedFromData: { diaryNumber: dLabel, startTime: d.startTime, endTime: d.endTime },
          recommendedResolution: "הוסף שעת התחלה וסיום לחישוב עלות עבודה",
        }, dedupeMap, result);
      }

      // ── No billing decision on submitted diary ──────────────────────────
      if (isSubmitted && d.isBillable === undefined && diary.approval_status === "approved") {
        const k = dedupeKey("diary_missing_billing_decision", "work_diary", dId);
        activeDedupeKeys.add(k);
        await upsertTask(db, AGENT_ID, {
          category: "diary_missing_billing_decision",
          entityType: "work_diary",
          entityId: dId,
          title: `קבע החלטת חיוב — יומן ${dLabel}`,
          description: `יומן מאושר ללא החלטת חיוב. לקוח: ${diary.customer_name}`,
          priority: "normal",
          recommendedAction: "סמן יומן כלחיוב (isBillable=true) והזן סכום חיוב",
        }, taskDedupeMap, result);
      }

      // ── Submitted pending approval > 48h ───────────────────────────────
      if (isSubmitted && diary.approval_status === "pending" && diary.submitted_at) {
        const hrs = hoursSince(diary.submitted_at, nowMs);
        if (hrs >= 48) {
          const severity = hrs >= 72 ? "error" : "warn";
          const k = dedupeKey("diary_approval_overdue", "work_diary", dId);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "diary_approval_overdue",
            entityType: "work_diary",
            entityId: dId,
            severity,
            title: `יומן ${dLabel} ממתין לאישור — ${Math.round(hrs)} שעות`,
            description: `לקוח: ${diary.customer_name} | תאריך ביצוע: ${diary.execution_date}`,
            detectedFromData: { diaryNumber: dLabel, hoursWaiting: Math.round(hrs), submittedAt: diary.submitted_at },
            recommendedResolution: "אשר או דחה את יומן השטח",
          }, dedupeMap, result);
        }
      }

      // ── Draft diary older than 3 days — not submitted ──────────────────
      if (diary.status === "draft") {
        const hrs = hoursSince(diary.created_at, nowMs);
        if (hrs >= 72 && diary.execution_date) {
          const excDate = diary.execution_date;
          const todayStr = new Date().toISOString().slice(0, 10);
          if (excDate < todayStr) {
            const k = dedupeKey("diary_draft_overdue", "work_diary", dId);
            activeDedupeKeys.add(k);
            await upsertTask(db, AGENT_ID, {
              category: "diary_draft_overdue",
              entityType: "work_diary",
              entityId: dId,
              title: `יומן ${dLabel} — טיוטה ישנה לא הוגשה`,
              description: `תאריך ביצוע: ${excDate} | לקוח: ${diary.customer_name}`,
              priority: "high",
              recommendedAction: "השלם והגש את יומן השטח או בטל אותו",
            }, taskDedupeMap, result);
          }
        }
      }
    }

    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    const summary = `סריקת שטח: ${result.entitiesScanned} יומנים | ${result.exceptionsCreated} חריגות | ${result.tasksCreated} משימות | ${result.exceptionsResolved} נפתרו`;
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
