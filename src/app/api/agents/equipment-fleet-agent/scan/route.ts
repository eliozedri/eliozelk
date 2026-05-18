import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  loadAgentExceptionDedupeMap,
  upsertException,
  autoResolveStaleExceptions,
  writeAgentActivity,
  updateAgentRunStatus,
  logAgentAction,
  verifyMasterAuth,
  dedupeKey,
} from "@/lib/agents/scan-utils";
import { emptyScanResult } from "@/lib/agents/types";

const AGENT_ID   = "equipment-fleet-agent";
const AGENT_NAME = "מנהל ציוד ורכבים";

// Inspection/insurance warning thresholds (days before expiry).
// Calibration: adjust once owner reviews first scan results.
const INSPECTION_WARN_DAYS  = 30;
const INSPECTION_ERROR_DAYS = 14;

const INSURANCE_WARN_DAYS  = 30;
const INSURANCE_ERROR_DAYS = 14;

const MAINTENANCE_WARN_DAYS = 14;

// Thresholds for equipment stuck in 'in_repair' status.
const REPAIR_STUCK_WARN_DAYS  = 30;
const REPAIR_STUCK_ERROR_DAYS = 60;

// Categories that require a license/registration number.
const LICENSED_CATEGORIES = new Set(["fleet", "trailers", "arrow_carts", "heavy_equipment", "forklifts"]);

// Categories that require an insurance date.
const INSURED_CATEGORIES = new Set(["fleet", "trailers", "arrow_carts", "heavy_equipment", "forklifts"]);

interface DbEquipmentRow {
  id: string;
  display_name: string;
  category_key: string;
  status: string;
  identification_confidence: string;
  license_number: string | null;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  next_inspection_date: string | null;
  next_insurance_date: string | null;
  updated_at: string;
}

function daysDiff(dateStr: string | null, nowMs: number): number | null {
  if (!dateStr) return null;
  // next_inspection_date and similar are DATE columns: "YYYY-MM-DD"
  const ms = new Date(dateStr + "T00:00:00Z").getTime();
  return (ms - nowMs) / 86_400_000;
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

    const equipmentRes = await db
      .from("equipment")
      .select("id,display_name,category_key,status,identification_confidence,license_number,last_maintenance_date,next_maintenance_date,next_inspection_date,next_insurance_date,updated_at")
      .eq("is_active", true);

    if (equipmentRes.error) throw new Error(equipmentRes.error.message);
    const items = (equipmentRes.data ?? []) as DbEquipmentRow[];
    result.entitiesScanned = items.length;

    const dedupeMap = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const nowMs = Date.now();
    const activeDedupeKeys = new Set<string>();

    for (const item of items) {
      const name = item.display_name || item.id;

      // ── Partial / unidentified equipment ────────────────────────────────
      // Equipment records that are not fully confirmed represent data quality
      // risks. These items cannot be safely assigned to jobs or scheduled
      // for maintenance without complete identification.
      if (item.identification_confidence === "partial" || item.identification_confidence === "unidentified") {
        const k = dedupeKey("incomplete_identification", "equipment", item.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "incomplete_identification",
          entityType: "equipment",
          entityId: item.id,
          severity: item.identification_confidence === "unidentified" ? "error" : "warn",
          title: `ציוד: ${name} — זיהוי ${item.identification_confidence === "unidentified" ? "חסר לחלוטין" : "חלקי"}`,
          description: `קטגוריה: ${item.category_key} | נדרש זיהוי מלא לפני שיבוץ לעבודות`,
          detectedFromData: {
            equipmentId: item.id,
            displayName: name,
            categoryKey: item.category_key,
            identificationConfidence: item.identification_confidence,
          },
          recommendedResolution: "השלם את פרטי הזיהוי: מספר רישוי / שלדה / סידורי, יצרן, דגם",
        }, dedupeMap, result);
      }

      // ── Missing license number for licensed categories ───────────────────
      // Vehicles, trailers, and heavy equipment require a license/registration
      // number for road use and regulatory compliance.
      if (LICENSED_CATEGORIES.has(item.category_key) && item.status === "active" && !item.license_number) {
        const k = dedupeKey("missing_license_number", "equipment", item.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "missing_license_number",
          entityType: "equipment",
          entityId: item.id,
          severity: "warn",
          title: `ציוד: ${name} — מספר רישוי חסר`,
          description: `קטגוריה: ${item.category_key} | ציוד פעיל בקטגוריה מורשה ללא מספר רישוי`,
          detectedFromData: {
            equipmentId: item.id,
            displayName: name,
            categoryKey: item.category_key,
          },
          recommendedResolution: "הזן את מספר הרישוי / הרישום עבור הציוד",
        }, dedupeMap, result);
      }

      // ── Inspection date: expired or near-expiring ────────────────────────
      const inspDays = daysDiff(item.next_inspection_date, nowMs);

      if (item.next_inspection_date === null && item.status === "active" &&
          (item.category_key === "fleet" || item.category_key === "heavy_equipment" ||
           item.category_key === "trailers" || item.category_key === "forklifts")) {
        // Active fleet/heavy equipment with no inspection date on record
        const k = dedupeKey("missing_inspection_date", "equipment", item.id);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "missing_inspection_date",
          entityType: "equipment",
          entityId: item.id,
          severity: "warn",
          title: `ציוד: ${name} — תאריך טסט/בדיקה חסר`,
          description: `קטגוריה: ${item.category_key} | ציוד פעיל ללא רשומת תאריך טסט תקף`,
          detectedFromData: { equipmentId: item.id, displayName: name, categoryKey: item.category_key },
          recommendedResolution: "הזן את תאריך הטסט הבא עבור הציוד",
        }, dedupeMap, result);
      } else if (inspDays !== null) {
        if (inspDays <= 0) {
          // Expired
          const k = dedupeKey("inspection_expired", "equipment", item.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "inspection_expired",
            entityType: "equipment",
            entityId: item.id,
            severity: "critical",
            title: `ציוד: ${name} — טסט/בדיקה פגה תוקף`,
            description: `תאריך טסט: ${item.next_inspection_date} | פג לפני ${Math.abs(Math.round(inspDays))} ימים | אסור לשיגור`,
            detectedFromData: {
              equipmentId: item.id,
              displayName: name,
              nextInspectionDate: item.next_inspection_date,
              daysExpired: Math.abs(Math.round(inspDays)),
            },
            recommendedResolution: "הסר ציוד משיגור מיידי. תאם טסט חדש ועדכן את התאריך לאחר מכן",
          }, dedupeMap, result);
        } else if (inspDays <= INSPECTION_ERROR_DAYS) {
          const k = dedupeKey("inspection_due_soon", "equipment", item.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "inspection_due_soon",
            entityType: "equipment",
            entityId: item.id,
            severity: "error",
            title: `ציוד: ${name} — טסט פג בעוד ${Math.round(inspDays)} ימים`,
            description: `תאריך טסט: ${item.next_inspection_date} | נדרש טסט דחוף`,
            detectedFromData: {
              equipmentId: item.id,
              displayName: name,
              nextInspectionDate: item.next_inspection_date,
              daysRemaining: Math.round(inspDays),
            },
            recommendedResolution: "תאם טסט בדחיפות לפני תאריך הפקיעה",
          }, dedupeMap, result);
        } else if (inspDays <= INSPECTION_WARN_DAYS) {
          const k = dedupeKey("inspection_due_soon", "equipment", item.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "inspection_due_soon",
            entityType: "equipment",
            entityId: item.id,
            severity: "warn",
            title: `ציוד: ${name} — טסט עומד לפוג בעוד ${Math.round(inspDays)} ימים`,
            description: `תאריך טסט: ${item.next_inspection_date} | תזמן טסט בקרוב`,
            detectedFromData: {
              equipmentId: item.id,
              displayName: name,
              nextInspectionDate: item.next_inspection_date,
              daysRemaining: Math.round(inspDays),
            },
            recommendedResolution: "תאם טסט לפני תאריך הפקיעה",
          }, dedupeMap, result);
        }
      }

      // ── Insurance date: expired or near-expiring ─────────────────────────
      if (INSURED_CATEGORIES.has(item.category_key)) {
        const insDays = daysDiff(item.next_insurance_date, nowMs);

        if (item.next_insurance_date === null && item.status === "active") {
          const k = dedupeKey("missing_insurance_date", "equipment", item.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "missing_insurance_date",
            entityType: "equipment",
            entityId: item.id,
            severity: "error",
            title: `ציוד: ${name} — תאריך ביטוח חסר`,
            description: `קטגוריה: ${item.category_key} | ציוד פעיל ללא תאריך ביטוח תקף`,
            detectedFromData: { equipmentId: item.id, displayName: name, categoryKey: item.category_key },
            recommendedResolution: "הזן את תאריך הביטוח הנוכחי עבור הציוד",
          }, dedupeMap, result);
        } else if (insDays !== null) {
          if (insDays <= 0) {
            const k = dedupeKey("insurance_expired", "equipment", item.id);
            activeDedupeKeys.add(k);
            await upsertException(db, AGENT_ID, {
              category: "insurance_expired",
              entityType: "equipment",
              entityId: item.id,
              severity: "critical",
              title: `ציוד: ${name} — ביטוח פגה תוקף`,
              description: `תאריך ביטוח: ${item.next_insurance_date} | פג לפני ${Math.abs(Math.round(insDays))} ימים | אסור לשיגור`,
              detectedFromData: {
                equipmentId: item.id,
                displayName: name,
                nextInsuranceDate: item.next_insurance_date,
                daysExpired: Math.abs(Math.round(insDays)),
              },
              recommendedResolution: "הסר ציוד משיגור מיידי. חדש ביטוח ועדכן את התאריך",
            }, dedupeMap, result);
          } else if (insDays <= INSURANCE_ERROR_DAYS) {
            const k = dedupeKey("insurance_due_soon", "equipment", item.id);
            activeDedupeKeys.add(k);
            await upsertException(db, AGENT_ID, {
              category: "insurance_due_soon",
              entityType: "equipment",
              entityId: item.id,
              severity: "error",
              title: `ציוד: ${name} — ביטוח פג בעוד ${Math.round(insDays)} ימים`,
              description: `תאריך ביטוח: ${item.next_insurance_date}`,
              detectedFromData: {
                equipmentId: item.id,
                displayName: name,
                nextInsuranceDate: item.next_insurance_date,
                daysRemaining: Math.round(insDays),
              },
              recommendedResolution: "חדש ביטוח בדחיפות לפני תאריך הפקיעה",
            }, dedupeMap, result);
          } else if (insDays <= INSURANCE_WARN_DAYS) {
            const k = dedupeKey("insurance_due_soon", "equipment", item.id);
            activeDedupeKeys.add(k);
            await upsertException(db, AGENT_ID, {
              category: "insurance_due_soon",
              entityType: "equipment",
              entityId: item.id,
              severity: "warn",
              title: `ציוד: ${name} — ביטוח עומד לפוג בעוד ${Math.round(insDays)} ימים`,
              description: `תאריך ביטוח: ${item.next_insurance_date}`,
              detectedFromData: {
                equipmentId: item.id,
                displayName: name,
                nextInsuranceDate: item.next_insurance_date,
                daysRemaining: Math.round(insDays),
              },
              recommendedResolution: "תאם חידוש ביטוח לפני תאריך הפקיעה",
            }, dedupeMap, result);
          }
        }
      }

      // ── Upcoming / overdue maintenance ───────────────────────────────────
      const maintDays = daysDiff(item.next_maintenance_date, nowMs);

      if (item.next_maintenance_date !== null && maintDays !== null) {
        if (maintDays <= 0) {
          const k = dedupeKey("maintenance_overdue", "equipment", item.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "maintenance_overdue",
            entityType: "equipment",
            entityId: item.id,
            severity: "warn",
            title: `ציוד: ${name} — תחזוקה באיחור (${Math.abs(Math.round(maintDays))} ימים)`,
            description: `מועד תחזוקה: ${item.next_maintenance_date} | עבר ולא בוצע`,
            detectedFromData: {
              equipmentId: item.id,
              displayName: name,
              nextMaintenanceDate: item.next_maintenance_date,
              daysOverdue: Math.abs(Math.round(maintDays)),
            },
            recommendedResolution: "תאם תחזוקה בהקדם ועדכן את תאריך התחזוקה הבאה לאחר ביצוע",
          }, dedupeMap, result);
        } else if (maintDays <= MAINTENANCE_WARN_DAYS) {
          const k = dedupeKey("maintenance_due_soon", "equipment", item.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "maintenance_due_soon",
            entityType: "equipment",
            entityId: item.id,
            severity: "warn",
            title: `ציוד: ${name} — תחזוקה בעוד ${Math.round(maintDays)} ימים`,
            description: `מועד תחזוקה: ${item.next_maintenance_date}`,
            detectedFromData: {
              equipmentId: item.id,
              displayName: name,
              nextMaintenanceDate: item.next_maintenance_date,
              daysRemaining: Math.round(maintDays),
            },
            recommendedResolution: "תאם תחזוקה לפני מועד היעד",
          }, dedupeMap, result);
        }
      }

      // ── Stuck in repair ──────────────────────────────────────────────────
      // Equipment in 'in_repair' status for an extended period with no status
      // update suggests either a forgotten record or a prolonged repair that
      // may be blocking dispatch planning.
      if (item.status === "in_repair") {
        const daysSinceUpdate = ((nowMs - new Date(item.updated_at).getTime()) / 86_400_000);
        if (daysSinceUpdate >= REPAIR_STUCK_WARN_DAYS) {
          const severity = daysSinceUpdate >= REPAIR_STUCK_ERROR_DAYS ? "error" : "warn";
          const k = dedupeKey("repair_stuck", "equipment", item.id);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "repair_stuck",
            entityType: "equipment",
            entityId: item.id,
            severity,
            title: `ציוד: ${name} — בשיפוץ מעל ${Math.round(daysSinceUpdate)} ימים`,
            description: `ציוד ב-in_repair ללא עדכון סטטוס מזה ${Math.round(daysSinceUpdate)} ימים`,
            detectedFromData: {
              equipmentId: item.id,
              displayName: name,
              daysInRepair: Math.round(daysSinceUpdate),
            },
            recommendedResolution: "עדכן את סטטוס השיפוץ: הסתיים → active / pending_approval, או עדכן הערה על מצב השיפוץ",
          }, dedupeMap, result);
        }
      }
    }

    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    const summary = `סריקה הושלמה: ${result.entitiesScanned} פריטי ציוד | ${result.exceptionsCreated} חריגות חדשות | ${result.exceptionsUpdated} עודכנו | ${result.exceptionsResolved} נפתרו`;
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
