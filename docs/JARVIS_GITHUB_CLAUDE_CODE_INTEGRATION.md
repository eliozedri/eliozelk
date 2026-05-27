# Jarvis ↔ GitHub + Claude Code Integration (Stage 2)

Connects the Development skill to GitHub and the Claude Code GitHub Action — **safely and gated**.
Code: `src/lib/jarvis/skills/development/github.ts` + `.github/workflows/claude-code.yml`.

## What Jarvis can do NOW vs. when configured

| Capability | Now (no creds) | When configured |
|---|---|---|
| Classify dev request + risk-gate | ✅ | ✅ |
| Prepare Claude Code prompt + dev task | ✅ | ✅ |
| Prepare a GitHub issue **body** for manual paste | ✅ | ✅ |
| **Create** a GitHub issue | ❌ → manual body | ✅ (`createIssue`) |
| List repos | ❌ | ✅ (`listRepos`) |
| Create a repo | ❌ | ✅ only if `JARVIS_DEV_ALLOW_REPO_CREATE=true` **+** explicit approval |
| Trigger Claude Code Action | ❌ | ✅ via `@claude` issue/PR comment (branch/PR only) |
| Execute Claude Code on serverless | ❌ never (no FS) | ❌ — runs in GitHub Actions CI only |
| Push to main / deploy prod | ❌ never automatic | ❌ never automatic (always owner approval) |

Detection: `github.ts loadGithubConfig` (env presence only, never values). Current state: **disabled**.

## Architecture (chosen model: GitHub Actions + Claude Code)

```
Owner → Jarvis Brain → Development skill → risk gate
  → (if enabled) GitHub issue with @claude  → Claude Code GitHub Action (CI)
      → Claude works on a BRANCH / opens a PR  → owner reviews → owner merges
  → (if disabled) issue body + Claude Code prompt + dev task for manual use
```
No private runner / local SDK in Stage 2 (documented future). CI is preferred: controlled env,
GitHub audit trail, branch/PR review, no local terminal, no production mutation.

## Required ENV (Vercel — Jarvis side, for issue/repo creation)

```
GITHUB_INTEGRATION_ENABLED=false   # master switch
GITHUB_AUTH_MODE=pat               # pat (Stage 2) | app (future) | none
GITHUB_OWNER=eliozedri
GITHUB_REPO=eliozelk
GITHUB_TOKEN=...                   # fine-grained PAT (see permissions) — or App envs (future)
JARVIS_DEV_ALLOW_REPO_CREATE=false # gate for new-repo creation
JARVIS_DEV_DEFAULT_PROJECT=elkayam
# GitHub App (future, preferred over PAT): GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_INSTALLATION_ID
```
Without `GITHUB_INTEGRATION_ENABLED=true` + a token, all GitHub ops return unavailable and Jarvis
falls back to manual issue body + prompt.

## Required GitHub permissions (fine-grained PAT — real dev flow)

Grant write access so Jarvis can run a real development flow (the system still enforces no-main /
no-deploy / approval via the gates — the token is *capability*, the gate is *policy*):
- **Metadata:** Read-only (mandatory)
- **Issues:** Read and write (create issues/comments → triggers `@claude`)
- **Contents:** Read and write (create branches / commit file changes on a branch)
- **Pull requests:** Read and write (open/update PRs for owner review)

Do **NOT** grant: **Administration** (repo settings/creation/delete), **Secrets**, **Workflows**,
billing. **Workflows is NOT needed** — the Claude Code Action is triggered by a `@claude` comment
(Issues RW) and runs under the Actions `GITHUB_TOKEN`, not the PAT; the PAT would need Workflows
permission only to EDIT files under `.github/workflows/`, which is an approval-gated change we avoid
by default. Repo creation needs **Administration** → grant only if/when you set
`JARVIS_DEV_ALLOW_REPO_CREATE=true` for a specific repo.

**System guardrails on top of the token (enforced by `approvalGate.ts`/registry, regardless of PAT
scope):** Elkayam = sensitive production → no direct push to main, no production deploy, no
destructive/DB/auth/secrets/Meta changes without explicit owner approval; work flows through
branch/Issue/PR/Claude Code; every action is audited; DANGEROUS → blocked.

## Required GitHub Actions secrets (Claude Code Action — repo side)

In the repo: **Settings → Secrets and variables → Actions → New repository secret**:
- `CLAUDE_CODE_OAUTH_TOKEN` — **recommended**, uses your Claude subscription (no extra API billing);
  generate locally with `claude setup-token`.
- **or** `ANTHROPIC_API_KEY` — uses the paid Anthropic API (metered cost). The workflow references
  both; add whichever you choose. Until then the workflow is inert.

## Workflow safety (`.github/workflows/claude-code.yml`)

Triggers ONLY on `issue_comment` / `pull_request_review_comment` containing `@claude`, or manual
`workflow_dispatch`. Never on push. No auto-merge, no deploy. Claude Code works on a branch/PR; the
owner reviews + merges. Inert until a credential secret exists.

## Elkayam protection

`sensitive_production_project`: push-to-main / deploy / migrations / auth / secrets / Meta callback
are `requiresApproval...=true` and classified **DANGEROUS → blocked** pending explicit owner approval.
Allowed without approval: READ_ONLY checks, TASK_ONLY prompt/issue prep. SAFE_EDIT requires branch/PR.

## New project creation

`new_project_request` → a proposal (name/repo/stack/MVP/plan) + pending task. Repo is created ONLY
when GitHub is enabled **and** `JARVIS_DEV_ALLOW_REPO_CREATE=true` **and** the owner explicitly
approves a confirmed repo name. Never automatic, never paid services without approval.

## Disable

Set `GITHUB_INTEGRATION_ENABLED=false` (or remove the token) → Jarvis returns to manual issue
body + prompt mode. Delete the workflow file to fully remove the Action.

## Exact manual setup steps (owner — do these to activate; I will not do them)

1. **Create a fine-grained PAT**: github.com → Settings → Developer settings → Fine-grained tokens →
   repo `eliozedri/eliozelk` → permissions: Issues RW, Metadata R (+ Contents/PRs RW only if you
   want branch/PR edits). Copy it.
2. **Add Jarvis env** in Vercel → Project → Settings → Environment Variables (Production):
   `GITHUB_INTEGRATION_ENABLED=true`, `GITHUB_AUTH_MODE=pat`, `GITHUB_OWNER=eliozedri`,
   `GITHUB_REPO=eliozelk`, `GITHUB_TOKEN=<paste>` (Sensitive). Redeploy.
3. **Add the Claude Code secret** in GitHub → repo → Settings → Secrets and variables → Actions:
   `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) — or `ANTHROPIC_API_KEY` (paid).
4. (Optional) branch protection on `main` so the Action's PRs require your review before merge.
5. Tell me once done and I'll verify `githubStatus()` reports available and test an issue creation.

## Future: GitHub App + private runner

GitHub App (JWT → installation token) is preferred over PAT for scoping/rotation (Stage 3).
A private runner / Claude Agent SDK execution is possible later but needs sandboxing, allow-listed
commands, and stricter approval — not in scope now.
