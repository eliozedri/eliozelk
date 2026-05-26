import type { CommandReport } from "../skills/ceoManager/commands";
import type { LLMPlanResult, PlanStep } from "../llm/types";

/**
 * Agent Reasoning contracts. The PLAN shape is reused from the LLM layer (`LLMPlanResult`) so a
 * deterministic planner and an LLM planner produce the same structure. EXECUTION types describe
 * what the (server-only) runner did. Owner-only; read-only steps only; nothing is faked.
 */
export type { LLMPlanResult as AgentPlan, PlanStep };

export interface StepResult {
  skill: string;
  action: string;
  ok: boolean;
  /** null when the step was skipped (not read-only / unknown action) or errored. */
  report: CommandReport | null;
  skippedReason?: string;
}

export interface PlanExecution {
  goal: string;
  steps: StepResult[];
  ranSteps: number;
  source: "deterministic" | "llm";
}
