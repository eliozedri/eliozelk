import "server-only";

/**
 * GitHub integration layer — SAFE & GATED. Every operation is disabled unless
 * `GITHUB_INTEGRATION_ENABLED=true` AND a credential is present. With no credential (current state)
 * all ops return `{ ok:false, reason }` and the Development skill falls back to preparing an issue
 * body + Claude Code prompt for manual use — it never fakes that anything was created. Plain fetch
 * (no Octokit dependency). Tokens are read from env and NEVER logged. Repo creation is additionally
 * gated by `JARVIS_DEV_ALLOW_REPO_CREATE`. GitHub App (JWT) auth is a documented future path;
 * Stage 2 wires the fine-grained-PAT path.
 */

export interface GithubConfig {
  enabled: boolean;
  authMode: "app" | "pat" | "none";
  owner: string | null;
  repo: string | null;
  allowRepoCreate: boolean;
  defaultProject: string;
}

export function loadGithubConfig(env: Record<string, string | undefined> = process.env): GithubConfig {
  const hasToken = !!(env.GITHUB_TOKEN || env.GITHUB_PAT);
  const hasApp = !!(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_INSTALLATION_ID);
  const requested = (env.GITHUB_AUTH_MODE ?? "").toLowerCase();
  const authMode: GithubConfig["authMode"] = requested === "app" ? "app" : requested === "pat" ? "pat" : hasApp ? "app" : hasToken ? "pat" : "none";
  const enabled = env.GITHUB_INTEGRATION_ENABLED === "true" && (hasToken || hasApp);
  return {
    enabled,
    authMode,
    owner: env.GITHUB_OWNER ?? null,
    repo: env.GITHUB_REPO ?? null,
    allowRepoCreate: env.JARVIS_DEV_ALLOW_REPO_CREATE === "true",
    defaultProject: env.JARVIS_DEV_DEFAULT_PROJECT ?? "elkayam",
  };
}

export function githubAvailable(): boolean {
  return loadGithubConfig().enabled;
}

/** Owner-facing availability summary (no secrets). */
export function githubStatus(): { available: boolean; reason: string } {
  const cfg = loadGithubConfig();
  if (cfg.enabled) return { available: true, reason: `GitHub מחובר (${cfg.authMode}, ${cfg.owner ?? "?"}/${cfg.repo ?? "?"}).` };
  return { available: false, reason: "אין כרגע אינטגרציית GitHub פעילה (לא הוגדר GITHUB_INTEGRATION_ENABLED + טוקן/App) — לא ניתן ליצור issues/repos/PR; מכין גוף issue + פרומפט לשימוש ידני." };
}

export interface GhResult {
  ok: boolean;
  reason?: string;
  url?: string;
  number?: number;
}

function token(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
}

async function ghFetch(path: string, method: "GET" | "POST", body?: unknown): Promise<{ ok: boolean; status: number; json?: unknown; reason?: string }> {
  const cfg = loadGithubConfig();
  if (!cfg.enabled) return { ok: false, status: 0, reason: "github_disabled" };
  if (cfg.authMode === "app") return { ok: false, status: 0, reason: "app_mode_not_implemented_stage2_use_pat" };
  const t = token();
  if (!t) return { ok: false, status: 0, reason: "no_token" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: { authorization: `Bearer ${t}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json", "user-agent": "jarvis-dev" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: unknown;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    return { ok: res.ok, status: res.status, json, reason: res.ok ? undefined : `http_${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, reason: err instanceof Error && err.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

export async function createIssue(owner: string, repo: string, title: string, body: string, labels: string[] = []): Promise<GhResult> {
  if (!githubAvailable()) return { ok: false, reason: "github_unavailable" };
  const r = await ghFetch(`/repos/${owner}/${repo}/issues`, "POST", { title, body, labels });
  if (!r.ok) return { ok: false, reason: r.reason ?? "error" };
  const data = r.json as { html_url?: string; number?: number };
  return { ok: true, url: data?.html_url, number: data?.number };
}

export async function getIssueStatus(owner: string, repo: string, num: number): Promise<GhResult> {
  if (!githubAvailable()) return { ok: false, reason: "github_unavailable" };
  const r = await ghFetch(`/repos/${owner}/${repo}/issues/${num}`, "GET");
  if (!r.ok) return { ok: false, reason: r.reason ?? "error" };
  const data = r.json as { html_url?: string; state?: string; number?: number };
  return { ok: true, url: data?.html_url, number: data?.number, reason: data?.state };
}

export async function listRepos(): Promise<GhResult & { repos?: string[] }> {
  if (!githubAvailable()) return { ok: false, reason: "github_unavailable" };
  const r = await ghFetch(`/user/repos?per_page=50&sort=updated`, "GET");
  if (!r.ok) return { ok: false, reason: r.reason ?? "error" };
  const data = (r.json as { full_name?: string }[]) ?? [];
  return { ok: true, repos: data.map((x) => x.full_name ?? "").filter(Boolean) };
}

/** Repo creation — double-gated (integration enabled AND JARVIS_DEV_ALLOW_REPO_CREATE). */
export async function createRepo(name: string, isPrivate = true): Promise<GhResult> {
  const cfg = loadGithubConfig();
  if (!cfg.enabled) return { ok: false, reason: "github_unavailable" };
  if (!cfg.allowRepoCreate) return { ok: false, reason: "repo_create_disabled (set JARVIS_DEV_ALLOW_REPO_CREATE=true)" };
  const r = await ghFetch(`/user/repos`, "POST", { name, private: isPrivate, auto_init: true });
  if (!r.ok) return { ok: false, reason: r.reason ?? "error" };
  const data = r.json as { html_url?: string };
  return { ok: true, url: data?.html_url };
}

export async function createIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GhResult> {
  if (!githubAvailable()) return { ok: false, reason: "github_unavailable" };
  const r = await ghFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, "POST", { body });
  if (!r.ok) return { ok: false, reason: r.reason ?? "error" };
  return { ok: true, url: (r.json as { html_url?: string })?.html_url };
}

export async function getPRStatus(owner: string, repo: string, num: number): Promise<GhResult> {
  if (!githubAvailable()) return { ok: false, reason: "github_unavailable" };
  const r = await ghFetch(`/repos/${owner}/${repo}/pulls/${num}`, "GET");
  if (!r.ok) return { ok: false, reason: r.reason ?? "error" };
  const d = r.json as { html_url?: string; state?: string; merged?: boolean };
  return { ok: true, url: d?.html_url, reason: d?.merged ? "merged" : d?.state };
}

export async function getWorkflowStatus(owner: string, repo: string, runId: number): Promise<GhResult> {
  if (!githubAvailable()) return { ok: false, reason: "github_unavailable" };
  const r = await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}`, "GET");
  if (!r.ok) return { ok: false, reason: r.reason ?? "error" };
  const d = r.json as { html_url?: string; status?: string; conclusion?: string };
  return { ok: true, url: d?.html_url, reason: d?.conclusion ?? d?.status };
}

/** Branch/PR/workflow execution — RESERVED + gated. Branch/PR work happens via the Claude Code
 * GitHub Action (issue @claude), never by a direct serverless push to main. */
export async function triggerWorkflow(): Promise<GhResult> {
  if (!githubAvailable()) return { ok: false, reason: "github_unavailable" };
  return { ok: false, reason: "use_issue_comment_at_claude" }; // prefer the @claude comment path
}

export async function listWorkflowRuns(owner: string, repo: string, perPage = 5): Promise<{ ok: boolean; runs?: { name: string; status: string; conclusion: string | null; url: string; created_at: string }[]; reason?: string }> {
  if (!githubAvailable()) return { ok: false, reason: "github_unavailable" };
  const r = await ghFetch(`/repos/${owner}/${repo}/actions/runs?per_page=${perPage}`, "GET");
  if (!r.ok) return { ok: false, reason: r.reason ?? "error" };
  const d = r.json as { workflow_runs?: { name?: string; status?: string; conclusion?: string | null; html_url?: string; created_at?: string }[] };
  return { ok: true, runs: (d?.workflow_runs ?? []).map((w) => ({ name: w.name ?? "", status: w.status ?? "", conclusion: w.conclusion ?? null, url: w.html_url ?? "", created_at: w.created_at ?? "" })) };
}

/** Rich config detector for status reporting (no secret values). */
export function detectGitHubConfig(): { status: "configured" | "disabled" | "missing_token" | "partial"; authMode: string; canCreateRepo: boolean; owner: string | null; repo: string | null } {
  const cfg = loadGithubConfig();
  const hasToken = !!(process.env.GITHUB_TOKEN || process.env.GITHUB_PAT);
  let status: "configured" | "disabled" | "missing_token" | "partial";
  if (cfg.enabled) status = "configured";
  else if (process.env.GITHUB_INTEGRATION_ENABLED === "true" && !hasToken) status = "missing_token";
  else if (hasToken || cfg.owner || cfg.repo) status = "partial";
  else status = "disabled";
  return { status, authMode: cfg.authMode, canCreateRepo: cfg.allowRepoCreate, owner: cfg.owner, repo: cfg.repo };
}
