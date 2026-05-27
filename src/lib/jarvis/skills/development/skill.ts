import "server-only";
import type { Skill, SkillContext, SkillResult } from "../../types";
import { text } from "../../types";
import { findProject, knownProjectsList, githubAccess } from "./registry";
import { classifyDevIntent, classifyDevRisk, isAmbiguousDevRequest } from "./classify";
import { buildClaudePrompt, buildNewProjectProposal } from "./prompt";
import { createDevTask } from "./store";

/**
 * Development / Claude Code skill — OWNER-ONLY. STAGE 1, HONEST:
 *  - Jarvis runs on serverless: NO local filesystem / git / build / logs → it does NOT execute code.
 *  - NO GitHub API access currently → it cannot list/create repos, open PRs, or trigger Actions.
 * It classifies the request, gates risk, and EITHER generates a Claude Code prompt + dev task
 * (existing project) OR a new-project proposal — never faking creation/execution. DANGEROUS
 * requests (push to main / deploy / migrations / auth / secrets / Meta / delete / rewrite) are
 * BLOCKED pending explicit owner approval. Ambiguous requests ask which project + scope.
 */

export const developmentSkill: Skill = {
  name: "development",
  async handle(ctx: SkillContext): Promise<SkillResult> {
    if (ctx.input.senderRole !== "master") {
      return { handled: true, messages: [text("הפעולה הזו זמינה לבעלים בלבד.")] };
    }
    const body = (ctx.input.text ?? "").trim();
    if (!body) {
      return { handled: true, messages: [text("מה לבדוק/לבנות? למשל: 'בדוק למה הבילד נפל', 'מה מצב git באלקיים', 'תכין פרומפט לקלוד', או 'תבנה לי אפליקציה חדשה'.")] };
    }

    // Vague request with no project/scope → ask, never guess dangerously.
    if (isAmbiguousDevRequest(body)) {
      return { handled: true, messages: [text(
        "לאיזה פרויקט הכוונה, ומה בדיוק לבצע? 🙂\n" +
        "פרויקטים מוכרים:\n" + knownProjectsList().join("\n") + "\n• פרויקט חדש (אפרט הצעה)\n" +
        "ותגיד אם זה קיים או חדש, ה-scope, והאם Claude Code אמור לבצע או רק להכין משימה.",
      )] };
    }

    const sub = classifyDevIntent(body);
    const risk = classifyDevRisk(body, sub);
    const gh = githubAccess();

    // New project request → proposal only (never create a repo without GitHub access + approval).
    if (sub === "new_project_request") {
      const proposal = buildNewProjectProposal(body, gh.available);
      const id = await createDevTask({
        requestedBy: ctx.input.senderId, channel: ctx.input.channel, projectId: "new_project",
        originalMessage: body, interpretedIntent: sub, riskLevel: risk,
        selectedAction: "new_project_proposal", approvalRequired: true, status: "pending",
        recommendedNextStep: "אשר שם פרויקט + repo + stack. יצירת repo דורשת גישת GitHub ואישור מפורש.",
        claudePrompt: proposal,
      });
      const ref = id ? ` (#${id.slice(0, 8)})` : "";
      return { handled: true, messages: [text(`${proposal}\n\nתועדה משימת פיתוח${ref}.`)] };
    }

    const project = findProject(body);
    if (!project) {
      return { handled: true, messages: [text(
        "לא בטוח לאיזה פרויקט להתייחס. הפרויקטים המוכרים:\n" + knownProjectsList().join("\n") +
        "\n• פרויקט חדש\nאיזה מהם?",
      )] };
    }

    const dangerous = risk === "DANGEROUS";
    const prompt = buildClaudePrompt(project, sub, risk, body);
    const id = await createDevTask({
      requestedBy: ctx.input.senderId, channel: ctx.input.channel, projectId: project.projectId,
      originalMessage: body, interpretedIntent: sub, riskLevel: risk,
      selectedAction: dangerous ? "blocked_pending_approval" : "claude_prompt_prepared",
      approvalRequired: dangerous || risk === "SAFE_EDIT",
      status: dangerous ? "blocked_needs_approval" : "prepared",
      recommendedNextStep: dangerous
        ? "דורש אישור מפורש מהבעלים לפני ביצוע."
        : "הדבק את הפרומפט בסשן Claude Code (Jarvis אינו מריץ קוד מהשרת בשלב זה).",
      claudePrompt: prompt,
    });
    const ref = id ? ` (#${id.slice(0, 8)})` : "";

    if (dangerous) {
      return { handled: true, messages: [text(
        `⛔ הבקשה סווגה כ*מסוכנת* (${sub})${ref} — לא בוצעה.\n` +
        `פרויקט: ${project.displayName} (פרודקשן רגיש). פעולות כאלה (push ל-main / דיפלוי / מיגרציות / אבטחה / סודות / מחיקה / שכתוב) דורשות אישור מפורש ממך.\n` +
        "תיעדתי משימת פיתוח חסומה. כדי להמשיך — אשר במפורש ואכין פרומפט מבוקר ל-Claude Code.",
      )] };
    }
    const approvalNote = risk === "SAFE_EDIT"
      ? `\n⚠️ עריכה ב-${project.displayName}: push ל-main/דיפלוי דורשים אישור מפורש לפי מדיניות הפרויקט.`
      : "";
    return { handled: true, messages: [text(
      `🛠️ בקשת פיתוח${ref} — ${project.displayName} · ${sub} (${risk}).\n` +
      `שים לב: איני מריץ קוד/גיט/בילד מהשרת, ואין כרגע גישת GitHub — הכנתי פרומפט מובנה ל-Claude Code ופתחתי משימת פיתוח לתיעוד 👇${approvalNote}\n\n` +
      prompt,
    )] };
  },
};
