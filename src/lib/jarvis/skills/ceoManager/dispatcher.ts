import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { writeAgentActivity, updateAgentRunStatus } from "@/lib/agents/scan-utils";
import { ceoTitle, ceoPriority } from "./intent";
import { createCeoRequest, closeCeoRequest } from "./store";
import { MANAGER_COMMANDS, matchCommand, type ManagerCommand, type CommandReport } from "./commands";

/**
 * System-Manager dispatcher — the manager's "brain".
 *
 * This is what was missing: when Jarvis forwarded a directive, the old skill only filed a
 * pending record and nothing happened. The dispatcher now actually THINKS about the
 * directive, picks the relevant agent/command, EXECUTES it (read-only), records the whole
 * exchange in the Digital Command Center, and returns a short execution report.
 *
 * Visibility: every dispatch writes to `agent_activity_feed` so the JARVIS→manager directive
 * and the agent's report both surface at /agents (Digital Command Center).
 *
 * Honesty: only read-only commands auto-execute. Anything requiring a write is queued as a
 * human `agent_task` and reported as such — we never claim an action that didn't happen.
 */

const MANAGER_AGENT_ID = "ceo";
const MANAGER_AGENT_NAME = "מנהל פעילות";

export interface DispatchResult {
  /** True when a read-only command ran and produced a report. */
  executed: boolean;
  /** True when no command matched and a human task was queued instead. */
  queuedTask: boolean;
  command: ManagerCommand | null;
  report: CommandReport | null;
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

  // 3. Decide which agent/command handles it (LLM if enabled, else deterministic).
  const command = await selectCommand(args.text);

  if (command) {
    // 4a. Execute the read-only command and report into the command center.
    let report: CommandReport;
    try {
      report = await command.run(db);
    } catch (err) {
      report = {
        ok: false,
        title,
        headline: `שגיאה בביצוע: ${err instanceof Error ? err.message : String(err)}`,
        details: [],
      };
    }

    await updateAgentRunStatus(db, command.agentId, "idle").catch(() => {});
    const reportLine = report.ok
      ? `✅ ${report.title}: ${report.headline}`
      : `⚠️ ${report.title}: ${report.headline}`;
    // Attribute the work to the owning agent's room…
    await writeAgentActivity(db, command.agentId, "report", reportLine, {
      source: "jarvis_dispatch",
      command: command.id,
      requestedBy: "ceo",
      masterItemId,
      count: report.count ?? null,
      details: report.details,
    }).catch(() => {});
    // …and log the manager↔agent collaboration so the dialogue is visible end to end.
    await writeAgentActivity(
      db,
      MANAGER_AGENT_ID,
      "report",
      `📋 דוח מ-${command.agentName}: ${report.headline}`,
      { source: "jarvis_dispatch", command: command.id, delegatedTo: command.agentId, masterItemId },
    ).catch(() => {});
    await updateAgentRunStatus(db, MANAGER_AGENT_ID, "idle").catch(() => {});

    await closeCeoRequest(masterItemId, {
      status: report.ok ? "done" : "error",
      report: { command: command.id, agentId: command.agentId, headline: report.headline, count: report.count ?? null, details: report.details },
    });

    return { executed: report.ok, queuedTask: false, command, report, masterItemId, title, priority, refId };
  }

  // 4b. No auto-executable command → queue a human task (honest, never faked).
  await queueManagerTask(db, { masterItemId, title, text: args.text, priority });
  await writeAgentActivity(db, MANAGER_AGENT_ID, "task_created", `🗂️ נפתחה משימת מנהל לטיפול ידני: ${title}`, {
    source: "jarvis_dispatch",
    masterItemId,
    priority,
  }).catch(() => {});
  await updateAgentRunStatus(db, MANAGER_AGENT_ID, "idle").catch(() => {});

  return { executed: false, queuedTask: true, command: null, report: null, masterItemId, title, priority, refId };
}

/** Render the WhatsApp execution report the owner receives back. */
export function formatDispatchReply(result: DispatchResult): string {
  if (result.executed && result.report) {
    const r = result.report;
    const lines = [
      `📋 דוח ביצוע — ${r.title} (#${result.refId})`,
      r.headline,
      ...(r.details.length ? ["", ...r.details] : []),
      "",
      `✅ בוצע ע״י ${result.command?.agentName ?? MANAGER_AGENT_NAME} · בדיקה בלבד, ללא שינויים.`,
      "🖥️ מתועד במרכז הפיקוד הדיגיטלי.",
    ];
    return lines.join("\n");
  }
  if (result.report && !result.report.ok) {
    return `נתקלתי בבעיה בביצוע "${result.title}" (#${result.refId}):\n${result.report.headline}\nתועד במרכז הפיקוד.`;
  }
  // Queued task (no auto-command matched).
  return (
    `קיבלתי (#${result.refId}). העברתי למנהל המערכת ופתחתי משימה לטיפול ידני` +
    (result.priority === "high" ? " (סומן דחוף 🔴)" : "") +
    `.\nלא זוהתה בדיקה אוטומטית מתאימה לבקשה הזו — היא מופיעה כעת במרכז הפיקוד הדיגיטלי לטיפול.`
  );
}

// ── Persistence helpers (agent_tasks queue for non-executable directives) ───────

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

// ── Command selection: deterministic, with an optional dormant LLM layer ────────

/**
 * Picks the command for a directive. Deterministic keyword match is the default and is what
 * runs with no API key. When `JARVIS_LLM_ENABLED=true` + `ANTHROPIC_API_KEY` are set, an LLM
 * disambiguates paraphrases the keywords miss; on any error it falls back to deterministic.
 * The LLM may only choose among the known command ids — it can never invent an action.
 */
async function selectCommand(text: string): Promise<ManagerCommand | null> {
  const deterministic = matchCommand(text);
  if (deterministic) return deterministic;
  if (process.env.JARVIS_LLM_ENABLED === "true" && process.env.ANTHROPIC_API_KEY) {
    const viaLlm = await selectCommandViaLlm(text);
    if (viaLlm) return viaLlm;
  }
  return null;
}

async function selectCommandViaLlm(text: string): Promise<ManagerCommand | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.JARVIS_LLM_MODEL ?? "claude-haiku-4-5-20251001";
  const catalog = MANAGER_COMMANDS.map((c) => `${c.id}: ${c.description}`).join("\n");
  const system =
    "You map a Hebrew operational request to ONE read-only command id for a road-sign " +
    "company manager. Reply with ONLY the command id, or the word none if nothing fits. " +
    "Available commands:\n" + catalog;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 16, system, messages: [{ role: "user", content: text }] }),
    });
    if (!res.ok) {
      console.warn(`[jarvis:ceo] LLM command select failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const out = (data.content?.[0]?.text ?? "").trim().toLowerCase();
    const match = MANAGER_COMMANDS.find((c) => out.includes(c.id));
    return match ?? null;
  } catch (err) {
    console.warn("[jarvis:ceo] LLM command select threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
