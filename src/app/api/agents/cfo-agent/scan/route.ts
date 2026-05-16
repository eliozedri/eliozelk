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
  verifyMasterAuth,
  dedupeKey,
} from "@/lib/agents/scan-utils";
import { emptyScanResult } from "@/lib/agents/types";
import { extractDiaryData } from "@/lib/agents/types";
import type { DbDiaryRow, DbCostRates } from "@/lib/agents/types";
import { calculateProfitability } from "@/lib/profitability";
import type { WorkDiary } from "@/types/workDiary";
import { DEFAULT_COST_RATES } from "@/types/costRates";
import type { CostRates } from "@/types/costRates";

const AGENT_ID   = "cfo-agent";
const AGENT_NAME = "מנהל כספים";

// Reconstruct a WorkDiary-compatible object from a DB row for profitability calculation
function buildDiaryForCalc(row: DbDiaryRow): WorkDiary {
  const d = extractDiaryData(row);
  return {
    id: row.id,
    diaryNumber: row.diary_number,
    status: row.status as WorkDiary["status"],
    customerName: row.customer_name,
    siteName: row.site_name,
    contactName: "",
    contactPhone: "",
    executionDate: row.execution_date,
    startTime: d.startTime,
    endTime: d.endTime,
    vehicleNumber: d.vehicleNumber,
    trailerNumber: "",
    driverName: "",
    crewLeaderName: d.crewLeaderName,
    crewMembers: d.crewMembers,
    paintingItems: [],
    poleItems: [],
    signItems: [],
    photos: [],
    generalNotes: "",
    customerSignature: d.customerSignature as WorkDiary["customerSignature"],
    companySignature: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    orderId: row.order_id ?? undefined,
    billedAmount: d.billedAmount > 0 ? d.billedAmount : undefined,
    isBillable: d.isBillable,
    travelTimeHours: d.travelTimeHours,
    setupTimeHours: d.setupTimeHours,
    waitingTimeHours: d.waitingTimeHours,
    executionTimeHours: d.executionTimeHours,
    vehicleCostOverride: d.vehicleCostOverride,
    equipmentCost: d.equipmentCost,
    materialCost: d.materialCost,
    approvalStatus: row.approval_status as WorkDiary["approvalStatus"],
    approvedBy: undefined,
    approvedAt: row.approved_at ?? undefined,
  };
}

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

    // Load cost rates
    const { data: ratesRow } = await db
      .from("cost_rates")
      .select("data")
      .eq("id", 1)
      .maybeSingle() as { data: DbCostRates | null };

    const rates: CostRates = {
      ...DEFAULT_COST_RATES,
      ...((ratesRow?.data ?? {}) as Partial<CostRates>),
    };

    // Load submitted+approved diaries for profitability analysis
    const { data: rawDiaries, error: diaryErr } = await db
      .from("work_diaries")
      .select("id,diary_number,status,customer_name,site_name,execution_date,submitted_at,order_id,approval_status,approved_at,created_at,updated_at,data")
      .in("status", ["submitted"])
      .order("execution_date", { ascending: false })
      .limit(300);

    if (diaryErr) throw new Error(diaryErr.message);
    const diaries = (rawDiaries ?? []) as DbDiaryRow[];
    result.entitiesScanned = diaries.length;

    const dedupeMap = await loadAgentExceptionDedupeMap(db, AGENT_ID);
    const taskDedupeMap = await loadAgentTaskDedupeMap(db, AGENT_ID);
    const activeDedupeKeys = new Set<string>();

    let totalLoss = 0;
    let totalMarginal = 0;
    let totalMissingData = 0;

    for (const row of diaries) {
      const d = extractDiaryData(row);
      const dId = row.id;
      const dLabel = row.diary_number || dId.slice(0, 8);

      // Skip diaries explicitly marked non-billable — no financial issue
      if (d.isBillable === false) continue;

      const diary = buildDiaryForCalc(row);
      const prof = calculateProfitability(diary, rates);

      // ── Missing billing data ─────────────────────────────────────────────
      if (prof.status === "no_data" || d.billedAmount === 0) {
        totalMissingData++;
        const k = dedupeKey("profitability_missing_billing", "work_diary", dId);
        activeDedupeKeys.add(k);
        await upsertTask(db, AGENT_ID, {
          category: "profitability_missing_billing",
          entityType: "work_diary",
          entityId: dId,
          title: `נתוני חיוב חסרים — יומן ${dLabel}`,
          description: `לקוח: ${row.customer_name} | תאריך: ${row.execution_date} | עלות משוערת: ₪${Math.round(prof.totalCost)}`,
          priority: "normal",
          recommendedAction: "הזן סכום חיוב ביומן לחישוב רווחיות מדויק",
        }, taskDedupeMap, result);
        continue;
      }

      // ── Missing crew data → labor cost = 0 ───────────────────────────────
      if (prof.totalWorkers === 0) {
        const k = dedupeKey("profitability_missing_crew", "work_diary", dId);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "profitability_missing_crew",
          entityType: "work_diary",
          entityId: dId,
          severity: "info",
          title: `יומן ${dLabel} — עלות עבודה לא מחושבת (צוות חסר)`,
          description: `לקוח: ${row.customer_name} | רווחיות אינה מלאה ללא פרטי צוות`,
          detectedFromData: { diaryNumber: dLabel, billedAmount: prof.billedAmount, totalCost: prof.totalCost },
          recommendedResolution: "הוסף פרטי ראש צוות ואנשי צוות ליומן",
        }, dedupeMap, result);
      }

      // ── Loss job ──────────────────────────────────────────────────────────
      if (prof.status === "loss" && prof.billedAmount > 0) {
        totalLoss++;
        const k = dedupeKey("profitability_loss", "work_diary", dId);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "profitability_loss",
          entityType: "work_diary",
          entityId: dId,
          severity: "critical",
          title: `הפסד — יומן ${dLabel} (${prof.marginPercentage.toFixed(1)}%)`,
          description: `לקוח: ${row.customer_name} | הכנסה: ₪${Math.round(prof.billedAmount)} | עלות: ₪${Math.round(prof.totalCost)} | הפסד: ₪${Math.round(Math.abs(prof.netProfit))}`,
          detectedFromData: {
            diaryNumber: dLabel,
            customerName: row.customer_name,
            executionDate: row.execution_date,
            billedAmount: prof.billedAmount,
            totalCost: prof.totalCost,
            netProfit: prof.netProfit,
            marginPercentage: prof.marginPercentage,
            laborCost: prof.laborCost,
            vehicleCost: prof.vehicleCost,
            breakEvenBilling: prof.breakEvenBilling,
          },
          recommendedResolution: prof.recommendations[0] ?? `נדרש מחיר מינימום ₪${Math.round(prof.breakEvenBilling)} לכיסוי עלויות`,
        }, dedupeMap, result);
      }

      // ── Marginal job ──────────────────────────────────────────────────────
      else if (prof.status === "marginal" && prof.billedAmount > 0) {
        totalMarginal++;
        const k = dedupeKey("profitability_marginal", "work_diary", dId);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "profitability_marginal",
          entityType: "work_diary",
          entityId: dId,
          severity: "warn",
          title: `רווחיות שולית — יומן ${dLabel} (${prof.marginPercentage.toFixed(1)}%)`,
          description: `לקוח: ${row.customer_name} | רווח נקי: ₪${Math.round(prof.netProfit)} | יעד: ${rates.targetMarginPercentage}%`,
          detectedFromData: {
            diaryNumber: dLabel,
            customerName: row.customer_name,
            executionDate: row.execution_date,
            billedAmount: prof.billedAmount,
            netProfit: prof.netProfit,
            marginPercentage: prof.marginPercentage,
            targetMargin: rates.targetMarginPercentage,
            warningMargin: rates.warningMarginPercentage,
          },
          recommendedResolution: `שקל העלאת מחיר לעבודות דומות. יעד: ₪${Math.round(prof.targetBilling)}`,
        }, dedupeMap, result);
      }
    }

    // ── Order-level: detect catalog items missing cost_price ──────────────────
    const { data: catalogItems } = await db
      .from("catalog_items")
      .select("id,name,type")
      .in("type", ["material", "product"])
      .eq("is_active", true)
      .is("cost_price", null);

    // Find which of those items have been actually consumed (affects live profitability)
    const allMissingIds = (catalogItems ?? []).map(i => i.id as string);
    let consumedMissingIds = new Set<string>();
    if (allMissingIds.length > 0) {
      const { data: consumed } = await db
        .from("inventory_consumptions")
        .select("item_id")
        .in("item_id", allMissingIds);
      consumedMissingIds = new Set((consumed ?? []).map(c => c.item_id as string));
    }

    let missingCostPriceCount = 0;
    for (const item of (catalogItems ?? [])) {
      missingCostPriceCount++;
      const itemId = item.id as string;
      const k = dedupeKey("missing_cost_price", "catalog_item", itemId);
      activeDedupeKeys.add(k);
      await upsertException(db, AGENT_ID, {
        category: "missing_cost_price",
        entityType: "catalog_item",
        entityId: itemId,
        severity: "info",
        title: `מחיר עלות חסר — ${item.name as string}`,
        description: `פריט מסוג ${item.type as string} ללא מחיר עלות — חישוב רווחיות הזמנות יהיה חלקי`,
        detectedFromData: { itemName: item.name, itemType: item.type },
        recommendedResolution: "הזן מחיר עלות בקטלוג כדי לאפשר חישוב מלא של רווחיות הזמנות",
      }, dedupeMap, result);

      // Create a task only for items that have actually been consumed
      if (consumedMissingIds.has(itemId)) {
        const tk = dedupeKey("fill_cost_price", "catalog_item", itemId);
        activeDedupeKeys.add(tk);
        await upsertTask(db, AGENT_ID, {
          category: "fill_cost_price",
          entityType: "catalog_item",
          entityId: itemId,
          title: `הזן מחיר עלות — ${item.name as string}`,
          description: `פריט זה נוצל בהזמנות ולא ניתן לחשב רווחיות מלאה ללא מחיר עלות`,
          priority: "normal",
          recommendedAction: "פתח קטלוג → סנן חסרי מחיר עלות → הזן עלות רכישה",
        }, taskDedupeMap, result);
      }
    }

    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    const summary = `סריקה כספית: ${result.entitiesScanned} יומנים | ${totalLoss} הפסד | ${totalMarginal} שולי | ${totalMissingData} חסר נתונים | ${missingCostPriceCount} חסרי עלות | ${result.exceptionsCreated} חריגות חדשות`;
    await writeAgentActivity(db, AGENT_ID, "detection", summary, {
      entitiesScanned: result.entitiesScanned,
      lossJobs: totalLoss,
      marginalJobs: totalMarginal,
      missingDataJobs: totalMissingData,
      missingCostPriceItems: missingCostPriceCount,
      exceptionsCreated: result.exceptionsCreated,
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
