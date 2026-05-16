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

// ─── Order-level profitability (Phase 4.0 CFO Lite) ─────────────────────────

export type ConfidenceLevel = "high" | "medium" | "low" | "missing_data";

export type MissingDataTag =
  | "no_revenue"
  | "no_linked_diaries"
  | "no_crew_data"
  | "missing_cost_price"
  | "no_material_cost"
  | "no_vehicle_data"
  | "no_approved_diary";

export const MISSING_DATA_LABELS: Record<MissingDataTag, string> = {
  no_revenue: "אין הכנסה מוגדרת",
  no_linked_diaries: "אין יומני עבודה מקושרים",
  no_crew_data: "אין נתוני צוות",
  missing_cost_price: "חסרים מחירי עלות בקטלוג",
  no_material_cost: "אין נתוני חומרים",
  no_vehicle_data: "אין נתוני רכב",
  no_approved_diary: "אין יומן עבודה מאושר",
};

export const MISSING_DATA_ACTIONS: Record<MissingDataTag, string> = {
  no_revenue: "הזן סכום לחישוב רווחיות",
  no_linked_diaries: "קשר יומן עבודה",
  no_approved_diary: "אשר יומן עבודה",
  missing_cost_price: "השלם מחיר עלות בקטלוג",
  no_crew_data: "בדוק נתוני צוות",
  no_material_cost: "עדכן פריטי חומר ביומן",
  no_vehicle_data: "בדוק נתוני רכב",
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: "גבוה",
  medium: "בינוני",
  low: "נמוך",
  missing_data: "נתונים חסרים",
};

export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-orange-100 text-orange-800",
  missing_data: "bg-gray-100 text-gray-500",
};

// ─── Margin status vs. target (Phase 4.4) ────────────────────────────────────

export type MarginStatus = "above_target" | "near_target" | "below_target" | "negative_margin" | "missing_data";

export const MARGIN_STATUS_LABELS: Record<MarginStatus, string> = {
  above_target: "מעל היעד",
  near_target: "קרוב ליעד",
  below_target: "מתחת ליעד",
  negative_margin: "הפסדי",
  missing_data: "חסרים נתונים",
};

export const MARGIN_STATUS_COLORS: Record<MarginStatus, string> = {
  above_target: "bg-green-100 text-green-800",
  near_target: "bg-yellow-100 text-yellow-800",
  below_target: "bg-orange-100 text-orange-800",
  negative_margin: "bg-red-100 text-red-800",
  missing_data: "bg-gray-100 text-gray-500",
};

export function getMarginStatus(
  snap: { gross_profit: number; gross_margin_percent: number; confidence_level: string },
  rates: { targetMarginPercentage: number; warningMarginPercentage: number }
): MarginStatus {
  if (snap.confidence_level === "missing_data") return "missing_data";
  if (snap.gross_profit < 0) return "negative_margin";
  if (snap.gross_margin_percent < rates.warningMarginPercentage) return "below_target";
  if (snap.gross_margin_percent < rates.targetMarginPercentage) return "near_target";
  return "above_target";
}

export interface InventoryConsumptionInput {
  itemId: string;
  quantity: number;
  costPrice: number | null;
}

export interface DiaryForProfitability {
  id: string;
  isApproved: boolean;
  crewCount: number;
  hasVehicle: boolean;
  vehicleCostOverride?: number | null;
  equipmentCost?: number;
  materialCost?: number;
  laborCost?: number;
}

export interface OrderProfitabilityInput {
  orderId: string;
  customerId?: string;
  revenue: number;
  diaries: DiaryForProfitability[];
  consumptions: InventoryConsumptionInput[];
  rates: CostRates;
}

export interface OrderProfitabilitySnapshot {
  orderId: string;
  customerId?: string;
  revenue: number;
  laborCost: number;
  materialCost: number;
  vehicleCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  otherCost: number;
  overheadCost: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPercent: number;
  confidenceLevel: ConfidenceLevel;
  missingData: MissingDataTag[];
  sourceData: Record<string, unknown>;
}

const ORDER_OVERHEAD_RATE = 0.12;

export function calculateOrderProfitability(
  input: OrderProfitabilityInput,
): OrderProfitabilitySnapshot {
  const { orderId, customerId, revenue, diaries, consumptions, rates } = input;
  const missing: MissingDataTag[] = [];

  if (revenue <= 0) missing.push("no_revenue");
  if (diaries.length === 0) missing.push("no_linked_diaries");
  if (diaries.length > 0 && !diaries.some(d => d.isApproved)) missing.push("no_approved_diary");

  // Labor
  let laborCost = 0;
  let hasCrew = false;
  for (const d of diaries) {
    if (d.laborCost != null) {
      laborCost += d.laborCost;
      if (d.crewCount > 0) hasCrew = true;
    } else if (d.crewCount > 0) {
      hasCrew = true;
      laborCost += d.crewCount * rates.workerDailyCost;
    }
  }
  if (diaries.length > 0 && !hasCrew) missing.push("no_crew_data");

  // Vehicle
  let vehicleCost = 0;
  let hasVehicle = false;
  for (const d of diaries) {
    if (d.hasVehicle) {
      hasVehicle = true;
      vehicleCost += d.vehicleCostOverride != null
        ? d.vehicleCostOverride
        : rates.vehicleDailyCost + rates.fuelCostPerDay;
    }
  }
  if (diaries.length > 0 && !hasVehicle) missing.push("no_vehicle_data");

  // Equipment
  const equipmentCost = diaries.reduce((s, d) => s + (d.equipmentCost ?? 0), 0);

  // Materials (diary-level + inventory consumptions)
  const diaryMaterialCost = diaries.reduce((s, d) => s + (d.materialCost ?? 0), 0);
  let inventoryMaterialCost = 0;
  let hasMissingCostPrice = false;
  for (const c of consumptions) {
    if (c.costPrice != null && c.costPrice > 0) {
      inventoryMaterialCost += c.quantity * c.costPrice;
    } else {
      hasMissingCostPrice = true;
    }
  }
  if (hasMissingCostPrice) missing.push("missing_cost_price");
  const materialCost = diaryMaterialCost + inventoryMaterialCost;
  if (consumptions.length === 0 && diaryMaterialCost === 0) missing.push("no_material_cost");

  const directCost = laborCost + vehicleCost + equipmentCost + materialCost;
  const overheadCost = directCost * ORDER_OVERHEAD_RATE;
  const totalCost = directCost + overheadCost;
  const grossProfit = revenue - totalCost;
  const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  let confidenceLevel: ConfidenceLevel;
  if (missing.includes("no_revenue") || missing.includes("no_linked_diaries")) {
    confidenceLevel = "missing_data";
  } else if (missing.length === 0) {
    confidenceLevel = "high";
  } else if (missing.includes("no_approved_diary")) {
    // No approved diary is always serious regardless of other missing tags
    confidenceLevel = "low";
  } else if (missing.length <= 2) {
    confidenceLevel = "medium";
  } else {
    confidenceLevel = "low";
  }

  return {
    orderId,
    customerId,
    revenue,
    laborCost,
    materialCost,
    vehicleCost,
    equipmentCost,
    subcontractorCost: 0,
    otherCost: 0,
    overheadCost,
    totalCost,
    grossProfit,
    grossMarginPercent,
    confidenceLevel,
    missingData: missing,
    sourceData: {
      diaryCount: diaries.length,
      consumptionCount: consumptions.length,
      approvedDiaryCount: diaries.filter(d => d.isApproved).length,
    },
  };
}
