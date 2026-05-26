import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { commandById } from "../skills/ceoManager/commands";
import { findAction } from "./catalog";
import type { LLMPlanResult } from "../llm/types";
import type { PlanExecution, StepResult } from "./types";

/**
 * Executes an agent plan. SERVER-ONLY. Hard safety: a step runs ONLY if it is `read_only` AND
 * maps to a known read-only command — anything else is SKIPPED (recorded honestly, never faked).
 * The LLM/planner can propose steps, but execution is gated to the existing read-only command set,
 * so no plan can ever mutate data or run arbitrary code.
 */
export async function executePlan(
  plan: LLMPlanResult,
  source: "deterministic" | "llm" = "deterministic",
): Promise<PlanExecution> {
  const db = getServiceSupabase();
  const steps: StepResult[] = [];

  for (const s of plan.steps) {
    if (s.safety !== "read_only") {
      steps.push({ skill: s.skill, action: s.action, ok: false, report: null, skippedReason: "not_read_only" });
      continue;
    }
    const action = findAction(s.skill, s.action);
    const cmd = action ? commandById(action.commandId) : null;
    if (!cmd) {
      steps.push({ skill: s.skill, action: s.action, ok: false, report: null, skippedReason: "unknown_action" });
      continue;
    }
    try {
      const report = await cmd.run(db);
      steps.push({ skill: s.skill, action: s.action, ok: report.ok, report });
    } catch (err) {
      steps.push({
        skill: s.skill,
        action: s.action,
        ok: false,
        report: { ok: false, title: action!.action, headline: `שגיאה: ${err instanceof Error ? err.message : "?"}`, details: [] },
      });
    }
  }

  return { goal: plan.goal, steps, ranSteps: steps.filter((x) => x.ok).length, source };
}

/** Format an executed plan into a concise Hebrew report for WhatsApp / activity feed. */
export function formatPlanReport(exec: PlanExecution, refId: string): string {
  const lines: string[] = [`🧭 דוח רב-שלבי — ${exec.goal} (#${refId})`, ""];
  let i = 1;
  for (const s of exec.steps) {
    if (s.ok && s.report) {
      lines.push(`${i}. ${s.report.title}: ${s.report.headline}`);
    } else if (s.skippedReason) {
      lines.push(`${i}. (דולג — ${s.skippedReason === "not_read_only" ? "פעולה לא קריאה-בלבד" : "פעולה לא מוכרת"})`);
    } else {
      lines.push(`${i}. ${s.report?.headline ?? "לא הושלם"}`);
    }
    i++;
  }
  lines.push("", `✅ ${exec.ranSteps}/${exec.steps.length} שלבים בוצעו · בדיקה בלבד, ללא שינויים.`, "🖥️ מתועד במרכז הפיקוד הדיגיטלי.");
  return lines.join("\n");
}
