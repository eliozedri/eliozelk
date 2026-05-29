import { actionCapabilities, actionLabel, resolveActionType } from "./actionCatalog";
import { getAgentRole } from "./agentRoles";
import { reasonAsAgent, type AgentReasoningResult } from "./agentReasoning";

/**
 * CEO-Agent reasoning step. LLM-FIRST: it calls the shared reasoning service
 * (reasonAsAgent) so the CEO-Agent actually thinks about the request — analyzes,
 * routes to an internal agent, asks for missing info, proposes, or reports a
 * capability gap. Rule-based logic is only a FALLBACK when no LLM provider is
 * available (honest, never a fake answer). It never executes anything.
 */

export type CeoMessageType =
  | "request" | "analysis" | "needs_info" | "approval_request" | "proposal"
  | "route_to_agent" | "execution_preview" | "prepare_execution_preview"
  | "stage_for_review" | "capability_gap" | "unsupported" | "safe_answer"
  | "status_update" | "final_result";

export interface ConversationTurn {
  seq: number;
  source_agent: string;
  target_agent: string;
  message_type: string;
  message_text: string;
  structured_payload?: Record<string, unknown>;
  created_at: string;
}

export interface AnalyzeInput {
  action_type?: string;
  owner_request: string;
  target_department?: string | null;
  params?: Record<string, unknown>;
}

export interface AnalysisResult {
  message_type: string;
  message_text: string;
  recommended_status: string;
  reasoning_summary: string;
  routed_to_agent: string | null;
  risk_level: string;
  llm_used: boolean;
  llm_provider: string | null;
  structured_payload?: Record<string, unknown>;
}

function statusFor(messageType: string): string {
  if (messageType === "needs_info") return "needs_info";
  if (messageType === "capability_gap" || messageType === "unsupported") return "capability_gap";
  return "pending_review";
}

/** Reasoner type (injectable for tests). */
export type Reasoner = (input: {
  agentId: string; userRequest: string; businessContext?: string; allowedActions?: string[]; canRouteInternally?: boolean;
  conversationHistory?: { source_agent: string; message_type: string; message_text: string }[];
}) => Promise<AgentReasoningResult | null>;

const defaultReasoner: Reasoner = (input) => reasonAsAgent(input);

/**
 * Analyze a request as the CEO-Agent. Async + LLM-first; falls back to rule-based.
 * `reasoner` is injectable for tests.
 */
export async function analyzeRequest(
  input: AnalyzeInput,
  reasoner: Reasoner = defaultReasoner,
): Promise<AnalysisResult> {
  const ceo = getAgentRole("ceo");
  const businessContext = [
    input.target_department ? `מחלקה/קטגוריה: ${input.target_department}` : "",
    input.action_type ? `רמז סוג פעולה: ${input.action_type}` : "",
    input.params && Object.keys(input.params).length ? `פרמטרים: ${JSON.stringify(input.params)}` : "",
  ].filter(Boolean).join(" · ");

  const r = await reasoner({
    agentId: "ceo",
    userRequest: input.owner_request,
    businessContext,
    allowedActions: ceo?.allowedActions ?? [],
    canRouteInternally: true,
  });

  if (r) {
    return {
      message_type: r.message_type,
      message_text: r.message_text,
      recommended_status: statusFor(r.message_type),
      reasoning_summary: r.reasoning_summary,
      routed_to_agent: r.routed_to_agent,
      risk_level: r.risk_level,
      llm_used: true,
      llm_provider: r.provider,
      structured_payload: { routed_to_agent: r.routed_to_agent, approval_required: r.approval_required },
    };
  }

  return ruleBasedAnalyze(input);
}

/** Deterministic fallback used only when the LLM is unavailable. */
export function ruleBasedAnalyze(input: AnalyzeInput): AnalysisResult {
  const canonical = resolveActionType(input.action_type ?? "");
  const ownerRequest = (input.owner_request ?? "").trim();
  const base = { reasoning_summary: "fallback מבוסס-חוקים (LLM לא זמין)", routed_to_agent: null as string | null, risk_level: "medium", llm_used: false, llm_provider: null };

  if (!ownerRequest) {
    return { ...base, message_type: "needs_info", message_text: "לא קיבלתי תיאור של הבקשה. מה תרצה שאבצע?", recommended_status: "needs_info" };
  }
  if (canonical && actionCapabilities(canonical).execute) {
    if (canonical === "price_update_percentage") {
      const pct = Number(input.params?.pct);
      const missing: string[] = [];
      if (!input.target_department) missing.push("מחלקה/קטגוריה");
      if (!Number.isFinite(pct) || pct === 0) missing.push("אחוז השינוי");
      if (missing.length) {
        return { ...base, message_type: "needs_info", message_text: `הבנתי שמדובר בעדכון מחירים. חסר לי: ${missing.join(", ")}.`, recommended_status: "needs_info", routed_to_agent: "catalog_manager", risk_level: "high" };
      }
    }
    return { ...base, message_type: "analysis", message_text: `הבנתי את המשימה (${actionLabel(canonical)}). אחרי אישורך אכין תצוגת ביצוע.`, recommended_status: "pending_review", routed_to_agent: "catalog_manager", risk_level: "high", structured_payload: { offers: ["execution_preview"], action_type: canonical } };
  }
  if (canonical) {
    return { ...base, message_type: "analysis", message_text: "קיבלתי את הבקשה לסקירה.", recommended_status: "pending_review" };
  }
  return { ...base, message_type: "capability_gap", message_text: "אני מבין את הבקשה, אבל אין לי כרגע כלי/יכולת מחוברת לבצע אותה ישירות. אפשר להכין הצעה או לפתוח משימת פיתוח עתידית — מה תעדיף?", recommended_status: "capability_gap", structured_payload: { offers: ["proposal", "future_dev_task"], missing_capability: true } };
}

/** Append a turn to a conversation log (pure). */
export function appendTurn(
  conversation: ConversationTurn[],
  turn: Omit<ConversationTurn, "seq" | "created_at">,
): ConversationTurn[] {
  return [...conversation, { ...turn, seq: conversation.length + 1, created_at: new Date().toISOString() }];
}
