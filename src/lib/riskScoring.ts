// Deterministic per-order risk scoring — pure functions, no React.
// Risk score 0–100, level: low / medium / high / critical.
// Each factor explains its contribution so managers understand why an order is flagged.

import type { WorkOrder } from "@/types/workOrder";
import { openProblemsCount } from "@/types/workOrder";
import { getStageSlaColor } from "@/lib/workflowEngine";

export type RiskFactorType =
  | "sla_breach"
  | "urgent_priority"
  | "open_problems"
  | "chronic_loss_customer"
  | "unscheduled_installation"
  | "missing_crew"
  | "fabrication_issue"
  | "missing_scheduling";

export interface RiskFactor {
  type: RiskFactorType;
  label: string;
  contribution: number;
  severity: "critical" | "warn" | "info";
}

export interface OrderRiskScore {
  orderId: string;
  score: number;
  level: "low" | "medium" | "high" | "critical";
  factors: RiskFactor[];
}

export function computeOrderRiskScore(
  order: WorkOrder,
  customerRiskLevel: "green" | "amber" | "red",
  now = Date.now()
): OrderRiskScore {
  const isTerminal = order.status === "completed" || order.status === "cancelled";
  if (isTerminal) {
    return { orderId: order.id, score: 0, level: "low", factors: [] };
  }

  const factors: RiskFactor[] = [];

  // SLA breach in current stage
  const slaColor = getStageSlaColor(order, now);
  if (slaColor === "red") {
    factors.push({
      type: "sla_breach",
      label: "חריגה קריטית בזמן שלב",
      contribution: 40,
      severity: "critical",
    });
  } else if (slaColor === "yellow") {
    factors.push({
      type: "sla_breach",
      label: "עיכוב בזמן שלב",
      contribution: 20,
      severity: "warn",
    });
  }

  // Urgent priority
  if (order.priority === "urgent") {
    factors.push({
      type: "urgent_priority",
      label: "הזמנה דחופה",
      contribution: 15,
      severity: "warn",
    });
  }

  // Open problems
  const openProbs = openProblemsCount(order);
  if (openProbs > 0) {
    factors.push({
      type: "open_problems",
      label: `${openProbs} בעיות פתוחות`,
      contribution: Math.min(openProbs * 10, 30),
      severity: openProbs >= 3 ? "critical" : "warn",
    });
  }

  // Customer historical profitability risk
  if (customerRiskLevel === "red") {
    factors.push({
      type: "chronic_loss_customer",
      label: "לקוח עם היסטוריית הפסדים",
      contribution: 20,
      severity: "critical",
    });
  } else if (customerRiskLevel === "amber") {
    factors.push({
      type: "chronic_loss_customer",
      label: "לקוח עם מרווח נמוך",
      contribution: 10,
      severity: "warn",
    });
  }

  // Ready for installation without scheduled date
  if (order.status === "ready_installation" && !order.scheduledDate) {
    factors.push({
      type: "unscheduled_installation",
      label: "מוכן להתקנה ללא תאריך תיאום",
      contribution: 20,
      severity: "warn",
    });
  }

  // Ready for installation without crew assignment
  if (order.status === "ready_installation" && !order.assignedCrewId) {
    factors.push({
      type: "missing_crew",
      label: "לא שויך צוות להתקנה",
      contribution: 10,
      severity: "info",
    });
  }

  // Fabrication issue flag
  if (order.fabricationRequired && order.fabricationStatus === "issue") {
    factors.push({
      type: "fabrication_issue",
      label: "בעיה פתוחה בייצור",
      contribution: 25,
      severity: "critical",
    });
  }

  const score = Math.min(100, factors.reduce((s, f) => s + f.contribution, 0));
  const level: OrderRiskScore["level"] =
    score >= 76 ? "critical" :
    score >= 51 ? "high" :
    score >= 26 ? "medium" : "low";

  return { orderId: order.id, score, level, factors };
}

export function computeAllRiskScores(
  orders: WorkOrder[],
  customerRiskMap: Map<string, "green" | "amber" | "red">,
  now = Date.now()
): Map<string, OrderRiskScore> {
  const result = new Map<string, OrderRiskScore>();
  for (const order of orders) {
    const key = order.customer.trim().toLowerCase();
    const riskLevel = customerRiskMap.get(key) ?? "green";
    result.set(order.id, computeOrderRiskScore(order, riskLevel, now));
  }
  return result;
}
