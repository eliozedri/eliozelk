import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { writeAgentActivity, updateAgentRunStatus } from "@/lib/agents/scan-utils";
import { ceoTitle, ceoPriority } from "./intent";
import { createCeoRequest, closeCeoRequest } from "./store";
import { matchCommand, type ManagerCommand, type CommandReport } from "./commands";
import { planDeterministic } from "../../agent/planner";
import { actionsCatalogText } from "../../agent/catalog";
import { executePlan, formatPlanReport } from "../../agent/runner";
import { routePlan } from "../../llm/index";
import type { LLMPlanResult } from "../../llm/types";
import type { PlanExecution } from "../../agent/types";

/**
 * System-Manager dispatcher — the manager's "brain".
 *
 * A directive forwarded from Jarvis is handled in three tiers, all honest and read-only:
 *   1. single read-only command (matchCommand) — e.g. "כמה מוצרים ללא מחיר";
 *   2. multi-step Agent-Reasoning plan (LLM if enabled+safe, else deterministic known patterns)
 *      — e.g. "מה יכול לתקוע עבודות השבוע" → stuck/drafts/pricing/exceptions, summarized;
 *   3. otherwise a human `agent_task` is queued — never faked.
 *
 * Every tier records the JARVIS→manager directive and the result in `agent_activity_feed` so the
 * exchange surfaces in the Digital Command Center.
 */

const MANAGER_AGENT_ID = "ceo";
const MANAGER_AGENT_NAME = "מנהל פעילות";

export interface DispatchResult {
  kind: "command" | "plan" | "task";
  /** True when a read-only command/plan actually produced a result. */
  executed: boolean;
  queuedTask: boolean;
  command: ManagerCommand | null;
  report: CommandReport | null;
  planExecution: PlanExecution | null;
  masterItemId: string | null;
  title: string;
  priority: "high" | "normal";
  refId: string;
}

export async function dispatchManagerRequest(args: {
  text: string;
  sourcePhone: string;
  channel: string;
}): Promise<DispatchResult> {
  const db = getServiceSupabase();
  const title = ceoTitle(args.text);
  const priority = ceoPriority(args.text);

  // 1. File the directive (status starts in_progress — the manager is on it now).
  const masterItemId = await createCeoRequest({
    sourcePhone: args.sourcePhone,
    channel: args.channel,
    text: args.text,
    title,
    priority,
    status: "in_progress",
  });
  const refId = masterItemId ? masterItemId.slice(0, 8) : "—";

  // 2. Record the incoming JARVIS → manager directive in the command center.
  await writeAgentActivity(db, MANAGER_AGENT_ID, "directive", `📥 פנייה מ-JARVIS: ${title}`, {
    source: "jarvis_whatsapp",
    request: args.text,
    masterItemId,
    priority,
  }).catch(() => {});
  await updateAgentRunStatus(db, MANAGER_AGENT_ID, "active").catch(() => {});

  const base = { masterItemId, title, priority, refId };

  // ── Tier 1: single read-only command ─────────────────────────────────────────
  const command = matchCommand(args.text);
  if (command) {
    let report: CommandReport;
    try {
      report = await command.run(db);
    } catch (err) {
      report = { ok: false, title, headline: `שגיאה בביצוע: ${err instanceof Error ? err.message : String(err)}`, details: [] };
    }
    await updateAgentRunStatus(db, command.agentId, "idle").catch(() => {});
    const reportLine = `${report.ok ? "✅" : "⚠️"} ${report.title}: ${report.headline}`;
    await writeAgentActivity(db, command.agentId, "report", reportLine, {
      source: "jarvis_dispatch", command: command.id, requestedBy: "ceo", masterItemId, count: report.count ?? null, details: report.details,
    }).catch(() => {});
    await writeAgentActivity(db, MANAGER_AGENT_ID, "report", `📋 דוח מ-${command.agentName}: ${report.headline}`, {
      source: "jarvis_dispatch", command: command.id, delegatedTo: command.agentId, masterItemId,
    }).catch(() => {});
    await updateAgentRunStatus(db, MANAGER_AGENT_ID, "idle").catch(() => {});
    await closeCeoRequest(masterItemId, {
      status: report.ok ? "done" : "error",
      report: { command: command.id, agentId: command.agentId, headline: report.headline, count: report.count ?? null, details: report.details },
    });
    return { kind: "command", executed: report.ok, queuedTask: false, command, report, planExecution: null, ...base };
  }

  // ── Tier 2: multi-step Agent-Reasoning plan ──────────────────────────────────
  const planned = await buildPlan(args.text);
  if (planned) {
    const exec = await executePlan(planned.plan, planned.source);
    const okMost = exec.ranSteps > 0;
    await writeAgentActivity(db, MANAGER_AGENT_ID, "report", `🧭 דוח רב-שלבי: ${exec.goal} (${exec.ranSteps}/${exec.steps.length} שלבים)`, {
      source: "jarvis_dispatch", reasoning: planned.source, masterItemId,
      steps: exec.steps.map((s) => ({ action: s.action, ok: s.ok, headline: s.report?.headline ?? null })),
    }).catch(() => {});
    await updateAgentRunStatus(db, MANAGER_AGENT_ID, "idle").catch(() => {});
    await closeCeoRequest(masterItemId, {
      status: okMost ? "done" : "error",
      report: { plan: exec.goal, source: planned.source, ranSteps: exec.ranSteps, steps: exec.steps.map((s) => ({ action: s.action, ok: s.ok, headline: s.report?.headline ?? null })) },
    });
    return { kind: "plan", executed: okMost, queuedTask: false, command: null, report: null, planExecution: exec, ...base };
  }

  // ── Tier 3: queue a human task (honest, never faked) ─────────────────────────
  await queueManagerTask(db, { masterItemId, title, text: args.text, priority });
  await writeAgentActivity(db, MANAGER_AGENT_ID, "task_created", `🗂️ נפתחה משימת מנהל לטיפול ידני: ${title}`, {
    source: "jarvis_dispatch", masterItemId, priority,
  }).catch(() => {});
  await updateAgentRunStatus(db, MANAGER_AGENT_ID, "idle").catch(() => {});
  return { kind: "task", executed: false, queuedTask: true, command: null, report: null, planExecution: null, ...base };
}

/** Render the WhatsApp reply the owner receives back. */
export function formatDispatchReply(result: DispatchResult): string {
  if (result.kind === "plan" && result.planExecution) {
    return formatPlanReport(result.planExecution, result.refId);
  }
  if (result.kind === "command" && result.executed && result.report) {
    const r = result.report;
    return [
      `📋 דוח ביצוע — ${r.title} (#${result.refId})`,
      r.headline,
      ...(r.details.length ? ["", ...r.details] : []),
      "",
      `✅ בוצע ע״י ${result.command?.agentName ?? MANAGER_AGENT_NAME} · בדיקה בלבד, ללא שינויים.`,
      "🖥️ מתועד במרכז הפיקוד הדיגיטלי.",
    ].join("\n");
  }
  if (result.report && !result.report.ok) {
    return `נתקלתי בבעיה בביצוע "${result.title}" (#${result.refId}):\n${result.report.headline}\nתועד במרכז הפיקוד.`;
  }
  return (
    `קיבלתי (#${result.refId}). העברתי למנהל המערכת ופתחתי משימה לטיפול ידני` +
    (result.priority === "high" ? " (סומן דחוף 🔴)" : "") +
    `.\nלא זוהתה בדיקה אוטומטית מתאימה לבקשה הזו — היא מופיעה כעת במרכז הפיקוד הדיגיטלי לטיפול.`
  );
}

// ── Agent-Reasoning plan builder (LLM if safely enabled, else deterministic) ────

async function buildPlan(text: string): Promise<{ plan: LLMPlanResult; source: "llm" | "deterministic" } | null> {
  // LLM planner goes through the budget/paid-guarded router; returns null when LLM is off.
  const viaLlm = await routePlan({ text, role: "master", channel: "whatsapp", actionsCatalog: actionsCatalogText() });
  if (viaLlm?.plan?.steps?.length) return { plan: viaLlm.plan, source: "llm" };
  const det = planDeterministic(text);
  if (det) return { plan: det, source: "deterministic" };
  return null;
}

// ── Human-task queue for non-executable directives ──────────────────────────────

async function queueManagerTask(
  db: ReturnType<typeof getServiceSupabase>,
  args: { masterItemId: string | null; title: string; text: string; priority: "high" | "normal" },
): Promise<void> {
  const { error } = await db.from("agent_tasks").insert({
    agent_id: MANAGER_AGENT_ID,
    related_entity_type: "jarvis_request",
    related_entity_id: args.masterItemId ?? "unknown",
    title: `פנייה מ-JARVIS: ${args.title}`,
    description: args.text,
    priority: args.priority === "high" ? "high" : "normal",
    status: "open",
    recommended_action: "סקור את הבקשה והפעל את הסוכן/המחלקה הרלוונטיים, או בצע ידנית.",
    requires_approval: false,
  });
  if (error) console.error("[jarvis:ceo] queueManagerTask failed:", error.message);
}
