// Pure profitability calculation functions.
// No React dependencies — safe to call anywhere.

import type { WorkDiary } from "@/types/workDiary";
import type { CostRates } from "@/types/costRates";

export type ProfitabilityStatus = "profitable" | "marginal" | "breakeven" | "loss" | "no_data";

export interface ProfitabilityAlert {
  type: "loss" | "time_leak" | "low_revenue" | "missing_data" | "crew_size" | "unbilled";
  severity: "error" | "warn" | "info";
  message: string;
}

export interface ProfitabilityResult {
  // ─── Revenue ──────────────────────────────────────────────
  billedAmount: number;

  // ─── Costs ────────────────────────────────────────────────
  laborCost: number;
  vehicleCost: number;
  equipmentCost: number;
  materialCost: number;
  directCost: number;
  overheadCost: number;
  totalCost: number;

  // ─── Profit ───────────────────────────────────────────────
  grossProfit: number;      // before overhead
  netProfit: number;        // after overhead
  marginPercentage: number; // netProfit / billedAmount × 100

  // ─── Status ───────────────────────────────────────────────
  status: ProfitabilityStatus;

  // ─── Planning ─────────────────────────────────────────────
  breakEvenBilling: number;      // totalCost = break-even
  targetBilling: number;         // billing needed to hit target margin
  surplusOrDeficit: number;      // billedAmount - breakEvenBilling

  // ─── Time analysis ────────────────────────────────────────
  totalHours: number;
  executionHours: number;
  travelHours: number;
  waitingHours: number;
  setupHours: number;
  nonBillableHours: number;
  timeEfficiencyPct: number;    // executionHours / totalHours × 100
  travelTimePct: number;

  // ─── Crew ─────────────────────────────────────────────────
  totalWorkers: number;
  revenuePerWorker: number;
  costPerWorker: number;

  // ─── Alerts & recommendations ─────────────────────────────
  alerts: ProfitabilityAlert[];
  recommendations: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseTimeToHours(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  return parts[0] + parts[1] / 60;
}

function totalDiaryHours(diary: WorkDiary): number {
  if (!diary.startTime || !diary.endTime) return 0;
  const start = parseTimeToHours(diary.startTime);
  const end = parseTimeToHours(diary.endTime);
  if (end <= start) return 0;
  return end - start;
}

function fmt(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}

// ─── Main calculation ────────────────────────────────────────────────────────

export function calculateProfitability(
  diary: WorkDiary,
  rates: CostRates
): ProfitabilityResult {
  // ── Workers ──
  const crewCount = diary.crewMembers.filter((m) => m.trim()).length;
  const hasLeader = diary.crewLeaderName?.trim() ? 1 : 0;
  const totalWorkers = crewCount + hasLeader;

  // ── Labor cost ──
  const leaderCost = hasLeader * rates.teamLeaderDailyCost;
  const workersCost = crewCount * rates.workerDailyCost;
  const laborCost = leaderCost + workersCost;

  // ── Vehicle cost ──
  const hasVehicle = diary.vehicleNumber?.trim() ? 1 : 0;
  const vehicleCost =
    diary.vehicleCostOverride != null
      ? diary.vehicleCostOverride
      : hasVehicle
      ? rates.vehicleDailyCost + rates.fuelCostPerDay
      : 0;

  // ── Equipment & material ──
  const equipmentCost = diary.equipmentCost ?? 0;
  const materialCost = diary.materialCost ?? 0;

  // ── Direct costs ──
  const directCost = laborCost + vehicleCost + equipmentCost + materialCost;

  // ── Overhead ──
  const overheadCost =
    directCost * (rates.overheadPercentage / 100) + rates.fixedDailyOverhead;

  // ── Total ──
  const totalCost = directCost + overheadCost;

  // ── Revenue ──
  const billedAmount = diary.billedAmount ?? 0;

  // ── Profit ──
  const grossProfit = billedAmount - directCost;
  const netProfit = billedAmount - totalCost;
  const marginPercentage =
    billedAmount > 0 ? (netProfit / billedAmount) * 100 : (totalCost > 0 ? -100 : 0);

  // ── Planning thresholds ──
  const breakEvenBilling = totalCost;
  const targetFactor = 1 - rates.targetMarginPercentage / 100;
  const targetBilling = targetFactor > 0 ? totalCost / targetFactor : 0;
  const surplusOrDeficit = billedAmount - breakEvenBilling;

  // ── Time ──
  const totalHours = totalDiaryHours(diary);
  const travelHours = diary.travelTimeHours ?? 0;
  const waitingHours = diary.waitingTimeHours ?? 0;
  const setupHours = diary.setupTimeHours ?? 0;
  const nonBillableHours = travelHours + waitingHours + setupHours;
  const executionHours =
    diary.executionTimeHours != null
      ? diary.executionTimeHours
      : Math.max(0, totalHours - nonBillableHours);
  const timeEfficiencyPct =
    totalHours > 0 ? (executionHours / totalHours) * 100 : 0;
  const travelTimePct = totalHours > 0 ? (travelHours / totalHours) * 100 : 0;

  // ── Per-worker ──
  const revenuePerWorker = totalWorkers > 0 ? billedAmount / totalWorkers : 0;
  const costPerWorker = totalWorkers > 0 ? totalCost / totalWorkers : 0;

  // ── Status ──
  let status: ProfitabilityStatus;
  if (billedAmount === 0 && totalCost === 0) {
    status = "no_data";
  } else if (billedAmount === 0) {
    status = "loss";
  } else if (marginPercentage >= rates.targetMarginPercentage) {
    status = "profitable";
  } else if (marginPercentage >= rates.warningMarginPercentage) {
    status = "marginal";
  } else if (marginPercentage >= rates.lossThresholdPercentage) {
    status = "breakeven";
  } else {
    status = "loss";
  }

  // ── Alerts ──
  const alerts: ProfitabilityAlert[] = [];

  if (billedAmount === 0) {
    alerts.push({ type: "missing_data", severity: "warn", message: "סכום לחיוב לא הוזן — רווחיות אינה ניתנת לחישוב" });
  }
  if (totalWorkers === 0) {
    alerts.push({ type: "missing_data", severity: "warn", message: "לא הוגדרו אנשי צוות — עלות עבודה = 0" });
  }
  if (vehicleCost === 0 && hasVehicle === 0) {
    alerts.push({ type: "missing_data", severity: "info", message: "לא הוזן מספר רכב — עלות רכב לא מחושבת" });
  }
  if (netProfit < 0 && billedAmount > 0) {
    alerts.push({ type: "loss", severity: "error", message: `הפסד תפעולי משוער: ${fmt(Math.abs(netProfit))}` });
  }
  if (travelTimePct > 35 && totalHours > 0) {
    alerts.push({ type: "time_leak", severity: "warn", message: `זמן נסיעה ${travelTimePct.toFixed(0)}% מהיום — דליפת זמן גבוהה` });
  }
  if (billedAmount > 0 && billedAmount < rates.minDailyBillingAmount) {
    alerts.push({ type: "low_revenue", severity: "warn", message: `חיוב ${fmt(billedAmount)} — מתחת למינימום יומי ${fmt(rates.minDailyBillingAmount)}` });
  }
  if (diary.isBillable === false) {
    alerts.push({ type: "unbilled", severity: "info", message: "יום זה סומן כלא לחיוב" });
  }
  if (timeEfficiencyPct < 50 && totalHours >= 4) {
    alerts.push({ type: "time_leak", severity: "warn", message: `יעילות ביצוע ${timeEfficiencyPct.toFixed(0)}% — פחות ממחצית הזמן בביצוע בפועל` });
  }

  // ── Recommendations ──
  const recommendations: string[] = [];
  if (netProfit < 0 && billedAmount > 0) {
    recommendations.push(`המחיר צריך לעלות לפחות ל-${fmt(breakEvenBilling)} לכיסוי עלויות, ו-${fmt(targetBilling)} להגיע ליעד הרווחיות`);
  }
  if (travelTimePct > 30) {
    recommendations.push("שקול לשלב עבודה זו עם עבודות סמוכות גיאוגרפית לקיצור זמן נסיעה");
  }
  if (totalWorkers > 3 && revenuePerWorker < rates.workerDailyCost * 2) {
    recommendations.push("גודל הצוות גבוה ביחס לסכום החיוב — שקול צוות קטן יותר לעבודה זו");
  }
  if (billedAmount > 0 && billedAmount < rates.minDailyBillingAmount) {
    recommendations.push(`קבע מינימום חיוב יומי של ${fmt(rates.minDailyBillingAmount)} לעבודה מסוג זה`);
  }

  return {
    billedAmount, laborCost, vehicleCost, equipmentCost, materialCost,
    directCost, overheadCost, totalCost,
    grossProfit, netProfit, marginPercentage,
    status, breakEvenBilling, targetBilling, surplusOrDeficit,
    totalHours, executionHours, travelHours, waitingHours, setupHours,
    nonBillableHours, timeEfficiencyPct, travelTimePct,
    totalWorkers, revenuePerWorker, costPerWorker,
    alerts, recommendations,
  };
}

// ─── Aggregate across multiple diaries ──────────────────────────────────────

export interface AggregatedProfitability {
  totalDays: number;
  profitableDays: number;
  marginalDays: number;
  lossDays: number;
  noDataDays: number;
  totalRevenue: number;
  totalCost: number;
  totalNetProfit: number;
  avgMarginPercentage: number;
  avgRevenuePerDay: number;
  avgCostPerDay: number;
  totalLaborCost: number;
  totalVehicleCost: number;
  totalMaterialCost: number;
  totalOverheadCost: number;
}

export function aggregateProfitability(
  results: ProfitabilityResult[]
): AggregatedProfitability {
  const n = results.length;
  if (n === 0) {
    return {
      totalDays: 0, profitableDays: 0, marginalDays: 0, lossDays: 0, noDataDays: 0,
      totalRevenue: 0, totalCost: 0, totalNetProfit: 0, avgMarginPercentage: 0,
      avgRevenuePerDay: 0, avgCostPerDay: 0, totalLaborCost: 0,
      totalVehicleCost: 0, totalMaterialCost: 0, totalOverheadCost: 0,
    };
  }

  const totalRevenue = results.reduce((s, r) => s + r.billedAmount, 0);
  const totalCost = results.reduce((s, r) => s + r.totalCost, 0);
  const totalNetProfit = totalRevenue - totalCost;

  return {
    totalDays: n,
    profitableDays: results.filter((r) => r.status === "profitable").length,
    marginalDays: results.filter((r) => r.status === "marginal").length,
    lossDays: results.filter((r) => r.status === "loss").length,
    noDataDays: results.filter((r) => r.status === "no_data").length,
    totalRevenue,
    totalCost,
    totalNetProfit,
    avgMarginPercentage: totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0,
    avgRevenuePerDay: totalRevenue / n,
    avgCostPerDay: totalCost / n,
    totalLaborCost: results.reduce((s, r) => s + r.laborCost, 0),
    totalVehicleCost: results.reduce((s, r) => s + r.vehicleCost, 0),
    totalMaterialCost: results.reduce((s, r) => s + r.materialCost, 0),
    totalOverheadCost: results.reduce((s, r) => s + r.overheadCost, 0),
  };
}

// ─── Status helpers ──────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<ProfitabilityStatus, string> = {
  profitable: "רווחי",
  marginal: "שולי",
  breakeven: "איזון",
  loss: "הפסד",
  no_data: "נתונים חסרים",
};

export const STATUS_COLORS: Record<ProfitabilityStatus, string> = {
  profitable: "bg-green-100 text-green-800",
  marginal: "bg-yellow-100 text-yellow-800",
  breakeven: "bg-orange-100 text-orange-800",
  loss: "bg-red-100 text-red-800",
  no_data: "bg-gray-100 text-gray-500",
};

export const STATUS_DOT: Record<ProfitabilityStatus, string> = {
  profitable: "bg-green-500",
  marginal: "bg-yellow-400",
  breakeven: "bg-orange-400",
  loss: "bg-red-500",
  no_data: "bg-gray-300",
};
