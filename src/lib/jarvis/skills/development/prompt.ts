import type { DevProject } from "./registry";
import type { DevSubIntent, DevRiskLevel } from "./classify";

/**
 * Claude Code prompt generator. PURE. Turns an owner dev request into a structured, safe prompt a
 * human can paste into a Claude Code session. It NEVER claims execution — it only prepares the task.
 */

const SUB_GUIDANCE: Record<DevSubIntent, string> = {
  code_debug: "Reproduce and locate the bug; explain root cause before proposing a fix.",
  build_error_analysis: "Read the failing build output, identify the exact error + file, explain the cause.",
  terminal_summary: "Summarize the relevant logs/terminal output and explain what happened.",
  git_status_check: "Report git status / changed files / current branch (read-only).",
  prepare_claude_prompt: "Produce a precise, scoped implementation prompt.",
  create_development_task: "Define a scoped development task with acceptance criteria.",
  safe_code_edit_request: "Make a SMALL, scoped edit. Run typecheck + lint + tests. No schema/secrets/prod changes.",
  deploy_status_check: "Check deployment status (read-only); do not change deploy config.",
  project_architecture_question: "Explain the relevant module/architecture (read-only).",
  new_project_request: "Propose a new project (name/repo/stack/MVP/plan). Do NOT create a repo without explicit approval + GitHub access.",
  tool_connection_request: "Connect a provider/tool behind an env flag. No secrets in code. If it incurs paid usage, require explicit owner approval before enabling. Add tests + docs.",
  risky_change_request: "DO NOT execute. Requires explicit owner approval; outline a safe plan only.",
};

/** New-project PROPOSAL (a draft — nothing is created). Honest about GitHub availability. */
export function buildNewProjectProposal(ownerMessage: string, githubAvailable: boolean): string {
  return [
    "🆕 הצעת פרויקט חדש (טיוטה בלבד — לא נוצר repo ולא נכתב קוד):",
    `הבקשה: ${ownerMessage.trim()}`,
    "",
    "הצעה לאישורך:",
    "• שם פרויקט: (לאישורך)",
    "• repo: eliozedri/<שם-לאישורך>",
    "• Stack מוצע: Next.js (App Router) + TypeScript + Tailwind + Supabase (עקבי עם אלקיים)",
    "• MVP: מסכים ראשונים + מודל נתונים בסיסי + auth + פריסה ל-preview",
    "• רמת סיכון: NEW_PROJECT_PROPOSAL (הצעה בלבד)",
    "• תוכנית פיתוח: 1) אישור שם+stack 2) scaffold 3) MVP 4) preview deploy 5) איטרציות",
    "",
    githubAvailable
      ? "יש גישת GitHub — באישורך המפורש (שם repo סופי) אוכל להמשיך ליצירה/scaffold."
      : "⚠️ אין כרגע אינטגרציית GitHub — לא ניתן ליצור repo אוטומטית. הכנתי הצעה + משימת פיתוח; ליצירה אמיתית צריך GitHub App/טוקן + אישור מפורש ממך.",
    "להמשך: אשר שם פרויקט + repo + stack.",
  ].join("\n");
}

export function buildClaudePrompt(project: DevProject, sub: DevSubIntent, risk: DevRiskLevel, ownerMessage: string): string {
  return [
    `# Claude Code task — ${project.displayName}`,
    `repo: ${project.repoUrl ?? "(local)"} · branch: ${project.defaultBranch} · risk: ${risk}`,
    "",
    `## Owner request (Hebrew)`,
    ownerMessage.trim(),
    "",
    `## Scope & guidance`,
    SUB_GUIDANCE[sub],
    "",
    `## Hard safety rules`,
    "- Read-only investigation first; explain before changing anything.",
    "- No DB migrations / schema / auth / secrets / env / Meta callback / production-deploy changes without explicit owner approval.",
    "- Any code edit must pass typecheck + lint (+ tests) and stay small and scoped.",
    "- Do not expose or print secrets. Do not break WhatsApp / Telegram / Jarvis Brain / Order Intake / OCR / LLM routing.",
    risk === "DANGEROUS" ? "- THIS REQUEST IS CLASSIFIED DANGEROUS — do NOT proceed until the owner approves explicitly." : "",
  ].filter(Boolean).join("\n");
}
