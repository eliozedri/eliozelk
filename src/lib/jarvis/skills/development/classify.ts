/**
 * Development sub-intent + RISK classification. PURE (no `server-only`) so it is unit-tested.
 * The brain routes "development" coarse intent here; this decides WHAT kind of dev request it is
 * and HOW risky it is. Risk gates execution: DANGEROUS is always blocked pending explicit approval.
 */

export type DevSubIntent =
  | "code_debug"
  | "build_error_analysis"
  | "terminal_summary"
  | "git_status_check"
  | "prepare_claude_prompt"
  | "create_development_task"
  | "safe_code_edit_request"
  | "deploy_status_check"
  | "project_architecture_question"
  | "new_project_request"
  | "tool_connection_request"
  | "risky_change_request";

export type DevRiskLevel = "READ_ONLY" | "TASK_ONLY" | "NEW_PROJECT_PROPOSAL" | "SAFE_EDIT" | "DANGEROUS";

// Owner asks to BUILD A NEW app/project/repo (not necessarily Elkayam).
const NEW_PROJECT_RE = /תבנה\s+לי\s+(אפליקצי|אתר|מערכת|פרויקט|רפו|repo|app)|פרויקט\s+חדש|אפליקצי\S*\s+חדשה|רפו\s+חדש|new\s+(project|app|repo)|create\s+(a\s+)?(new\s+)?(project|repo|app)/i;

// Vague references with no project + no scope → must ask clarification, never guess.
const AMBIGUOUS_RE = /^(תתקן|תקן|תבדוק|תשנה|תעדכן)\s+(את\s+)?(זה|זאת|אותו|אותה|את\s+האפליקציה|את\s+המערכת)\s*\??$/;

const SUB_PATTERNS: Array<{ id: DevSubIntent; re: RegExp }> = [
  { id: "tool_connection_request", re: /תחבר|לחבר|חיבור\s+(כלי|שירות|ספק)|connect|integrate|אינטגרציה|נאנו\s*בננה|nano\s*banana/i },
  { id: "build_error_analysis", re: /בילד|build|קומפילציה|נפל\s+ה?build|למה\s+ה?בילד|deploy\s+fail/i },
  { id: "git_status_check", re: /git|גיט|מה\s+השתנה|אילו\s+קבצים|status|branch|קומיט|commit/i },
  { id: "terminal_summary", re: /לוג(ים)?|logs|טרמינל|terminal|פלט|שגיאה\s+בלוג/i },
  { id: "deploy_status_check", re: /דיפלוי|deploy|וורסל|vercel|פרודקשן|production\s+status/i },
  { id: "prepare_claude_prompt", re: /פרומפט|prompt|תכין\s+(לי\s+)?פרומפט|הכן\s+פרומפט|לקלוד|claude/i },
  { id: "create_development_task", re: /משימת\s+פיתוח|פתח\s+משימה\s+לסשן|development\s+task|סשן\s+חדש/i },
  { id: "safe_code_edit_request", re: /תקן|תעדכן\s+(את\s+)?ה?קוד|שנה\s+(את\s+)?ה?קוד|edit|fix\b|תיקון\s+קטן/i },
  { id: "project_architecture_question", re: /ארכיטקטורה|architecture|מבנה\s+ה?פרויקט|איך\s+בנוי|מודול/i },
  { id: "code_debug", re: /למה\s+.*לא\s+(עובד|מופיע)|תמצא\s+למה|דבאג|debug|באג|bug|תבדוק\s+(את\s+)?(הקוד|מודול)/i },
];

// Anything touching these is DANGEROUS and must be blocked pending explicit owner approval.
const DANGEROUS_RE =
  /מחק|תמחק|delete|drop\b|migration|מיגרציה|schema|סכימה|auth|אימות|הרשאות|secret|סוד|env\b|מפתח|api\s*key|payment|תשלום|billing|חיוב|meta\s*callback|webhook|לשכתב|rewrite|reset|force\s*push|production\s+deploy|לשנות\s+פרודקשן/i;

export function classifyDevIntent(text: string): DevSubIntent {
  const t = text ?? "";
  if (NEW_PROJECT_RE.test(t)) return "new_project_request";
  for (const p of SUB_PATTERNS) if (p.re.test(t)) return p.id;
  return "code_debug";
}

export function classifyDevRisk(text: string, sub: DevSubIntent): DevRiskLevel {
  if (sub === "new_project_request") return "NEW_PROJECT_PROPOSAL";
  if (DANGEROUS_RE.test(text ?? "") || sub === "risky_change_request") return "DANGEROUS";
  // Connecting a provider/tool is a code change that may involve billing → approval-gated edit.
  if (sub === "tool_connection_request" || sub === "safe_code_edit_request") return "SAFE_EDIT";
  if (sub === "prepare_claude_prompt" || sub === "create_development_task") return "TASK_ONLY";
  return "READ_ONLY";
}

/** Vague dev request with no project/scope → ask clarification rather than guess. */
export function isAmbiguousDevRequest(text: string): boolean {
  return AMBIGUOUS_RE.test((text ?? "").trim());
}
