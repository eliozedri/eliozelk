import "server-only";
import type { Skill, SkillContext, SkillResult } from "../../types";
import { text } from "../../types";
import { isCeoStatusQuery, ceoTitle, ceoPriority } from "./intent";
import { createCeoRequest, listOpenCeoRequests } from "./store";

/**
 * CEO / Manager Communication skill — owner-only (the orchestrator/adapter never routes
 * external senders here). Stage 1: a pending request queue + status listing. There is no
 * CEO executor agent yet, so Jarvis records requests honestly and NEVER claims execution.
 * When a real CEO module exists, route in createCeoRequest / report its result here.
 */

export const ceoManagerSkill: Skill = {
  name: "ceoManager",
  async handle(ctx: SkillContext): Promise<SkillResult> {
    const { senderId, channel } = ctx.input;
    const body = (ctx.input.text ?? "").trim();

    // Status / list query.
    if (isCeoStatusQuery(body)) {
      const open = await listOpenCeoRequests();
      if (open.length === 0) {
        return { handled: true, messages: [text("אין כרגע משימות CEO פתוחות בתור. 🙂")] };
      }
      const lines = open
        .map((r, i) => `${i + 1}. ${r.priority === "high" ? "🔴 " : ""}${r.title}`)
        .join("\n");
      return {
        handled: true,
        messages: [text(`משימות CEO פתוחות (${open.length}) — ממתינות לטיפול:\n${lines}`)],
      };
    }

    // New CEO request → pending queue (honest; no execution).
    if (!body) {
      return { handled: true, messages: [text("כתוב לי מה להעביר ל-CEO / מנהל המערכת ואתעד את הבקשה.")] };
    }
    const title = ceoTitle(body);
    const priority = ceoPriority(body);
    const id = await createCeoRequest({ sourcePhone: senderId, channel, text: body, title, priority });
    const ref = id ? ` (#${id.slice(0, 8)})` : "";
    return {
      handled: true,
      messages: [text(
        `קיבלתי${ref}. רשמתי את הבקשה לתור ה-CEO / מנהל המערכת ואעדכן כשיהיה טיפול.` +
        (priority === "high" ? "\nסומן כדחוף 🔴." : ""),
      )],
    };
  },
};
