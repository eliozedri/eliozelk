// Diagnostic engine — interpretive layer on top of OperationalKPIs.
// Pure functions, deterministic, fully explainable.
// Takes metrics (what happened) and produces findings (why, impact, and what to do).
// Designed to be the stable foundation for future alerting, forecasting, and anomaly detection.

import type { OperationalKPIs } from "./operationalKPIs";
import type { WorkOrder } from "@/types/workOrder";
import type { WorkDiary } from "@/types/workDiary";
import type { CostRates } from "@/types/costRates";

export type DiagnosticType =
  | "billing_leakage"
  | "missing_billing_data"
  | "high_travel_time"
  | "crew_revenue_efficiency"
  | "chronic_loss_customers"
  | "execution_overrun_pattern"
  | "approval_bottleneck"
  | "data_quality_risk"
  | "revenue_decline"
  | "margin_compression";

export type DiagnosticSeverity = "critical" | "warn" | "info";
export type DiagnosticDepartment = "management" | "field" | "office" | "accounting";

export interface DiagnosticFinding {
  id: string;
  type: DiagnosticType;
  severity: DiagnosticSeverity;
  department: DiagnosticDepartment;
  title: string;
  explanation: string;
  recommendation: string;
  estimatedImpact: number | null;   // ₪ potential recovery or exposure
  affectedCount: number;
  evidence: string[];               // order/diary numbers or names for traceability
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}

function pct(n: number): string {
  return `${Math.abs(n).toFixed(1)}%`;
}

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 86_400_000;
}

// ─── Main diagnostic computation ─────────────────────────────────────────────

export function computeDiagnostics(
  kpis: OperationalKPIs,
  orders: WorkOrder[],
  diaries: WorkDiary[],
  rates: CostRates
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const { global, labor, executionVariance, dataQuality, billingLeakage, trendSummary, byCustomer } = kpis;

  // ── 1. Billing leakage ───────────────────────────────────────────────────
  if (billingLeakage.uninvoicedCompletedOrders > 0) {
    const severity: DiagnosticSeverity =
      billingLeakage.uninvoicedCompletedOrders >= 5 ? "critical" :
      billingLeakage.uninvoicedCompletedOrders >= 2 ? "warn" : "info";
    const names = orders
      .filter(o => o.status === "completed" && !o.invoicedAt && (!o.accountingStatus || o.accountingStatus === "pending" || o.accountingStatus === "verified"))
      .slice(0, 5)
      .map(o => o.orderNumber);
    findings.push({
      id: "billing_leakage",
      type: "billing_leakage",
      severity,
      department: "accounting",
      title: `${billingLeakage.uninvoicedCompletedOrders} הזמנות הושלמו ללא חשבונית`,
      explanation: billingLeakage.uninvoicedEstimatedRevenue > 0
        ? `הכנסות מוערכות של ${fmt(billingLeakage.uninvoicedEstimatedRevenue)} ממתינות לחיוב. ההזמנה הוותיקה ביותר ממתינה ${billingLeakage.oldestUninvoicedDays} ימים.`
        : `${billingLeakage.uninvoicedCompletedOrders} הזמנות מושלמות לא חויבו. ההזמנה הוותיקה ביותר ממתינה ${billingLeakage.oldestUninvoicedDays} ימים.`,
      recommendation: "עבור לדף הנה״ח וצור חשבוניות לכל ההזמנות המושלמות.",
      estimatedImpact: billingLeakage.uninvoicedEstimatedRevenue || null,
      affectedCount: billingLeakage.uninvoicedCompletedOrders,
      evidence: names,
    });
  }

  // ── 2. Missing billing data ──────────────────────────────────────────────
  const missingBillingPct = dataQuality.totalDiaries > 0
    ? dataQuality.missingBilling / dataQuality.totalDiaries
    : 0;
  if (missingBillingPct > 0.15 && dataQuality.totalDiaries >= 3) {
    const severity: DiagnosticSeverity =
      missingBillingPct > 0.40 ? "critical" :
      missingBillingPct > 0.25 ? "warn" : "info";
    // Impact: revenue we can't measure = missingBilling × avg daily revenue
    const avgDailyRevenue = global.totalDays > 0 ? global.totalRevenue / global.totalDays : 0;
    const estimatedImpact = dataQuality.missingBilling * avgDailyRevenue;
    findings.push({
      id: "missing_billing_data",
      type: "missing_billing_data",
      severity,
      department: "office",
      title: `${dataQuality.missingBilling} יומנים ללא סכום הכנסה (${pct(missingBillingPct * 100)})`,
      explanation: `לא ניתן לחשב רווחיות אמיתית ל-${dataQuality.missingBilling} ימי עבודה. ${estimatedImpact > 0 ? `הכנסה בלתי מתועדת מוערכת ב-${fmt(estimatedImpact)}.` : ""}`,
      recommendation: "הדרך את הצוות למלא סכום הכנסה בכל יומן לפני הגשה.",
      estimatedImpact: estimatedImpact > 0 ? estimatedImpact : null,
      affectedCount: dataQuality.missingBilling,
      evidence: [],
    });
  }

  // ── 3. High travel time ──────────────────────────────────────────────────
  if (labor.avgTravelTimePct > 30 && labor.totalFieldHours > 20) {
    const severity: DiagnosticSeverity =
      labor.avgTravelTimePct > 45 ? "critical" :
      labor.avgTravelTimePct > 35 ? "warn" : "info";
    // Impact: hours above 20% threshold × avg worker hourly cost × avg workers
    const excessTravelFraction = (labor.avgTravelTimePct - 20) / 100;
    const excessHours = labor.totalFieldHours * excessTravelFraction;
    const estimatedImpact = excessHours * rates.workerHourlyCost * (labor.avgWorkersPerDay || 1);
    findings.push({
      id: "high_travel_time",
      type: "high_travel_time",
      severity,
      department: "field",
      title: `זמן נסיעה ממוצע ${pct(labor.avgTravelTimePct)} מהיום — מעל סף קריטי`,
      explanation: `${labor.avgTravelTimePct.toFixed(0)}% מהשעות בשטח הולכות לנסיעה. הסטנדרט המקצועי: עד 20%. ${excessHours > 0 ? `בזבוז מוערך של ${excessHours.toFixed(0)} שעות עבודה (${fmt(estimatedImpact)}).` : ""}`,
      recommendation: "שלב עבודות גיאוגרפית. תכנן מסלולים יעילים. שקול מחסן ציוד אזורי.",
      estimatedImpact,
      affectedCount: Math.round(labor.totalFieldHours * (labor.avgTravelTimePct / 100)),
      evidence: [],
    });
  }

  // ── 4. Crew revenue efficiency ────────────────────────────────────────────
  const minEfficiencyThreshold = rates.workerDailyCost * 1.5;
  if (labor.revenuePerWorkerDay > 0 && labor.revenuePerWorkerDay < minEfficiencyThreshold && labor.totalWorkerDays >= 5) {
    const severity: DiagnosticSeverity =
      labor.revenuePerWorkerDay < rates.workerDailyCost ? "critical" : "warn";
    const gap = minEfficiencyThreshold - labor.revenuePerWorkerDay;
    const estimatedImpact = gap * labor.totalWorkerDays;
    findings.push({
      id: "crew_revenue_efficiency",
      type: "crew_revenue_efficiency",
      severity,
      department: "management",
      title: `הכנסה לעובד/יום ${fmt(Math.round(labor.revenuePerWorkerDay))} — מתחת ל-${fmt(Math.round(minEfficiencyThreshold))} יעד`,
      explanation: `היחס הכנסה/עובד נמוך מהנדרש לכיסוי עלויות עם מרווח. צוותים גדולים מדי ביחס לסכומי החיוב הם גורם עיקרי.`,
      recommendation: "בדוק גודל צוות מול הכנסת כל עבודה. הגדל מחירים בעבודות עתירות כוח אדם.",
      estimatedImpact,
      affectedCount: labor.totalWorkerDays,
      evidence: [],
    });
  }

  // ── 5. Chronic loss customers ────────────────────────────────────────────
  const lossCustomers = byCustomer.filter(c => c.avgMarginPct < -5 && c.orderCount >= 2);
  if (lossCustomers.length > 0) {
    const severity: DiagnosticSeverity =
      lossCustomers.some(c => c.avgMarginPct < -20) ? "critical" : "warn";
    const totalLoss = lossCustomers.reduce((s, c) => s + Math.abs(c.netProfit), 0);
    findings.push({
      id: "chronic_loss_customers",
      type: "chronic_loss_customers",
      severity,
      department: "management",
      title: `${lossCustomers.length} לקוחות עם הפסד כרוני`,
      explanation: `לקוחות: ${lossCustomers.map(c => c.customerName).join(", ")}. הפסד מצטבר: ${fmt(totalLoss)}. פרויקטים אלה גורמים נזק עקבי לרווחיות.`,
      recommendation: "בדוק תמחור מחדש עם לקוחות אלה. אם לא ניתן לעדכן מחיר — שקול סיום ההתקשרות.",
      estimatedImpact: totalLoss,
      affectedCount: lossCustomers.length,
      evidence: lossCustomers.map(c => c.customerName),
    });
  }

  // ── 6. Execution overrun pattern ─────────────────────────────────────────
  if (executionVariance.overrunCount >= 2 && executionVariance.measurableOrders >= 3) {
    const overrunRate = executionVariance.overrunCount / executionVariance.measurableOrders;
    const severity: DiagnosticSeverity = overrunRate > 0.6 ? "critical" : "warn";
    const estimatedImpact = executionVariance.avgVarianceHours > 0
      ? executionVariance.overrunCount * executionVariance.avgVarianceHours * rates.workerHourlyCost * (labor.avgWorkersPerDay || 2)
      : null;
    findings.push({
      id: "execution_overrun_pattern",
      type: "execution_overrun_pattern",
      severity,
      department: "field",
      title: `${executionVariance.overrunCount} מ-${executionVariance.measurableOrders} עבודות חרגו מהשעות המתוכננות`,
      explanation: `חריגת שעות ממוצעת: ${executionVariance.avgVarianceHours > 0 ? "+" : ""}${executionVariance.avgVarianceHours.toFixed(1)}h. חריגות עקביות מצביעות על הערכת זמן לקויה בשלב התכנון.`,
      recommendation: "עדכן נורמות שעות לפי סוג עבודה. שקול לבנות מאגר נתוני ביצוע לשיפור אמינות האומדנים.",
      estimatedImpact,
      affectedCount: executionVariance.overrunCount,
      evidence: executionVariance.worstOverruns.map(o => o.orderNumber),
    });
  }

  // ── 7. Approval bottleneck ───────────────────────────────────────────────
  const pendingOld = diaries.filter(d =>
    d.status === "submitted" &&
    (!d.approvalStatus || d.approvalStatus === "pending") &&
    d.submittedAt &&
    daysSince(d.submittedAt) > 2
  );
  if (pendingOld.length > 0) {
    const severity: DiagnosticSeverity = pendingOld.length >= 3 ? "critical" : "warn";
    const avgDailyRevenue = global.totalDays > 0 ? global.totalRevenue / global.totalDays : 0;
    const estimatedImpact = pendingOld.length * avgDailyRevenue;
    findings.push({
      id: "approval_bottleneck",
      type: "approval_bottleneck",
      severity,
      department: "office",
      title: `${pendingOld.length} יומנים ממתינים לאישור מעל 48 שעות`,
      explanation: `יומנים שלא אושרו חוסמים את תהליך החיוב. הכנסה תקועה מוערכת ב-${fmt(estimatedImpact)}.`,
      recommendation: "קבע תדירות בדיקת יומנים יומית. שקול ויתור על אישור לעבודות תקניות.",
      estimatedImpact,
      affectedCount: pendingOld.length,
      evidence: pendingOld.map(d => d.diaryNumber).slice(0, 5),
    });
  }

  // ── 8. Data quality risk ──────────────────────────────────────────────────
  if (dataQuality.completenessScore < 60 && dataQuality.totalDiaries >= 3) {
    const severity: DiagnosticSeverity = dataQuality.completenessScore < 40 ? "critical" : "warn";
    findings.push({
      id: "data_quality_risk",
      type: "data_quality_risk",
      severity,
      department: "management",
      title: `ניתוח רווחיות לא אמין — ציון שלמות נתונים ${dataQuality.completenessScore}%`,
      explanation: `חסרים: ${dataQuality.missingBilling} ללא הכנסה · ${dataQuality.missingCrew} ללא פרטי צוות · ${dataQuality.missingTime} ללא שעות · ${dataQuality.missingOrderLink} לא מקושרים להזמנה.`,
      recommendation: "קבע תקן מינימלי למילוי יומנים לפני הגשה: סכום הכנסה, שעות, צוות.",
      estimatedImpact: null,
      affectedCount: dataQuality.totalDiaries - Math.round(dataQuality.totalDiaries * dataQuality.completenessScore / 100),
      evidence: [],
    });
  }

  // ── 9. Revenue decline ────────────────────────────────────────────────────
  if (trendSummary.revenueDirection === "down" && Math.abs(trendSummary.revenueChangePct) > 10 && trendSummary.dataWeeks >= 4) {
    const severity: DiagnosticSeverity =
      Math.abs(trendSummary.revenueChangePct) > 30 ? "critical" : "warn";
    findings.push({
      id: "revenue_decline",
      type: "revenue_decline",
      severity,
      department: "management",
      title: `ירידת הכנסות של ${pct(trendSummary.revenueChangePct)} לעומת התקופה הקודמת`,
      explanation: `מגמת ירידה עקבית בהכנסות השבועיות. ${trendSummary.forecastNextWeekRevenue !== null ? `תחזית שבוע הבא: ${fmt(trendSummary.forecastNextWeekRevenue)}.` : ""}`,
      recommendation: "בדוק עצירה בהזמנות חדשות, ירידה בתפוקת ביצוע, או בעיה בשיווק.",
      estimatedImpact: null,
      affectedCount: trendSummary.dataWeeks,
      evidence: [],
    });
  }

  // ── 10. Margin compression ────────────────────────────────────────────────
  if (trendSummary.marginDirection === "down" && Math.abs(trendSummary.marginChangePct) > 8 && trendSummary.dataWeeks >= 4) {
    const severity: DiagnosticSeverity =
      global.avgMarginPercentage < rates.warningMarginPercentage ? "critical" : "warn";
    findings.push({
      id: "margin_compression",
      type: "margin_compression",
      severity,
      department: "management",
      title: `צמצום מרווח של ${pct(trendSummary.marginChangePct)} — מגמת הידרדרות`,
      explanation: `מרווח ממוצע נוכחי: ${global.avgMarginPercentage.toFixed(1)}%. יעד: ${rates.targetMarginPercentage}%. מרווחים יורדים גם כשהכנסות יציבות מצביע על עליית עלויות.`,
      recommendation: "בדוק עלויות עובדים, רכב ותקורה. כוון מחדש מחירי עבודות.",
      estimatedImpact: null,
      affectedCount: kpis.global.totalDays,
      evidence: [],
    });
  }

  // Sort: critical → warn → info, then by estimated impact desc
  return findings.sort((a, b) => {
    const sev = { critical: 0, warn: 1, info: 2 };
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
    return (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0);
  });
}
