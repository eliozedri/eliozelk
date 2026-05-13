// Operational forecasting — pure functions, no React.
// Week windows use Sunday–Saturday (Israeli business week convention).

import type { WorkOrder } from "@/types/workOrder";
import type { Crew } from "@/types/crew";
import type { TrendSummary, BillingLeakage } from "@/lib/operationalKPIs";
import type { OrderRiskScore } from "@/lib/riskScoring";

export interface OperationalForecast {
  nextWeekRevenueForecast: number | null;
  pendingBillingRevenue: number;
  crewCapacity: {
    totalHours: number;
    scheduledHours: number;
    utilizationPct: number;
    availableHours: number;
  };
  completionForecast: {
    thisWeek: number;
    nextWeek: number;
  };
  highRiskCount: number;
  criticalRiskCount: number;
}

function getWeekWindow(offsetWeeks: number): { start: string; end: string } {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay() + offsetWeeks * 7);
  sunday.setHours(0, 0, 0, 0);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return {
    start: sunday.toISOString().slice(0, 10),
    end: saturday.toISOString().slice(0, 10),
  };
}

export function computeForecast(
  orders: WorkOrder[],
  crews: Crew[],
  riskScores: Map<string, OrderRiskScore>,
  trendSummary: TrendSummary,
  billingLeakage: BillingLeakage
): OperationalForecast {
  const thisWeek = getWeekWindow(0);
  const nextWeek = getWeekWindow(1);

  const active = orders.filter(
    o => o.status !== "completed" && o.status !== "cancelled"
  );

  // Scheduled completions (orders with scheduledDate within each window)
  const thisWeekCount = active.filter(
    o => o.scheduledDate &&
      o.scheduledDate >= thisWeek.start &&
      o.scheduledDate <= thisWeek.end
  ).length;
  const nextWeekCount = active.filter(
    o => o.scheduledDate &&
      o.scheduledDate >= nextWeek.start &&
      o.scheduledDate <= nextWeek.end
  ).length;

  // Crew capacity: sum of each crew's dailyCapacityHours × 5 working days
  const activeCrews = crews.filter(c => c.active);
  const totalHours = activeCrews.reduce(
    (s, c) => s + c.dailyCapacityHours * 5,
    0
  );

  // Scheduled execution hours for next week
  const scheduledHours = active
    .filter(
      o => o.scheduledDate &&
        o.scheduledDate >= nextWeek.start &&
        o.scheduledDate <= nextWeek.end
    )
    .reduce((s, o) => s + (o.estimatedExecutionHours ?? 4), 0);

  const utilizationPct = totalHours > 0
    ? Math.min(100, (scheduledHours / totalHours) * 100)
    : 0;

  // Risk counts (active orders only)
  let highRiskCount = 0;
  let criticalRiskCount = 0;
  for (const order of active) {
    const rs = riskScores.get(order.id);
    if (rs?.level === "critical") criticalRiskCount++;
    else if (rs?.level === "high") highRiskCount++;
  }

  return {
    nextWeekRevenueForecast: trendSummary.forecastNextWeekRevenue,
    pendingBillingRevenue: billingLeakage.totalLeakageEstimate,
    crewCapacity: {
      totalHours,
      scheduledHours,
      utilizationPct,
      availableHours: Math.max(0, totalHours - scheduledHours),
    },
    completionForecast: {
      thisWeek: thisWeekCount,
      nextWeek: nextWeekCount,
    },
    highRiskCount,
    criticalRiskCount,
  };
}
