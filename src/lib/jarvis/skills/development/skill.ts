import "server-only";
import type { Skill, SkillContext, SkillResult } from "../../types";
import { text } from "../../types";
import { findProject, knownProjectsList, type DevProject } from "./registry";
import { classifyDevIntent, classifyDevRisk, isAmbiguousDevRequest } from "./classify";
import { buildClaudePrompt, buildNewProjectProposal } from "./prompt";
import { createDevTask } from "./store";
import { githubStatus, githubAvailable, createIssue } from "./github";

/**
 * Development / Claude Code skill — OWNER-ONLY. Stage 2 adds a GATED GitHub integration:
 *  - When GitHub integration is ENABLED + credentialed → it can open a structured issue (and the
 *    Claude Code GitHub Action runs when someone comments @claude on a branch/PR — never main,
 *    never auto-merge, never auto-deploy).
 *  - When DISABLED / no creds (current state) → it prepares the exact issue body + Claude Code
 *    prompt + dev task for manual use, and says so honestly. It NEVER fakes creation/execution.
 * DANGEROUS requests (push-to-main / deploy / migrations / auth / secrets / Meta / delete / rewrite)
 * are BLOCKED pending explicit owner approval. Ambiguous requests ask which project + scope.
 * Jarvis runs serverless: no local code/git/build execution.
 */

function issueBody(project: DevProject, prompt: string): string {
  return [
    prompt,
    "",
    "---",
    "להרצת Claude Code: כתוב תגובה עם `@claude` ב-issue/PR הזה (לאחר שה-Action וה-secret מוגדרים).",
    "Claude Code יעבוד על branch/PR בלבד — לא ל-main, לא מיזוג אוטומטי, לא דיפלוי אוטומטי.",
  ].join("\n");
}

export const developmentSkill: Skill = {
  name: "development",
  async handle(ctx: SkillContext): Promise<SkillResult> {
    if (ctx.input.senderRole !== "master") {
      return { handled: true, messages: [text("הפעולה הזו זמינה לבעלים בלבד.")] };
    }
    const body = (ctx.input.text ?? "").trim();
    if (!body) {
      return { handled: true, messages: [text("מה לבדוק/לבנות? למשל: 'בדוק למה הבילד נפל', 'תתקן את בעיית ההתראות באלקיים', 'תכין פרומפט לקלוד', או 'תבנה לי אפליקציה חדשה'.")] };
    }

    if (isAmbiguousDevRequest(body)) {
      return { handled: true, messages: [text(
        "לאיזה פרויקט הכוונה, ומה בדיוק לבצע? 🙂\n" +
        "פרויקטים מוכרים:\n" + knownProjectsList().join("\n") + "\n• פרויקט חדש (אפרט הצעה)\n" +
        "ותגיד אם זה קיים או חדש, ה-scope, והאם Claude Code אמור לבצע (branch/PR) או רק להכין משימה.",
      )] };
    }

    const sub = classifyDevIntent(body);
    const risk = classifyDevRisk(body, sub);
    const gh = githubStatus();

    // New project → proposal only. Repo creation needs GitHub + JARVIS_DEV_ALLOW_REPO_CREATE + approval.
    if (sub === "new_project_request") {
      const proposal = buildNewProjectProposal(body, gh.available);
      const id = await createDevTask({
        requestedBy: ctx.input.senderId, channel: ctx.input.channel, projectId: "new_project",
        originalMessage: body, interpretedIntent: sub, riskLevel: risk,
        selectedAction: "new_project_proposal", approvalRequired: true, status: "pending",
        recommendedNextStep: "אשר שם פרויקט + repo + stack. יצירת repo דורשת GitHub מחובר + JARVIS_DEV_ALLOW_REPO_CREATE + אישור מפורש.",
        claudePrompt: proposal, githubActionAttempted: false,
      });
      const ref = id ? ` (#${id.slice(0, 8)})` : "";
      return { handled: true, messages: [text(`${proposal}\n\nתועדה משימת פיתוח${ref}.`)] };
    }

    const project = findProject(body);
    if (!project) {
      return { handled: true, messages: [text(
        "לא בטוח לאיזה פרויקט להתייחס. הפרויקטים המוכרים:\n" + knownProjectsList().join("\n") + "\n• פרויקט חדש\nאיזה מהם?",
      )] };
    }

    const dangerous = risk === "DANGEROUS";
    const prompt = buildClaudePrompt(project, sub, risk, body);

    if (dangerous) {
      const id = await createDevTask({
        requestedBy: ctx.input.senderId, channel: ctx.input.channel, projectId: project.projectId,
        originalMessage: body, interpretedIntent: sub, riskLevel: risk,
        selectedAction: "blocked_pending_approval", approvalRequired: true, status: "blocked_needs_approval",
        recommendedNextStep: "דורש אישור מפורש מהבעלים לפני ביצוע.", claudePrompt: prompt,
        repo: project.repoName, githubActionAttempted: false,
      });
      const ref = id ? ` (#${id.slice(0, 8)})` : "";
      return { handled: true, messages: [text(
        `⛔ הבקשה סווגה כ*מסוכנת* (${sub})${ref} — לא בוצעה.\n` +
        `פרויקט: ${project.displayName} (פרודקשן רגיש). פעולות כאלה (push ל-main / דיפלוי / מיגרציות / אבטחה / סודות / מחיקה / שכתוב) דורשות אישור מפורש ממך.\n` +
        "תיעדתי משימת פיתוח חסומה. אשר במפורש כדי שאכין מסלול מבוקר (branch/PR דרך Claude Code Action).",
      )] };
    }

    // Non-dangerous: try to open a GitHub issue if integration is enabled; else prepare it for manual use.
    const fullIssueBody = issueBody(project, prompt);
    let issueUrl: string | null = null;
    let attempted = false;
    if (githubAvailable() && project.repoOwner && project.repoName) {
      attempted = true;
      const res = await createIssue(project.repoOwner, project.repoName, `[Jarvis] ${sub}: ${body.slice(0, 60)}`, fullIssueBody, ["jarvis", "claude-code"]);
      if (res.ok) issueUrl = res.url ?? null;
    }

    const id = await createDevTask({
      requestedBy: ctx.input.senderId, channel: ctx.input.channel, projectId: project.projectId,
      originalMessage: body, interpretedIntent: sub, riskLevel: risk,
      selectedAction: issueUrl ? "github_issue_created" : "claude_prompt_prepared",
      approvalRequired: risk === "SAFE_EDIT", status: "prepared",
      recommendedNextStep: issueUrl ? "כתוב @claude ב-issue להרצת Claude Code (branch/PR)." : "הדבק את גוף ה-issue/פרומפט ב-Claude Code (אין כרגע גישת GitHub).",
      claudePrompt: prompt, repo: project.repoName, githubActionAttempted: attempted, issueUrl,
    });
    const ref = id ? ` (#${id.slice(0, 8)})` : "";

    if (issueUrl) {
      return { handled: true, messages: [text(
        `🛠️ בקשת פיתוח${ref} — ${project.displayName} · ${sub} (${risk}).\n` +
        `פתחתי issue: ${issueUrl}\nכתוב שם @claude כדי שה-Claude Code Action ירוץ (branch/PR בלבד, ללא מיזוג/דיפלוי אוטומטי).`,
      )] };
    }
    const approvalNote = risk === "SAFE_EDIT" ? `\n⚠️ עריכה ב-${project.displayName}: push ל-main/דיפלוי דורשים אישור מפורש לפי מדיניות הפרויקט.` : "";
    return { handled: true, messages: [text(
      `🛠️ בקשת פיתוח${ref} — ${project.displayName} · ${sub} (${risk}).\n` +
      `${gh.reason}${approvalNote}\n\nגוף issue + פרומפט מוכן ל-Claude Code 👇\n\n${fullIssueBody}`,
    )] };
  },
};
