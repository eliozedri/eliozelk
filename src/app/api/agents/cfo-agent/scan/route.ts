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

    // ── Order-level: snapshot health scan ────────────────────────────────────
    const { data: activeOrders } = await db
      .from("work_orders")
      .select("id,order_number,customer,status")
      .not("status", "in", '("cancelled")');

    const { data: existingSnaps } = await db
      .from("profitability_snapshots")
      .select("order_id,confidence_level,gross_profit,gross_margin_percent,updated_at")
      .is("work_diary_id", null);

    const snapMap = new Map((existingSnaps ?? []).map(s => [s.order_id as string, s]));

    let missingSnapshotCount = 0;
    let lowConfidenceCount = 0;
    let negativeMarginCount = 0;
    let belowTargetCount = 0;
    let nearTargetCount = 0;

    for (const order of (activeOrders ?? [])) {
      const orderId = order.id as string;
      const orderLabel = (order.order_number as string) || orderId.slice(0, 8);
      const snap = snapMap.get(orderId);

      // Completed/verified orders should have a snapshot
      if ((order.status === "completed" || order.status === "ready_installation") && !snap) {
        missingSnapshotCount++;
        const k = dedupeKey("snapshot_missing", "work_order", orderId);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "snapshot_missing",
          entityType: "work_order",
          entityId: orderId,
          severity: "warn",
          title: `חסר חישוב רווחיות — הזמנה ${orderLabel}`,
          description: `לקוח: ${order.customer as string} | סטטוס: ${order.status as string} | לא חושבה רווחיות`,
          detectedFromData: { orderNumber: orderLabel, status: order.status },
          recommendedResolution: "פתח CFO ליי ולחץ 'חשב' ליד ההזמנה, או הרץ 'חשב מחדש הכל'",
        }, dedupeMap, result);
      }

      if (snap) {
        const conf = snap.confidence_level as string;
        const grossProfit = snap.gross_profit as number;

        // Low / missing_data confidence
        if (conf === "low" || conf === "missing_data") {
          lowConfidenceCount++;
          const k = dedupeKey("snapshot_low_confidence", "work_order", orderId);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "snapshot_low_confidence",
            entityType: "work_order",
            entityId: orderId,
            severity: "info",
            title: `רווחיות — ביטחון נמוך — הזמנה ${orderLabel}`,
            description: `לקוח: ${order.customer as string} | רמת ביטחון: ${conf} | השלם נתונים חסרים לשיפור הדיוק`,
            detectedFromData: { orderNumber: orderLabel, confidenceLevel: conf },
            recommendedResolution: "עדכן נתוני צוות, הכנסה ומחירי עלות — ואז חשב מחדש",
          }, dedupeMap, result);
        }

        // Negative gross profit
        if (grossProfit < 0) {
          negativeMarginCount++;
          const margin = snap.gross_margin_percent as number;
          const k = dedupeKey("snapshot_negative_margin", "work_order", orderId);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "snapshot_negative_margin",
            entityType: "work_order",
            entityId: orderId,
            severity: "critical",
            title: `הפסד בהזמנה — ${orderLabel} (${margin.toFixed(1)}%)`,
            description: `לקוח: ${order.customer as string} | הפסד ₪${Math.round(Math.abs(grossProfit))} | מרווח: ${margin.toFixed(1)}%`,
            detectedFromData: { orderNumber: orderLabel, grossProfit, margin },
            recommendedResolution: "בדוק תמחור ועלויות — שקול העלאת מחיר לעבודות דומות",
          }, dedupeMap, result);

          // Create a task for negative-margin orders
          const tk = dedupeKey("review_negative_margin", "work_order", orderId);
          activeDedupeKeys.add(tk);
          await upsertTask(db, AGENT_ID, {
            category: "review_negative_margin",
            entityType: "work_order",
            entityId: orderId,
            title: `סקור תמחור — הזמנה ${orderLabel} (הפסד)`,
            description: `ההזמנה מפסידה ₪${Math.round(Math.abs(grossProfit))} לפי הנתונים הנוכחיים`,
            priority: "high",
            recommendedAction: "פתח CFO ליי → בדוק עלויות → שקול תיקון תמחור עתידי",
          }, taskDedupeMap, result);
        }

        // Below warning threshold (but not negative)
        if (grossProfit >= 0 && (snap.gross_margin_percent as number) < rates.warningMarginPercentage) {
          belowTargetCount++;
          const margin = snap.gross_margin_percent as number;
          const k = dedupeKey("snapshot_below_target", "work_order", orderId);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "snapshot_below_target",
            entityType: "work_order",
            entityId: orderId,
            severity: "warn",
            title: `מרווח מתחת לסף — הזמנה ${orderLabel} (${margin.toFixed(1)}%)`,
            description: `לקוח: ${order.customer as string} | מרווח: ${margin.toFixed(1)}% | סף אזהרה: ${rates.warningMarginPercentage}% | יעד: ${rates.targetMarginPercentage}%`,
            detectedFromData: { orderNumber: orderLabel, grossMarginPercent: margin, warningThreshold: rates.warningMarginPercentage, targetMargin: rates.targetMarginPercentage },
            recommendedResolution: "שקול העלאת תמחור — המרווח מתחת לסף האזהרה",
          }, dedupeMap, result);
        }

        // Near target (between warning and target)
        else if (grossProfit >= 0 && (snap.gross_margin_percent as number) < rates.targetMarginPercentage) {
          nearTargetCount++;
          const margin = snap.gross_margin_percent as number;
          const k = dedupeKey("snapshot_near_target", "work_order", orderId);
          activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "snapshot_near_target",
            entityType: "work_order",
            entityId: orderId,
            severity: "info",
            title: `מרווח קרוב ליעד — הזמנה ${orderLabel} (${margin.toFixed(1)}%)`,
            description: `לקוח: ${order.customer as string} | מרווח: ${margin.toFixed(1)}% | יעד: ${rates.targetMarginPercentage}% | פער: ${(margin - rates.targetMarginPercentage).toFixed(1)}%`,
            detectedFromData: { orderNumber: orderLabel, grossMarginPercent: margin, targetMargin: rates.targetMarginPercentage },
            recommendedResolution: "מרווח תקין — מעקב שוטף מומלץ",
          }, dedupeMap, result);
        }
      }
    }

    // ── Customer-level aggregation (Phase 4.6) ────────────────────────────────
    // Build per-customer stats from the snapshots already loaded
    type CustomerAgg = {
      customer: string;
      negativeCount: number;
      belowTargetCount: number;
      orderCount: number;
    };
    const customerAggMap = new Map<string, CustomerAgg>();
    for (const order of (activeOrders ?? [])) {
      const snap = snapMap.get(order.id as string);
      if (!snap) continue;
      const customerName = (order.customer as string | null)?.trim() || "לא ידוע";
      const agg: CustomerAgg = customerAggMap.get(customerName) ?? {
        customer: customerName, negativeCount: 0, belowTargetCount: 0, orderCount: 0,
      };
      agg.orderCount++;
      if ((snap.gross_profit as number) < 0) agg.negativeCount++;
      else if ((snap.gross_margin_percent as number) < rates.warningMarginPercentage) agg.belowTargetCount++;
      customerAggMap.set(customerName, agg);
    }

    let repeatedNegativeCustomers = 0;
    let repeatedBelowTargetCustomers = 0;

    for (const agg of customerAggMap.values()) {
      // Only flag customers with at least 2 orders to avoid single-job noise
      if (agg.orderCount < 2) continue;

      if (agg.negativeCount >= 2) {
        repeatedNegativeCustomers++;
        const k = dedupeKey("customer_repeated_negative", "customer", agg.customer);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "customer_repeated_negative",
          entityType: "customer",
          entityId: agg.customer,
          severity: "warn",
          title: `לקוח עם הפסדים חוזרים — ${agg.customer} (${agg.negativeCount}/${agg.orderCount} עבודות)`,
          description: `${agg.negativeCount} מתוך ${agg.orderCount} הזמנות מסתיימות בהפסד — ייתכן שתמחור אינו מתאים לעבודות מסוג זה`,
          detectedFromData: { customerName: agg.customer, negativeCount: agg.negativeCount, orderCount: agg.orderCount },
          recommendedResolution: "סקור תמחור עבודות לקוח זה — שקול שיחת מחיר או עדכון תעריפים",
        }, dedupeMap, result);
      } else if (agg.belowTargetCount >= 2) {
        repeatedBelowTargetCustomers++;
        const k = dedupeKey("customer_repeated_below_target", "customer", agg.customer);
        activeDedupeKeys.add(k);
        await upsertException(db, AGENT_ID, {
          category: "customer_repeated_below_target",
          entityType: "customer",
          entityId: agg.customer,
          severity: "info",
          title: `לקוח עם מרווח נמוך חוזר — ${agg.customer} (${agg.belowTargetCount}/${agg.orderCount} עבודות)`,
          description: `${agg.belowTargetCount} עבודות עם מרווח מתחת לסף האזהרה (${rates.warningMarginPercentage}%) — שקול עדכון תמחור`,
          detectedFromData: { customerName: agg.customer, belowTargetCount: agg.belowTargetCount, orderCount: agg.orderCount, warningThreshold: rates.warningMarginPercentage },
          recommendedResolution: "בדוק רווחיות לקוח בלשונית CFO ליי → שקול שיחת תמחור",
        }, dedupeMap, result);
      }
    }

    // ── Supplier documents (OCR finance pipeline) awaiting review ────────────
    // Connect OCR document intake to financial oversight: surface documents that
    // are stuck, low-confidence, unclassified, duplicate-suspected, or aging
    // unreviewed. Read-only — nothing is posted; all resolution is human-gated.
    const docsRes = await db
      .from("supplier_documents")
      .select("id,status,document_number,total_after_vat,extraction_confidence,requires_classification,supplier_name_raw,file_name,created_at")
      .in("status", ["draft_ready", "needs_review", "duplicate_suspected", "extracting"]);
    if (!docsRes.error) {
      const docs = docsRes.data ?? [];
      result.entitiesScanned += docs.length;
      const docNowMs = Date.now();
      const DAY = 86_400_000;
      for (const d of docs) {
        const id = String(d.id);
        const name = (d.supplier_name_raw as string) || (d.file_name as string) || id;
        const conf = typeof d.extraction_confidence === "number" ? d.extraction_confidence : null;
        const ageDays = (docNowMs - new Date(d.created_at as string).getTime()) / DAY;

        if (d.status === "duplicate_suspected") {
          const k = dedupeKey("supplier_doc_duplicate_suspected", "supplier_document", id); activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "supplier_doc_duplicate_suspected", entityType: "supplier_document", entityId: id, severity: "error",
            title: `מסמך ספק חשוד ככפילות — ${name}`,
            description: `מס׳ מסמך: ${d.document_number || "—"} | סכום: ${d.total_after_vat ?? "—"} | דורש הכרעה לפני רישום`,
            detectedFromData: { docId: id, supplier: name, documentNumber: d.document_number, total: d.total_after_vat },
            recommendedResolution: "פתח בהנהלת כספים והכרע את הכפילות (אשר/דחה)",
          }, dedupeMap, result);
          continue;
        }
        if (d.status === "extracting" && ageDays * 1440 > 5) {
          const k = dedupeKey("supplier_doc_stuck_extracting", "supplier_document", id); activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "supplier_doc_stuck_extracting", entityType: "supplier_document", entityId: id, severity: "error",
            title: `מסמך ספק תקוע בעיבוד OCR — ${name}`,
            description: "המסמך נתקע בשלב 'extracting' — ייתכן ש-OCR נכשל; נדרשת הזנה/אימות ידני",
            detectedFromData: { docId: id, fileName: d.file_name },
            recommendedResolution: "פתח את המסמך והזן/אמת ידנית; הסריקה האוטומטית לא הושלמה",
          }, dedupeMap, result);
          continue;
        }
        // draft_ready / needs_review
        if (conf !== null && conf === 0) {
          const k = dedupeKey("supplier_doc_ocr_failed", "supplier_document", id); activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "supplier_doc_ocr_failed", entityType: "supplier_document", entityId: id, severity: "error",
            title: `מסמך ספק — זיהוי OCR נכשל — ${name}`,
            description: "ה-OCR לא חילץ נתונים — נדרשת הזנה ידנית של מספר מסמך, תאריך וסכום",
            detectedFromData: { docId: id, fileName: d.file_name },
            recommendedResolution: "פתח בהנהלת כספים והזן את שדות המסמך ידנית",
          }, dedupeMap, result);
        } else if (conf !== null && conf < 0.5) {
          const k = dedupeKey("supplier_doc_low_confidence", "supplier_document", id); activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "supplier_doc_low_confidence", entityType: "supplier_document", entityId: id, severity: "warn",
            title: `מסמך ספק — ביטחון OCR נמוך (${Math.round(conf * 100)}%) — ${name}`,
            description: "תוצאות ה-OCR בלתי ודאיות — יש לאמת את השדות מול המקור",
            detectedFromData: { docId: id, confidence: conf, documentNumber: d.document_number },
            recommendedResolution: "אמת את השדות שזוהו בהנהלת כספים לפני רישום",
          }, dedupeMap, result);
        }
        if (d.requires_classification === true) {
          const k = dedupeKey("supplier_doc_needs_classification", "supplier_document", id); activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "supplier_doc_needs_classification", entityType: "supplier_document", entityId: id, severity: "warn",
            title: `מסמך ספק דורש סיווג הוצאה — ${name}`,
            description: "לא זוהה סוג הוצאה אוטומטית — נדרש סיווג ידני לפני רישום",
            detectedFromData: { docId: id, supplier: name },
            recommendedResolution: "סווג את סוג ההוצאה בהנהלת כספים",
          }, dedupeMap, result);
        }
        if (ageDays >= 3) {
          const k = dedupeKey("supplier_doc_review_aged", "supplier_document", id); activeDedupeKeys.add(k);
          await upsertException(db, AGENT_ID, {
            category: "supplier_doc_review_aged", entityType: "supplier_document", entityId: id, severity: ageDays >= 7 ? "error" : "warn",
            title: `מסמך ספק ממתין לאימות ${Math.round(ageDays)} ימים — ${name}`,
            description: `סטטוס: ${d.status} | מסמך כספי שטרם נסקר/נרשם`,
            detectedFromData: { docId: id, status: d.status, ageDays: Math.round(ageDays) },
            recommendedResolution: "סקור ורשום/דחה את המסמך בהנהלת כספים",
          }, dedupeMap, result);
        }
      }
    }

    await autoResolveStaleExceptions(db, AGENT_ID, activeDedupeKeys, dedupeMap, result);

    const summary = `סריקה כספית: ${result.entitiesScanned} יומנים | ${totalLoss} הפסד | ${totalMarginal} שולי | ${totalMissingData} חסר נתונים | ${missingCostPriceCount} חסרי עלות | ${missingSnapshotCount} snapshot חסר | ${lowConfidenceCount} ביטחון נמוך | ${negativeMarginCount} הפסד בהזמנה | ${belowTargetCount} מתחת לסף | ${nearTargetCount} קרוב ליעד | ${repeatedNegativeCustomers} לקוחות הפסדיים | ${repeatedBelowTargetCustomers} לקוחות מרווח נמוך | ${result.exceptionsCreated} חריגות חדשות`;
    await writeAgentActivity(db, AGENT_ID, "detection", summary, {
      entitiesScanned: result.entitiesScanned,
      lossJobs: totalLoss,
      marginalJobs: totalMarginal,
      missingDataJobs: totalMissingData,
      missingCostPriceItems: missingCostPriceCount,
      missingSnapshots: missingSnapshotCount,
      lowConfidenceSnapshots: lowConfidenceCount,
      negativeMarginOrders: negativeMarginCount,
      belowTargetOrders: belowTargetCount,
      nearTargetOrders: nearTargetCount,
      repeatedNegativeCustomers,
      repeatedBelowTargetCustomers,
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
