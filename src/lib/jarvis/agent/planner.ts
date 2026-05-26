import type { LLMPlanResult, PlanStep } from "../llm/types";

/**
 * Deterministic planner for known multi-step owner requests. PURE. This is the safe fallback for
 * Agent Reasoning when no LLM is enabled (our current runtime) — it recognizes a few high-value
 * patterns and composes them from existing READ-ONLY actions. An LLM planner (index.routePlan)
 * can produce richer plans later behind the same `LLMPlanResult` shape; both feed the same runner.
 */

function step(action: string): PlanStep {
  return { skill: "operations", action, parameters: {}, safety: "read_only" };
}

const RISK_REPORT =
  /סיכון|מה\s+(יכול\s+)?לתקוע|לתקוע\s+(את\s+)?ה?עבודות|דוח\s+תפעולי|בעיות\s+תפעוליות|מה\s+דחוף|מה\s+תקוע\s+השבוע|risk\s*report/i;
const ORDER_INVENTORY = /(מלאי.*הזמנ)|(הזמנ.*מלאי)|order.*inventory|inventory.*order|מלאי\s+ו?הזמנות/i;
const FULL_OVERVIEW = /סקירה\s+כללית\s+מלאה|תמונת\s+מצב\s+מלאה|מצב\s+כללי\s+מלא|דוח\s+מנהלים|full\s+overview/i;

/** Returns a deterministic plan for a recognized pattern, or null if none matches. */
export function planDeterministic(text: string): LLMPlanResult | null {
  const t = (text ?? "").trim();
  if (!t) return null;

  if (FULL_OVERVIEW.test(t)) {
    return {
      goal: "תמונת מצב ניהולית מלאה",
      steps: [step("stuck_orders"), step("open_orders_overview"), step("pending_drafts"), step("inventory_low_stock"), step("items_missing_price"), step("fleet_unusable_equipment"), step("exceptions_overview")],
      requiresApproval: false,
      riskLevel: "low",
    };
  }
  if (RISK_REPORT.test(t)) {
    return {
      goal: "דוח סיכונים תפעולי — מה עלול לתקוע עבודות",
      steps: [step("stuck_orders"), step("pending_drafts"), step("inventory_low_stock"), step("items_missing_price"), step("fleet_unusable_equipment"), step("exceptions_overview")],
      requiresApproval: false,
      riskLevel: "low",
    };
  }
  if (ORDER_INVENTORY.test(t)) {
    return {
      goal: "סיכון הזמנות מול מלאי/תמחור",
      steps: [step("open_orders_overview"), step("inventory_low_stock"), step("items_missing_price"), step("pending_drafts")],
      requiresApproval: false,
      riskLevel: "low",
    };
  }
  return null;
}

/** True if the text looks like a multi-step reasoning request (used to decide whether to plan). */
export function looksLikePlanRequest(text: string): boolean {
  return planDeterministic(text) != null;
}
