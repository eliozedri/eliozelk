/**
 * Development project registry + capability detection. PURE config (env reads are presence-only,
 * never values). The EXPLICIT allowlist of projects Jarvis may assist with. Jarvis runs on
 * serverless: no local filesystem / git / build, and (currently) NO GitHub API access — Stage 1
 * prepares Claude Code prompts, development tasks, and new-project proposals; it does NOT execute
 * code or create repos. Elkayam is a high-sensitivity PRODUCTION project with strict approval gates.
 */

export type ProjectType = "existing_project" | "new_project_request" | "archived_project" | "sensitive_production_project";

export interface DevProject {
  projectId: string;
  displayName: string;
  repoOwner: string | null;
  repoName: string | null;
  repoUrl: string | null;
  localPath: string | null;
  defaultBranch: string;
  projectType: ProjectType;
  sensitivityLevel: "low" | "medium" | "high" | "production";
  allowedModes: string[]; // read_only | task_only | new_project_proposal | safe_edit
  requiresApprovalForCommit: boolean | "task-dependent";
  requiresApprovalForPush: boolean;
  requiresApprovalForMain: boolean;
  requiresApprovalForDeploy: boolean;
  notes: string;
}

export const DEV_PROJECTS: DevProject[] = [
  {
    projectId: "elkayam",
    displayName: "Elkayam Operations Platform",
    repoOwner: "eliozedri",
    repoName: "eliozelk",
    repoUrl: "https://github.com/eliozedri/eliozelk",
    localPath: null,
    defaultBranch: "main",
    projectType: "sensitive_production_project",
    sensitivityLevel: "production",
    allowedModes: ["read_only", "task_only"],
    requiresApprovalForCommit: "task-dependent",
    requiresApprovalForPush: true,
    requiresApprovalForMain: true,
    requiresApprovalForDeploy: true,
    notes: "Production ERP + Jarvis. Read-only checks + task/prompt generation only in Stage 1. Push to main / deploy / migrations / auth / secrets / Meta callback ALWAYS require explicit owner approval.",
  },
];

const DEFAULT_PROJECT = DEV_PROJECTS[0];

/** Resolve which registered project a request refers to, or null when it is genuinely unclear. */
export function findProject(text: string): DevProject | null {
  const t = (text ?? "").toLowerCase();
  const hit = DEV_PROJECTS.find((p) => t.includes(p.projectId) || t.includes("אלקיים") || t.includes(p.displayName.toLowerCase()));
  if (hit) return hit;
  // Single registered project + a code-ish request with no other project named → default to it.
  if (DEV_PROJECTS.length === 1) return DEFAULT_PROJECT;
  return null;
}

export function knownProjectsList(): string[] {
  return DEV_PROJECTS.map((p) => `• ${p.displayName}${p.sensitivityLevel === "production" ? " (פרודקשן — רגיש)" : ""}`);
}

/** GitHub API capability — presence-only env check (no secret values). */
export function githubAccess(): { available: boolean; reason: string } {
  const has = !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT || process.env.GITHUB_APP_ID);
  return has
    ? { available: true, reason: "GitHub credentials present" }
    : { available: false, reason: "אין כרגע אינטגרציית GitHub (לא הוגדר GitHub App/טוקן) — Jarvis אינו יכול לרשום/ליצור repos או לפתוח PR." };
}
