import "server-only";
import { generateReply } from "./llm/index";
import { getAgentRole, internalAgentDirectory } from "./agentRoles";

/**
 * Shared Agent Reasoning Service — the THINKING layer for every agent (CEO,
 * Operations, Catalog, System Admin, and future ones). Generic + reusable: any
 * agent supplies its role/context and gets a structured reasoning result back.
 * Built on the existing Gemini/Groq router (generateReply); NEVER executes,
 * writes, or runs SQL — it only analyzes/classifies/routes/proposes. Safe-off:
 * if no provider is available it returns null and the caller falls back to
 * rule-based logic (honest, never a fake answer). No secrets are logged.
 */

export type AgentMessageType =
  | "analysis" | "needs_info" | "approval_request" | "proposal" | "route_to_agent"
  | "capability_gap" | "prepare_execution_preview" | "stage_for_review"
  | "unsupported" | "safe_answer" | "final_result" | "status_update";

export interface AgentReasoningInput {
  projectId?: string;
  agentId: string; // role id, e.g. 'ceo' | 'catalog_manager'
  businessContext?: string;
  systemContext?: string;
  conversationHistory?: { source_agent: string; message_type: string; message_text: string }[];
  userRequest: string;
  sourceAgent?: string;
  /** Allowlisted executable actions this agent may OFFER (execution stays gated). */
  allowedActions?: string[];
  /** Can this agent route to internal Elkayam agents? (CEO can.) */
  canRouteInternally?: boolean;
}

export interface AgentReasoningResult {
  message_type: AgentMessageType;
  message_text: string;
  reasoning_summary: string;
  routed_to_agent: string | null;
  needs_info: boolean;
  approval_required: boolean;
  risk_level: "low" | "medium" | "high";
  llm_used: true;
  provider: string | null;
}

/** Injectable LLM call for testing. Default wraps the project's Gemini/Groq router. */
export type GenerateFn = (systemPrompt: string, userText: string) => Promise<{ text: string; provider?: string } | null>;

const defaultGenerate: GenerateFn = (systemPrompt, userText) =>
  generateReply({ text: userText, role: "master", channel: "telegram", systemPrompt });

const MESSAGE_TYPES: AgentMessageType[] = [
  "analysis", "needs_info", "approval_request", "proposal", "route_to_agent",
  "capability_gap", "prepare_execution_preview", "stage_for_review",
  "unsupported", "safe_answer", "final_result", "status_update",
];

function buildSystemPrompt(input: AgentReasoningInput): string {
  const role = getAgentRole(input.agentId);
  const allowed = (input.allowedActions ?? role?.allowedActions ?? []).join(", ") || "(אין כלי ביצוע זמין)";
  const lines = [
    role ? `${role.prompt}` : `אתה סוכן בשם ${input.agentId}.`,
    input.businessContext ? `הקשר עסקי: ${input.businessContext}` : "",
    input.systemContext ? `הקשר מערכת: ${input.systemContext}` : "",
    input.canRouteInternally ? `סוכנים פנימיים שאפשר לנתב אליהם:\n${internalAgentDirectory()}` : "",
    `פעולות ביצוע מאושרות שאתה רשאי להציע (execution_preview) — ורק אותן: ${allowed}.`,
    "החזר אך ורק אובייקט JSON תקין אחד, בלי טקסט/Markdown מסביב, במבנה:",
    '{ "message_type": <one of: ' + MESSAGE_TYPES.join("|") + ">,",
    '  "message_text": <עברית, פנייה לבעלים, קצר ולעניין>,',
    '  "reasoning_summary": <עברית, סיכום קצר של החשיבה>,',
    '  "routed_to_agent": <id של סוכן פנימי או null>,',
    '  "needs_info": <true|false>, "approval_required": <true|false>,',
    '  "risk_level": <"low"|"medium"|"high"> }',
    "כללים: לבקשת קטלוג/מחיר נתב ל-catalog_manager; תפעול/צוותים/תהליכים → operations_manager; הרשאות/מערכת/טכני → system_admin.",
    "אם חסר מידע קריטי → needs_info. אם אין כלי מתאים → capability_gap. לעולם אל תבצע פעולה בעצמך.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildUserText(input: AgentReasoningInput): string {
  const hist = (input.conversationHistory ?? [])
    .map((t) => `${t.source_agent} [${t.message_type}]: ${t.message_text}`)
    .join("\n");
  return [hist ? `שיחה עד כה:\n${hist}` : "", `בקשת הבעלים:\n${input.userRequest}`].filter(Boolean).join("\n\n");
}

function extractJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced && fenced[1] ? fenced[1] : raw;
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

function coerceType(v: unknown): AgentMessageType {
  const s = String(v ?? "").trim();
  return (MESSAGE_TYPES as string[]).includes(s) ? (s as AgentMessageType) : "analysis";
}
function coerceRisk(v: unknown): "low" | "medium" | "high" {
  const s = String(v ?? "").toLowerCase();
  return s === "high" || s === "low" ? s : "medium";
}

/** Reason as the given agent. Returns null when no LLM provider is available (caller falls back). */
export async function reasonAsAgent(
  input: AgentReasoningInput,
  generate: GenerateFn = defaultGenerate,
): Promise<AgentReasoningResult | null> {
  let out: { text: string; provider?: string } | null = null;
  try {
    out = await generate(buildSystemPrompt(input), buildUserText(input));
  } catch {
    return null;
  }
  if (!out || !out.text) return null;
  const obj = extractJson(out.text);
  if (!obj) return null;

  const routed = typeof obj.routed_to_agent === "string" && obj.routed_to_agent !== "null" ? obj.routed_to_agent : null;
  return {
    message_type: coerceType(obj.message_type),
    message_text: String(obj.message_text ?? "").trim() || "ניתחתי את הבקשה.",
    reasoning_summary: String(obj.reasoning_summary ?? "").trim(),
    routed_to_agent: routed,
    needs_info: obj.needs_info === true,
    approval_required: obj.approval_required === true,
    risk_level: coerceRisk(obj.risk_level),
    llm_used: true,
    provider: out.provider ?? null,
  };
}
