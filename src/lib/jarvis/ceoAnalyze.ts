import { actionCapabilities, actionLabel, resolveActionType } from "./actionCatalog";

/**
 * The Elkayam CEO-Agent's reasoning step. Given a request from JARVIS, it
 * decides the next conversational move — it does NOT force every request into a
 * fixed action. Generic + rule-based for now (no LLM); the message_type
 * vocabulary lets the dialogue grow without hardcoding actions.
 *
 * Allowlisted EXECUTABLE actions (e.g. price_update_percentage) can be offered
 * as an execution preview after approval; everything else becomes a proposal or
 * an honest capability_gap — never a fake execution.
 */

export type CeoMessageType =
  | "request"
  | "analysis"
  | "needs_info"
  | "approval_request"
  | "proposal"
  | "execution_preview"
  | "capability_gap"
  | "status_update"
  | "final_result";

export interface ConversationTurn {
  seq: number;
  source_agent: string; // 'jarvis' | 'elkayam_ceo_agent' | 'owner'
  target_agent: string;
  message_type: CeoMessageType;
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
  message_type: CeoMessageType;
  message_text: string;
  /** The command status to move to after this analysis. */
  recommended_status: string;
  structured_payload?: Record<string, unknown>;
}

export function analyzeRequest(input: AnalyzeInput): AnalysisResult {
  const canonical = resolveActionType(input.action_type ?? "");
  const ownerRequest = (input.owner_request ?? "").trim();

  if (!ownerRequest) {
    return { message_type: "needs_info", message_text: "לא קיבלתי תיאור של הבקשה. מה תרצה שאבצע?", recommended_status: "needs_info" };
  }

  // 1. An allowlisted action with a real execution handler → offer a gated preview.
  if (canonical && actionCapabilities(canonical).execute) {
    if (canonical === "price_update_percentage") {
      const pct = Number(input.params?.pct);
      const missing: string[] = [];
      if (!input.target_department) missing.push("מחלקה/קטגוריה");
      if (!Number.isFinite(pct) || pct === 0) missing.push("אחוז השינוי");
      if (missing.length) {
        return {
          message_type: "needs_info",
          message_text: `הבנתי שמדובר בעדכון מחירים. כדי להמשיך חסר לי: ${missing.join(", ")}. תוכל להשלים?`,
          recommended_status: "needs_info",
        };
      }
    }
    return {
      message_type: "analysis",
      message_text: `הבנתי את המשימה (${actionLabel(canonical)}). אחרי אישורך אכין תצוגת ביצוע (dry-run), ואז נדרש אישור ביצוע נוסף לפני שינוי בפועל.`,
      recommended_status: "pending_review",
      structured_payload: { offers: ["execution_preview"], action_type: canonical },
    };
  }

  // 2. An allowlisted review-only action (e.g. ops_note) → stage for review.
  if (canonical) {
    return {
      message_type: "analysis",
      message_text: "קיבלתי את הבקשה. אעביר אותה לסקירה ואטפל — אין כאן שינוי תפעולי אוטומטי.",
      recommended_status: "pending_review",
      structured_payload: { offers: ["stage_for_review"], action_type: canonical },
    };
  }

  // 3. Not an allowlisted capability → honest capability gap (never pretend).
  return {
    message_type: "capability_gap",
    message_text:
      "אני מבין את הבקשה, אבל אין לי כרגע כלי/יכולת מחוברת לבצע אותה ישירות במערכת אלקיים. " +
      "אפשר להכין הצעה מובנית או לפתוח משימת פיתוח עתידית (gated) כדי לחבר את היכולת — מה תעדיף?",
    recommended_status: "capability_gap",
    structured_payload: { offers: ["proposal", "future_dev_task"], missing_capability: true },
  };
}

/** Append a turn to a conversation log (pure). */
export function appendTurn(
  conversation: ConversationTurn[],
  turn: Omit<ConversationTurn, "seq" | "created_at">,
): ConversationTurn[] {
  return [...conversation, { ...turn, seq: conversation.length + 1, created_at: new Date().toISOString() }];
}
