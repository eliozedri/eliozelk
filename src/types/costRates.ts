// Central cost rate configuration — all profitability calculations derive from here.
// Stored in localStorage: elkayam_cost_rates

export interface CostRates {
  // ─── Labor ──────────────────────────────────────────────────
  workerDailyCost: number;       // ₪ per worker per day
  teamLeaderDailyCost: number;   // ₪ for the crew leader per day
  workerHourlyCost: number;      // ₪ per worker per hour (overtime)

  // ─── Vehicle ────────────────────────────────────────────────
  vehicleDailyCost: number;      // base vehicle allocation per day
  fuelCostPerDay: number;        // average fuel per dispatch day
  vehicleCostPerKm: number;      // optional: per-km cost if distance tracked

  // ─── Equipment ──────────────────────────────────────────────
  equipmentDailyCost: number;    // average heavy equipment day-rate

  // ─── Overhead ───────────────────────────────────────────────
  overheadPercentage: number;    // % added on top of direct costs
  fixedDailyOverhead: number;    // ₪ fixed overhead per day (office, management)

  // ─── Management thresholds ──────────────────────────────────
  minDailyBillingAmount: number; // ₪ minimum acceptable daily revenue
  targetMarginPercentage: number;   // % desired net profit margin
  warningMarginPercentage: number;  // % — below this triggers warning
  lossThresholdPercentage: number;  // % — below this (usually 0) triggers loss alert

  updatedAt: string;
}

export const DEFAULT_COST_RATES: CostRates = {
  workerDailyCost: 450,
  teamLeaderDailyCost: 650,
  workerHourlyCost: 60,
  vehicleDailyCost: 350,
  fuelCostPerDay: 160,
  vehicleCostPerKm: 2.5,
  equipmentDailyCost: 250,
  overheadPercentage: 18,
  fixedDailyOverhead: 120,
  minDailyBillingAmount: 3000,
  targetMarginPercentage: 28,
  warningMarginPercentage: 12,
  lossThresholdPercentage: 0,
  updatedAt: new Date().toISOString(),
};

export const COST_RATE_LABELS: Record<keyof Omit<CostRates, "updatedAt">, string> = {
  workerDailyCost: "עלות עובד ליום (₪)",
  teamLeaderDailyCost: "עלות ראש צוות ליום (₪)",
  workerHourlyCost: "עלות עובד לשעה — שעות נוספות (₪)",
  vehicleDailyCost: "עלות רכב ליום (₪)",
  fuelCostPerDay: "דלק ממוצע ליום (₪)",
  vehicleCostPerKm: "עלות ק״מ (₪)",
  equipmentDailyCost: "עלות ציוד/מכונות ליום (₪)",
  overheadPercentage: "תקורה באחוזים (%)",
  fixedDailyOverhead: "תקורה קבועה ליום (₪)",
  minDailyBillingAmount: "מינימום חיוב יומי (₪)",
  targetMarginPercentage: "יעד רווחיות (%)",
  warningMarginPercentage: "סף אזהרה — רווחיות (%)",
  lossThresholdPercentage: "סף הפסד (%)",
};
