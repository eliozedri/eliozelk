import "server-only";
import { githubAvailable } from "./github";

/**
 * Claude Code execution mode — HONEST. Jarvis (serverless) cannot execute Claude Code directly and
 * cannot read GitHub Actions secrets. So:
 *  - no GitHub integration → "prompt_only" (Jarvis only prepares a Claude Code prompt/task);
 *  - GitHub integration live → "issue_comment_at_claude" (Jarvis opens an issue; commenting @claude
 *    triggers the Claude Code GitHub Action — branch/PR only, no merge/deploy — once the owner has
 *    set the Action secret, which Jarvis cannot verify from here).
 * "workflow_dispatch" / "future_private_runner" are reserved for later. Never claims live execution.
 */
export type ClaudeExecutionMode = "unavailable" | "prompt_only" | "issue_comment_at_claude" | "workflow_dispatch" | "future_private_runner";

export function claudeExecutionMode(): ClaudeExecutionMode {
  return githubAvailable() ? "issue_comment_at_claude" : "prompt_only";
}

export function claudeStatusNote(): string {
  return githubAvailable()
    ? "Claude Code ירוץ דרך GitHub Action בתגובת @claude ב-issue/PR (לאחר הגדרת secret ב-GitHub; branch/PR בלבד, ללא מיזוג/דיפלוי אוטומטי)."
    : "כרגע אפשר רק להכין פרומפט/משימה ל-Claude Code — אין חיבור GitHub פעיל ואיני מריץ קוד מהשרת.";
}
