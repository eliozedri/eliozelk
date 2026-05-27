/**
 * Development approval gate — PURE (unit-tested). Turns (role, risk, capability config) into ONE
 * explicit gate value the skill acts on. This is the single source of truth for "what is Jarvis
 * allowed to do right now" for a development/GitHub/Claude action. Owner-only; paid/secret/dangerous
 * always stop; execution paths require GitHub/Claude config + owner approval.
 */

export type DevGate =
  | "allowed_now"               // safe, configured → may proceed
  | "allowed_read_only"         // read-only/task prep allowed even without integration
  | "requires_owner_approval"   // safe but needs explicit owner OK (e.g. SAFE_EDIT branch/PR)
  | "requires_github_config"    // needs GitHub integration enabled + token
  | "requires_claude_setup"     // needs Claude Code Action secret in GitHub
  | "requires_paid_api_approval"// involves paid usage (e.g. image generation)
  | "blocked_dangerous"         // main push / deploy / migrations / auth / secrets / Meta / delete
  | "blocked_external_user";    // not the owner

export interface GateCtx {
  role: string;                 // "master" | "external" | ...
  risk: "READ_ONLY" | "TASK_ONLY" | "NEW_PROJECT_PROPOSAL" | "SAFE_EDIT" | "DANGEROUS";
  githubConfigured: boolean;
  claudeConfigured: boolean;
  needsRepoCreate?: boolean;
  paid?: boolean;
}

export function evaluateGate(c: GateCtx): DevGate {
  if (c.role !== "master") return "blocked_external_user";
  if (c.risk === "DANGEROUS") return "blocked_dangerous";
  if (c.paid) return "requires_paid_api_approval";

  switch (c.risk) {
    case "READ_ONLY":
      return "allowed_read_only";          // analysis / status / prompt prep — always safe
    case "TASK_ONLY":
      return "allowed_now";                // create internal task / prompt / issue body
    case "NEW_PROJECT_PROPOSAL":
      if (!c.needsRepoCreate) return "allowed_now";          // proposal only
      return c.githubConfigured ? "requires_owner_approval" : "requires_github_config";
    case "SAFE_EDIT":
      if (!c.githubConfigured) return "requires_github_config";
      if (!c.claudeConfigured) return "requires_claude_setup";
      return "requires_owner_approval";    // branch/PR via Claude Code, never main, owner reviews
    default:
      return "requires_owner_approval";
  }
}

/** Owner-facing Hebrew explanation for a gate value. */
export function gateMessage(gate: DevGate): string {
  switch (gate) {
    case "allowed_now": return "אפשר לבצע עכשיו (בטוח/מוגדר).";
    case "allowed_read_only": return "מותר לבדיקה/הכנת משימה בלבד.";
    case "requires_owner_approval": return "דורש אישור מפורש ממך לפני ביצוע.";
    case "requires_github_config": return "דורש חיבור GitHub (GITHUB_INTEGRATION_ENABLED + טוקן).";
    case "requires_claude_setup": return "דורש הגדרת Claude Code Action (secret ב-GitHub).";
    case "requires_paid_api_approval": return "כרוך בעלות API — דורש אישור מפורש ממך.";
    case "blocked_dangerous": return "פעולה מסוכנת — חסומה עד אישור מפורש.";
    case "blocked_external_user": return "אינו זמין למשתמש חיצוני.";
  }
}
