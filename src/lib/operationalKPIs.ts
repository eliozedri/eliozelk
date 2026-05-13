// Operational intelligence calculations — pure functions, no React.
// Designed to scale into per-crew, per-project, and SLA analytics without architectural refactoring.

import type { WorkDiary } from "@/types/workDiary";
import type { WorkOrder } from "@/types/workOrder";
import type { Crew } from "@/types/crew";
import type { CostRates } from "@/types/costRates";
import {
  calculateProfitability,
  aggregateProfitability,
  type ProfitabilityResult,
  type AggregatedProfitability,
} from "./profitability";

// ─── Per-crew analytics ──────────────────────────────────────────────────────

export interface CrewMetrics {
  crewId: string | null;           // null = unmatched / legacy diary
  crewName: string;
  leaderName: string;
  totalDays: number;
  totalRevenue: number;
  totalCost: number;
  totalNetProfit: number;
  avgMarginPct: number;
  totalHours: number;
  totalExecutionHours: number;
  avgTimeEfficiencyPct: number;
  avgTravelTimePct: number;
  totalWorkerDays: number;         // sum(totalWorkers per diary day)
  revenuePerWorkerDay: number;
  profitableDays: number;
  lossDays: number;
}

// ─── Per-order profitability rollup ──────────────────────────────────────────

export interface OrderProfitabilitySummary {
  orderId: string;
  orderNumber: string;
  customerName: string;
  orderStatus: string;
  diaryCount: number;
  approvedDiaryCount: number;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  marginPct: number;
  totalActualHours: number;
  estimatedHours: number | null;
  hoursVariance: number | null;    // actual - estimated; positive = over schedule
  scheduledDate: string | null;
  executionDates: string[];
}

// ─── Weekly trend bucket ─────────────────────────────────────────────────────

export interface WeeklyBucket {
  weekKey: string;                 // ISO date of Sunday (week start)
  label: string;                   // "שבוע 18" or date range
  diaryCount: number;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  avgMarginPct: number;
}

// ─── Labor utilization ───────────────────────────────────────────────────────

export interface LaborUtilization {
  totalWorkerDays: number;
  avgWorkersPerDay: number;
  totalFieldHours: number;
  totalExecutionHours: number;
  totalNonProductiveHours: number;
  avgTimeEfficiencyPct: number;
  avgTravelTimePct: number;
  revenuePerWorkerDay: number;
  costPerWorkerDay: number;
}

// ─── Execution variance ──────────────────────────────────────────────────────

export interface ExecutionVariance {
  measurableOrders: number;
  avgVarianceHours: number;
  overrunCount: number;            // actual > estimated × 1.20
  onTimeCount: number;
  worstOverruns: Array<{ orderNumber: string; varianceHours: number; customerName: string }>;
}

// ─── Data completeness ───────────────────────────────────────────────────────

export interface DataQuality {
  totalDiaries: number;
  missingBilling: number;
  missingCrew: number;
  missingTime: number;
  missingOrderLink: number;
  completenessScore: number;       // 0–100
}

// ─── Customer profitability ──────────────────────────────────────────────────

export interface CustomerMetrics {
  customerName: string;
  orderCount: number;
  diaryCount: number;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  avgMarginPct: number;
  avgRevenuePerOrder: number;
  riskLevel: "green" | "amber" | "red";
  lastActivity: string;          // most recent execution date ISO
}

// ─── Billing leakage ────────────────────────────────────────────────────────

export interface BillingLeakage {
  uninvoicedCompletedOrders: number;
  uninvoicedEstimatedRevenue: number;  // sum of linked diary billedAmounts
  approvedDiariesWithoutBilling: number;
  submittedDiariesWithoutBilling: number;
  totalLeakageEstimate: number;
  oldestUninvoicedDays: number;
}

// ─── Trend summary ───────────────────────────────────────────────────────────

export interface TrendSummary {
  revenueDirection: "up" | "flat" | "down";
  revenueChangePct: number;            // % change recent half vs prior half
  marginDirection: "up" | "flat" | "down";
  marginChangePct: number;
  throughputDirection: "up" | "flat" | "down";
  throughputChangePct: number;
  forecastNextWeekRevenue: number | null;
  dataWeeks: number;
}

// ─── Top-level structure ─────────────────────────────────────────────────────

export interface OperationalKPIs {
  global: AggregatedProfitability;
  byCrew: CrewMetrics[];
  byOrder: OrderProfitabilitySummary[];
  byCustomer: CustomerMetrics[];
  byWeek: WeeklyBucket[];
  labor: LaborUtilization;
  executionVariance: ExecutionVariance;
  dataQuality: DataQuality;
  billingLeakage: BillingLeakage;
  trendSummary: TrendSummary;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function totalDiaryHours(diary: WorkDiary): number {
  if (!diary.startTime || !diary.endTime) return 0;
  const [sh, sm] = diary.startTime.split(":").map(Number);
  const [eh, em] = diary.endTime.split(":").map(Number);
  if (isNaN(sh) || isNaN(eh)) return 0;
  const total = (eh + em / 60) - (sh + sm / 60);
  return total > 0 ? total : 0;
}

function getWeekSunday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function weekLabel(sundayIso: string): string {
  const d = new Date(sundayIso + "T00:00:00");
  const sat = new Date(d);
  sat.setDate(d.getDate() + 5); // Saturday
  const fmt = (x: Date) => x.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
  return `${fmt(d)}–${fmt(sat)}`;
}

function trendDir(pct: number): "up" | "flat" | "down" {
  if (pct > 5) return "up";
  if (pct < -5) return "down";
  return "flat";
}

function halfChange(values: number[]): number {
  const n = values.length;
  if (n < 4) return 0;
  const mid = Math.floor(n / 2);
  const prior = values.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const recent = values.slice(n - mid).reduce((a, b) => a + b, 0) / mid;
  return prior !== 0 ? ((recent - prior) / Math.abs(prior)) * 100 : 0;
}

function linearForecast(values: number[]): number | null {
  const n = values.length;
  if (n < 3) return null;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  return Math.max(0, meanY + slope * (n - meanX));
}

function matchCrew(
  diary: WorkDiary,
  orderMap: Map<string, WorkOrder>,
  crewMap: Map<string, Crew>,
  crewByLeader: Map<string, Crew>
): { crewId: string | null; crewName: string; leaderName: string } {
  if (diary.orderId) {
    const order = orderMap.get(diary.orderId);
    if (order?.assignedCrewId) {
      const crew = crewMap.get(order.assignedCrewId);
      if (crew) return { crewId: crew.id, crewName: crew.name, leaderName: crew.leader };
    }
  }
  const leader = diary.crewLeaderName?.trim();
  if (leader) {
    const crew = crewByLeader.get(leader.toLowerCase());
    if (crew) return { crewId: crew.id, crewName: crew.name, leaderName: crew.leader };
    return { crewId: null, crewName: leader, leaderName: leader };
  }
  return { crewId: null, crewName: "לא ידוע", leaderName: "לא ידוע" };
}

// ─── Main computation entry point ────────────────────────────────────────────

export function computeOperationalKPIs(
  diaries: WorkDiary[],
  orders: WorkOrder[],
  crews: Crew[],
  rates: CostRates,
  weekCount = 12
): OperationalKPIs {
  // Build lookup maps once
  const orderMap = new Map(orders.map(o => [o.id, o]));
  const crewMap = new Map(crews.map(c => [c.id, c]));
  const crewByLeader = new Map(crews.map(c => [c.leader.toLowerCase(), c]));

  // Compute profitability for every diary once (O(n) pass)
  const results: Array<{ diary: WorkDiary; result: ProfitabilityResult }> =
    diaries.map(d => ({ diary: d, result: calculateProfitability(d, rates) }));

  // ── Global aggregate ──
  const global = aggregateProfitability(results.map(r => r.result));

  // ── Per-crew ──────────────────────────────────────────────────────────────
  const crewBuckets = new Map<string, Array<{ diary: WorkDiary; result: ProfitabilityResult }>>();

  for (const r of results) {
    const { crewId, crewName, leaderName } = matchCrew(r.diary, orderMap, crewMap, crewByLeader);
    const key = crewId ?? `__leader__${leaderName}`;
    if (!crewBuckets.has(key)) crewBuckets.set(key, []);
    crewBuckets.get(key)!.push(r);
  }

  const byCrew: CrewMetrics[] = [];
  for (const [key, items] of crewBuckets) {
    const { crewId, crewName, leaderName } = matchCrew(items[0].diary, orderMap, crewMap, crewByLeader);
    const agg = aggregateProfitability(items.map(i => i.result));
    const totalWorkerDays = items.reduce((s, i) => s + i.result.totalWorkers, 0);
    const totalExecHours = items.reduce((s, i) => s + i.result.executionHours, 0);
    const totalHrs = items.reduce((s, i) => s + i.result.totalHours, 0);
    const avgTimeEff = items.length > 0
      ? items.reduce((s, i) => s + i.result.timeEfficiencyPct, 0) / items.length
      : 0;
    const avgTravel = items.length > 0
      ? items.reduce((s, i) => s + i.result.travelTimePct, 0) / items.length
      : 0;
    byCrew.push({
      crewId: crewId ?? (key.startsWith("__leader__") ? null : key),
      crewName,
      leaderName,
      totalDays: agg.totalDays,
      totalRevenue: agg.totalRevenue,
      totalCost: agg.totalCost,
      totalNetProfit: agg.totalNetProfit,
      avgMarginPct: agg.avgMarginPercentage,
      totalHours: totalHrs,
      totalExecutionHours: totalExecHours,
      avgTimeEfficiencyPct: avgTimeEff,
      avgTravelTimePct: avgTravel,
      totalWorkerDays,
      revenuePerWorkerDay: totalWorkerDays > 0 ? agg.totalRevenue / totalWorkerDays : 0,
      profitableDays: agg.profitableDays,
      lossDays: agg.lossDays,
    });
  }
  byCrew.sort((a, b) => b.totalNetProfit - a.totalNetProfit);

  // ── Per-order ─────────────────────────────────────────────────────────────
  const orderBuckets = new Map<string, Array<{ diary: WorkDiary; result: ProfitabilityResult }>>();

  for (const r of results) {
    if (!r.diary.orderId) continue;
    if (!orderBuckets.has(r.diary.orderId)) orderBuckets.set(r.diary.orderId, []);
    orderBuckets.get(r.diary.orderId)!.push(r);
  }

  const byOrder: OrderProfitabilitySummary[] = [];
  for (const [orderId, items] of orderBuckets) {
    const order = orderMap.get(orderId);
    if (!order) continue;
    const agg = aggregateProfitability(items.map(i => i.result));
    const totalActualHours = items.reduce((s, i) => {
      const h = i.diary.executionTimeHours != null
        ? i.diary.executionTimeHours
        : totalDiaryHours(i.diary);
      return s + h;
    }, 0);
    const estimatedHours = order.estimatedExecutionHours ?? null;
    const hoursVariance = estimatedHours != null && totalActualHours > 0
      ? totalActualHours - estimatedHours
      : null;
    byOrder.push({
      orderId,
      orderNumber: order.orderNumber,
      customerName: order.customer,
      orderStatus: order.status,
      diaryCount: items.length,
      approvedDiaryCount: items.filter(i => i.diary.approvalStatus === "approved").length,
      totalRevenue: agg.totalRevenue,
      totalCost: agg.totalCost,
      netProfit: agg.totalNetProfit,
      marginPct: agg.avgMarginPercentage,
      totalActualHours,
      estimatedHours,
      hoursVariance,
      scheduledDate: order.scheduledDate ?? null,
      executionDates: items
        .map(i => i.diary.executionDate)
        .filter(Boolean)
        .sort(),
    });
  }
  byOrder.sort((a, b) => a.netProfit - b.netProfit); // worst first

  // ── Weekly trend ─────────────────────────────────────────────────────────
  const weekBuckets = new Map<string, Array<ProfitabilityResult>>();
  for (const r of results) {
    if (!r.diary.executionDate) continue;
    const key = getWeekSunday(r.diary.executionDate);
    if (!weekBuckets.has(key)) weekBuckets.set(key, []);
    weekBuckets.get(key)!.push(r.result);
  }

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - (now.getDay()) - (weekCount - 1) * 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const byWeek: WeeklyBucket[] = [];
  for (const [key, items] of weekBuckets) {
    if (key < cutoffStr) continue;
    const agg = aggregateProfitability(items);
    byWeek.push({
      weekKey: key,
      label: weekLabel(key),
      diaryCount: items.length,
      totalRevenue: agg.totalRevenue,
      totalCost: agg.totalCost,
      netProfit: agg.totalNetProfit,
      avgMarginPct: agg.avgMarginPercentage,
    });
  }
  byWeek.sort((a, b) => a.weekKey.localeCompare(b.weekKey));

  // ── Labor utilization ─────────────────────────────────────────────────────
  const totalWorkerDays = results.reduce((s, r) => s + r.result.totalWorkers, 0);
  const totalFieldHours = results.reduce((s, r) => s + r.result.totalHours, 0);
  const totalExecHours = results.reduce((s, r) => s + r.result.executionHours, 0);
  const totalNonProdHours = results.reduce((s, r) => s + r.result.nonBillableHours, 0);
  const n = results.length;

  const labor: LaborUtilization = {
    totalWorkerDays,
    avgWorkersPerDay: n > 0 ? totalWorkerDays / n : 0,
    totalFieldHours,
    totalExecutionHours: totalExecHours,
    totalNonProductiveHours: totalNonProdHours,
    avgTimeEfficiencyPct: n > 0
      ? results.reduce((s, r) => s + r.result.timeEfficiencyPct, 0) / n
      : 0,
    avgTravelTimePct: n > 0
      ? results.reduce((s, r) => s + r.result.travelTimePct, 0) / n
      : 0,
    revenuePerWorkerDay: totalWorkerDays > 0 ? global.totalRevenue / totalWorkerDays : 0,
    costPerWorkerDay: totalWorkerDays > 0 ? global.totalCost / totalWorkerDays : 0,
  };

  // ── Execution variance ────────────────────────────────────────────────────
  const varianceItems = byOrder.filter(o => o.hoursVariance !== null);
  const overruns = varianceItems.filter(o => o.hoursVariance! > (o.estimatedHours ?? 0) * 0.2);
  const onTime = varianceItems.filter(o => o.hoursVariance! <= (o.estimatedHours ?? 0) * 0.2);
  const avgVar = varianceItems.length > 0
    ? varianceItems.reduce((s, o) => s + o.hoursVariance!, 0) / varianceItems.length
    : 0;

  const executionVariance: ExecutionVariance = {
    measurableOrders: varianceItems.length,
    avgVarianceHours: avgVar,
    overrunCount: overruns.length,
    onTimeCount: onTime.length,
    worstOverruns: [...overruns]
      .sort((a, b) => b.hoursVariance! - a.hoursVariance!)
      .slice(0, 5)
      .map(o => ({ orderNumber: o.orderNumber, varianceHours: o.hoursVariance!, customerName: o.customerName })),
  };

  // ── Data quality ──────────────────────────────────────────────────────────
  const missingBilling = diaries.filter(d => !d.billedAmount && d.isBillable !== false).length;
  const missingCrew = diaries.filter(d => !d.crewLeaderName?.trim()).length;
  const missingTime = diaries.filter(d => !d.startTime || !d.endTime).length;
  const missingOrderLink = diaries.filter(d => d.status === "submitted" && !d.orderId).length;
  const total = diaries.length;

  // Score: 100 minus weighted penalties
  const penalty = total > 0
    ? (missingBilling / total) * 40 +
      (missingCrew / total) * 25 +
      (missingTime / total) * 20 +
      (missingOrderLink / total) * 15
    : 0;
  const completenessScore = Math.max(0, Math.round(100 - penalty));

  const dataQuality: DataQuality = {
    totalDiaries: total,
    missingBilling,
    missingCrew,
    missingTime,
    missingOrderLink,
    completenessScore,
  };

  // ── Customer metrics ─────────────────────────────────────────────────────
  const customerBuckets = new Map<string, OrderProfitabilitySummary[]>();
  for (const o of byOrder) {
    if (!customerBuckets.has(o.customerName)) customerBuckets.set(o.customerName, []);
    customerBuckets.get(o.customerName)!.push(o);
  }

  const byCustomer: CustomerMetrics[] = [];
  for (const [customerName, orders] of customerBuckets) {
    const totalRevenue = orders.reduce((s, o) => s + o.totalRevenue, 0);
    const totalCost = orders.reduce((s, o) => s + o.totalCost, 0);
    const netProfit = totalRevenue - totalCost;
    const avgMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const diaryCount = orders.reduce((s, o) => s + o.diaryCount, 0);
    const lastActivity = orders
      .flatMap(o => o.executionDates)
      .sort()
      .at(-1) ?? "";
    const riskLevel: CustomerMetrics["riskLevel"] =
      avgMarginPct < -5 ? "red" :
      avgMarginPct < 10 ? "amber" : "green";

    byCustomer.push({
      customerName,
      orderCount: orders.length,
      diaryCount,
      totalRevenue,
      totalCost,
      netProfit,
      avgMarginPct,
      avgRevenuePerOrder: orders.length > 0 ? totalRevenue / orders.length : 0,
      riskLevel,
      lastActivity,
    });
  }
  byCustomer.sort((a, b) => b.netProfit - a.netProfit);

  // ── Billing leakage ───────────────────────────────────────────────────────
  const diaryByOrderId = new Map<string, WorkDiary[]>();
  for (const d of diaries) {
    if (d.orderId) {
      if (!diaryByOrderId.has(d.orderId)) diaryByOrderId.set(d.orderId, []);
      diaryByOrderId.get(d.orderId)!.push(d);
    }
  }

  const uninvoicedOrders = orders.filter(o =>
    o.status === "completed" &&
    !o.invoicedAt &&
    (!o.accountingStatus || o.accountingStatus === "pending")
  );
  const uninvoicedEstimatedRevenue = uninvoicedOrders.reduce((sum, o) => {
    const linked = diaryByOrderId.get(o.id) ?? [];
    return sum + linked.reduce((s, d) => s + (d.billedAmount ?? 0), 0);
  }, 0);

  const nowMs = Date.now();
  const oldestUninvoicedDays = uninvoicedOrders.length > 0
    ? Math.round(Math.max(...uninvoicedOrders.map(o =>
        (nowMs - new Date(o.updatedAt).getTime()) / 86_400_000
      )))
    : 0;

  const approvedNoBilling = diaries.filter(
    d => d.approvalStatus === "approved" && !d.billedAmount && d.isBillable !== false
  ).length;
  const submittedNoBilling = diaries.filter(
    d => d.status === "submitted" && !d.billedAmount && d.isBillable !== false
  ).length;

  const billingLeakage: BillingLeakage = {
    uninvoicedCompletedOrders: uninvoicedOrders.length,
    uninvoicedEstimatedRevenue,
    approvedDiariesWithoutBilling: approvedNoBilling,
    submittedDiariesWithoutBilling: submittedNoBilling,
    totalLeakageEstimate: uninvoicedEstimatedRevenue,
    oldestUninvoicedDays,
  };

  // ── Trend summary ─────────────────────────────────────────────────────────
  const revenueValues = byWeek.map(b => b.totalRevenue);
  const marginValues = byWeek.map(b => b.avgMarginPct);
  const countValues = byWeek.map(b => b.diaryCount);
  const revChangePct = halfChange(revenueValues);
  const margChangePct = halfChange(marginValues);
  const countChangePct = halfChange(countValues);

  const trendSummary: TrendSummary = {
    revenueDirection: trendDir(revChangePct),
    revenueChangePct: revChangePct,
    marginDirection: trendDir(margChangePct),
    marginChangePct: margChangePct,
    throughputDirection: trendDir(countChangePct),
    throughputChangePct: countChangePct,
    forecastNextWeekRevenue: linearForecast(revenueValues),
    dataWeeks: byWeek.length,
  };

  return {
    global, byCrew, byOrder, byCustomer, byWeek,
    labor, executionVariance, dataQuality,
    billingLeakage, trendSummary,
  };
}
