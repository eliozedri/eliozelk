import "server-only";
import type { Skill, SkillContext, SkillResult } from "../../types";
import { text } from "../../types";
import { isCeoStatusQuery } from "./intent";
import { listOpenCeoRequests } from "./store";
import { dispatchManagerRequest, formatDispatchReply } from "./dispatcher";

/**
 * CEO / System-Manager skill — owner-only (the orchestrator/adapter never routes external
 * senders here). A directive is handed to the manager DISPATCHER, which understands it,
 * activates the relevant agent, executes read-only commands, records the exchange in the
 * Digital Command Center, and returns an execution report. Requests that need a write are
 * queued as a human task — Jarvis never claims an action it did not perform.
 */

export const ceoManagerSkill: Skill = {
  name: "ceoManager",
  async handle(ctx: SkillContext): Promise<SkillResult> {
    const { senderId, channel } = ctx.input;
    const body = (ctx.input.text ?? "").trim();

    // Status / list query → show what the manager is currently handling.
    if (isCeoStatusQuery(body)) {
      const open = await listOpenCeoRequests();
      if (open.length === 0) {
        return { handled: true, messages: [text("אין כרגע משימות מנהל פתוחות בתור. 🙂")] };
      }
      const lines = open
        .map((r, i) => `${i + 1}. ${r.priority === "high" ? "🔴 " : ""}${r.title}${r.status === "in_progress" ? " ⏳" : ""}`)
        .join("\n");
      return {
        handled: true,
        messages: [text(`משימות מנהל פתוחות (${open.length}):\n${lines}`)],
      };
    }

    if (!body) {
      return { handled: true, messages: [text("כתוב לי מה להעביר למנהל המערכת ואטפל בזה.")] };
    }

    // New directive → dispatch (think → activate agent → execute → report).
    const result = await dispatchManagerRequest({ text: body, sourcePhone: senderId, channel });
    return { handled: true, messages: [text(formatDispatchReply(result))] };
  },
};
