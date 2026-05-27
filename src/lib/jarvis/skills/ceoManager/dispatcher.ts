import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { writeAgentActivity, updateAgentRunStatus } from "@/lib/agents/scan-utils";
import { ceoTitle, ceoPriority } from "./intent";
import { createCeoRequest, closeCeoRequest } from "./store";
import { commandById, type ManagerCommand, type CommandReport } from "./commands";
import { executePlan, formatPlanReport } from "../../agent/runner";
import { departmentFor } from "../../departments";
import { logBrainDecision } from "../../brainLog";
import { recordBrainAudit } from "../../audit";
import { createCapabilityRequest } from "../../capabilities";
import { loadLlmConfig } from "../../llm/config";
import { decideBrain, type BrainDecision } from "../../brain";
import type { PlanExecution } from "../../agent/types";

/**
 * System-Manager EXECUTOR. It does not decide — `brain.ts` already produced a `BrainDecision`.
 * This executes that decision honestly:
 *   - clarification        → ask the question (no command runs);
 *   - routine              → run a multi-step read-only plan;
 *   - action (command)     → run the resolved read-only command (verified answer);
 *   - pending department   → the owning department has no verified data source → file an honest
 *                            pending request to that department's agent and say what's missing.
 * Every path records the JARVIS→department exchange in the command center. Nothing is faked.
 */

const MANAGER_AGENT_ID = "ceo";

export interface DispatchResult {
  kind: "command" | "plan" | "clarification" | "pending_department" | "capability_request";
  decision: BrainDecision;
  executed: boolean;
  command: ManagerCommand | null;
  report: CommandReport | null;
  planExecution: PlanExecution | null;
  capabilityRequestId: string | null;
  masterItemId: string | null;
  title: string;
  priority: "high" | "normal";
  refId: string;
}

export interface DispatchCtx {
  text: string;
  sourcePhone: string;
  channel: string;
  msgId?: string;
  mediaPresent?: boolean;
  messageType?: string;
}

/** Convenience for the ceo_wait / skill path: reason then execute. */
export async function dispatchManagerRequest(ctx: DispatchCtx): Promise<DispatchResult> {
  const decision = await decideBrain({ text: ctx.text, role: "master", channel: "whatsapp" });
  return executeManagerDecision(decision, ctx);
}

export async function executeManagerDecision(decision: BrainDecision, ctx: DispatchCtx): Promise<DispatchResult> {
  const result = await runManagerDecision(decision, ctx);
  // Persist the full incoming→decision→action→outgoing trail (best-effort; covers free-text + ceo_wait).
  await recordBrainAudit({
    decision, senderRole: "master", channel: ctx.channel, msgId: ctx.msgId,
    inboundText: ctx.text, outgoingSummary: formatDispatchReply(result),
    safetyResult: decision.requiresClarification ? "clarify" : "accept",
    capabilityRequestId: result.capabilityRequestId,
    messageType: ctx.messageType ?? "text", mediaPresent: ctx.mediaPresent ?? false,
  }).catch(() => {});
  return result;
}

async function runManagerDecision(decision: BrainDecision, ctx: DispatchCtx): Promise<DispatchResult> {
  const db = getServiceSupabase();
  const title = ceoTitle(ctx.text);
  const priority = ceoPriority(ctx.text);
  const masterItemId = await createCeoRequest({ sourcePhone: ctx.sourcePhone, channel: ctx.channel, text: ctx.text, title, priority, status: "in_progress" });
  const refId = masterItemId ? masterItemId.slice(0, 8) : "—";
  const base = { decision, masterItemId, title, priority, refId };

  const resolvedCmd = decision.action ? commandById(decision.action) : null;
  const primaryAgent = resolvedCmd?.agentId ?? decision.targetAgents[0] ?? MANAGER_AGENT_ID;

  logBrainDecision({
    role: "master", channel: ctx.channel, llmEnabled: loadLlmConfig().enabled, provider: decision.provider,
    source: decision.source, intent: decision.intent, coarseIntent: decision.coarseIntent,
    businessDomain: decision.businessDomain, targetAgents: decision.targetAgents, skill: decision.skill,
    action: decision.action, confidence: decision.confidence, requiresClarification: decision.requiresClarification,
    verifiedAnswerPossible: decision.verifiedAnswerPossible, msgId: ctx.msgId, snippet: ctx.text,
  });

  await writeAgentActivity(db, primaryAgent, "directive", `📥 פנייה מ-JARVIS: ${title}`, {
    source: "jarvis_whatsapp", request: ctx.text, masterItemId, businessDomain: decision.businessDomain, intent: decision.intent,
  }).catch(() => {});
  await updateAgentRunStatus(db, primaryAgent, "active").catch(() => {});

  // 1. Clarification — never run a command when unsure.
  if (decision.requiresClarification) {
    await closeCeoRequest(masterItemId, { status: "pending", report: { kind: "clarification", domain: decision.businessDomain } });
    await updateAgentRunStatus(db, primaryAgent, "idle").catch(() => {});
    return { kind: "clarification", executed: false, command: null, report: null, planExecution: null, capabilityRequestId: null, ...base };
  }

  // 2. Multi-step read-only routine.
  if (decision.routine) {
    const exec = await executePlan(decision.routine, decision.source);
    await writeAgentActivity(db, MANAGER_AGENT_ID, "report", `🧭 דוח רב-שלבי: ${exec.goal} (${exec.ranSteps}/${exec.steps.length} שלבים)`, {
      source: "jarvis_dispatch", reasoning: decision.source, masterItemId,
      steps: exec.steps.map((s) => ({ action: s.action, ok: s.ok, headline: s.report?.headline ?? null })),
    }).catch(() => {});
    await updateAgentRunStatus(db, MANAGER_AGENT_ID, "idle").catch(() => {});
    await closeCeoRequest(masterItemId, { status: exec.ranSteps > 0 ? "done" : "error", report: { plan: exec.goal, source: decision.source, ranSteps: exec.ranSteps } });
    return { kind: "plan", executed: exec.ranSteps > 0, command: null, report: null, planExecution: exec, capabilityRequestId: null, ...base };
  }

  // 3. Single read-only action with a verified data source.
  if (resolvedCmd) {
    let report: CommandReport;
    try {
      report = await resolvedCmd.run(db, { itemName: pickItemName(decision.parameters), raw: ctx.text });
    } catch (err) {
      report = { ok: false, title, headline: `שגיאה בביצוע: ${err instanceof Error ? err.message : String(err)}`, details: [] };
    }
    await updateAgentRunStatus(db, resolvedCmd.agentId, "idle").catch(() => {});

    if (report.needsClarification) {
      await writeAgentActivity(db, resolvedCmd.agentId, "report", `❓ ${report.title}: ${report.headline}`, { source: "jarvis_dispatch", command: resolvedCmd.id, masterItemId }).catch(() => {});
      await closeCeoRequest(masterItemId, { status: "pending", report: { command: resolvedCmd.id, needsClarification: true, headline: report.headline } });
      return { kind: "clarification", executed: false, command: resolvedCmd, report, planExecution: null, capabilityRequestId: null, ...base };
    }
    await writeAgentActivity(db, resolvedCmd.agentId, "report", `${report.ok ? "✅" : "⚠️"} ${report.title}: ${report.headline}`, {
      source: "jarvis_dispatch", command: resolvedCmd.id, requestedBy: "ceo", masterItemId, count: report.count ?? null, details: report.details,
    }).catch(() => {});
    await writeAgentActivity(db, MANAGER_AGENT_ID, "report", `📋 דוח מ-${resolvedCmd.agentName}: ${report.headline}`, { source: "jarvis_dispatch", command: resolvedCmd.id, delegatedTo: resolvedCmd.agentId, masterItemId }).catch(() => {});
    await closeCeoRequest(masterItemId, { status: report.ok ? "done" : "error", report: { command: resolvedCmd.id, agentId: resolvedCmd.agentId, headline: report.headline, count: report.count ?? null } });
    return { kind: "command", executed: report.ok, command: resolvedCmd, report, planExecution: null, capabilityRequestId: null, ...base };
  }

  // 4. No verified capability/data source (or a capability-build request, or generic delegation)
  //    → file an honest pending request + a structured Capability Request. Never fake an answer.
  const isCapabilityBuild = decision.requiresCapabilityBuild;
  const missing = isCapabilityBuild
    ? `Skill/יכולת: ${ctx.text.slice(0, 160)}`
    : decision.dataSourceNeeded ?? decision.missingCapability ?? null;

  let capabilityRequestId: string | null = null;
  if (isCapabilityBuild || missing) {
    capabilityRequestId = await createCapabilityRequest({
      requestedBy: ctx.sourcePhone,
      channel: ctx.channel,
      originalMessage: ctx.text,
      interpretedIntent: decision.intent,
      kind: isCapabilityBuild ? "skill_build" : "data_source",
      missingSkillOrDataSource: missing ?? "(לא צויין)",
      targetAgent: primaryAgent,
      priority,
      recommendedNextStep: isCapabilityBuild
        ? "הוסף Skill/Routine קריאה-בלבד חדש + שורת departments/match; ראה JARVIS_SKILLS_ROADMAP."
        : "חבר מקור נתונים מאומת לתחום זה, או בצע בדיקה ידנית.",
    });
  }

  await queueDepartmentTask(db, { masterItemId, title, text: ctx.text, priority, agentId: primaryAgent, domain: decision.businessDomain });
  await writeAgentActivity(
    db, primaryAgent, "task_created",
    `🗂️ ${isCapabilityBuild ? "בקשת יכולת" : "בקשה"} ל${departmentFor(decision.intent).label}: ${title}`,
    { source: "jarvis_dispatch", masterItemId, businessDomain: decision.businessDomain, dataSourceNeeded: decision.dataSourceNeeded, capabilityRequestId },
  ).catch(() => {});
  await updateAgentRunStatus(db, primaryAgent, "idle").catch(() => {});
  await closeCeoRequest(masterItemId, { status: "pending", report: { delegatedTo: primaryAgent, domain: decision.businessDomain, dataSourceNeeded: decision.dataSourceNeeded, capabilityRequestId } });
  return {
    kind: isCapabilityBuild ? "capability_request" : "pending_department",
    executed: false, command: null, report: null, planExecution: null, capabilityRequestId, ...base,
  };
}

/** Render the WhatsApp reply for a dispatch result. */
export function formatDispatchReply(result: DispatchResult): string {
  const d = result.decision;
  if (result.kind === "clarification") {
    if (result.report) {
      return [result.report.headline, ...(result.report.details.length ? ["", ...result.report.details] : [])].join("\n");
    }
    return d.clarificationQuestion ?? "תוכל לפרט קצת יותר? 🙂";
  }
  if (result.kind === "plan" && result.planExecution) {
    return formatPlanReport(result.planExecution, result.refId);
  }
  if (result.kind === "command" && result.report) {
    const r = result.report;
    if (!r.ok) return `נתקלתי בבעיה בביצוע "${r.title}" (#${result.refId}):\n${r.headline}\nתועד במרכז הפיקוד.`;
    return [
      `📋 דוח ביצוע — ${r.title} (#${result.refId})`,
      r.headline,
      ...(r.details.length ? ["", ...r.details] : []),
      "",
      `✅ בוצע ע״י ${result.command?.agentName ?? "מנהל פעילות"} · בדיקה בלבד, ללא שינויים.`,
      "🖥️ מתועד במרכז הפיקוד הדיגיטלי.",
    ].join("\n");
  }
  const dept = departmentFor(d.intent);
  if (result.kind === "capability_request") {
    // Owner asked to BUILD a capability we don't have yet — honest, never faked.
    return [
      `אין לי עדיין יכולת מובנית לזה (#${result.refId}).`,
      `פתחתי בקשת יכולת ל${dept.label} ותיעדתי מה צריך לבנות.`,
      "כשהיכולת תיבנה (Skill/Routine קריאה-בלבד), אדע לבצע את זה אוטומטית.",
    ].join("\n");
  }
  // pending_department
  const lines = [`קיבלתי (#${result.refId}). העברתי ל${dept.label}.`];
  if (d.dataSourceNeeded) lines.push(`אין כרגע מקור נתונים מאומת לבקשה הזו — ${d.dataSourceNeeded}.`);
  lines.push(`פתחתי בקשת בדיקה ל${dept.label}; היא מופיעה במרכז הפיקוד הדיגיטלי לטיפול.`);
  return lines.join("\n");
}

// ── helpers ─────────────────────────────────────────────────────────────────────

function pickItemName(params: Record<string, unknown>): string | undefined {
  for (const k of ["item_name", "item", "name", "product"]) {
    const v = params?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

async function queueDepartmentTask(
  db: ReturnType<typeof getServiceSupabase>,
  args: { masterItemId: string | null; title: string; text: string; priority: "high" | "normal"; agentId: string; domain: string },
): Promise<void> {
  const { error } = await db.from("agent_tasks").insert({
    agent_id: args.agentId,
    related_entity_type: "jarvis_request",
    related_entity_id: args.masterItemId ?? "unknown",
    title: `פנייה מ-JARVIS: ${args.title}`,
    description: args.text,
    priority: args.priority === "high" ? "high" : "normal",
    status: "open",
    recommended_action: `סקור את הבקשה (תחום: ${args.domain}) ובצע ידנית או חבר מקור נתונים מאומת.`,
    requires_approval: false,
  });
  if (error) console.error("[jarvis:ceo] queueDepartmentTask failed:", error.message);
}
