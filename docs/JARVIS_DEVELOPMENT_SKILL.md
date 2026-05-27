# Jarvis Development / Claude Code Skill (Stage 1)

Owner-only skill that lets Jarvis help with **approved code projects** and **new project requests**.
Code: `src/lib/jarvis/skills/development/`. Routed from the Brain via coarse intent `development`.

> **Honest scope (Stage 1):** Jarvis runs on **serverless** (no local filesystem / git / build / logs)
> and currently has **no GitHub API access**. So it does **NOT execute code, run git/build, create
> repos, open PRs, or trigger Actions.** It **classifies** the request, **gates risk**, and produces
> a **Claude Code prompt + development task** (existing project) or a **new-project proposal**. It
> never pretends anything was created or executed.

## Access — what Jarvis can/can't do today

| Capability | Now? | Missing to enable |
|---|---|---|
| Execute Claude Code directly | ❌ | A runner with FS access (GitHub Action `anthropics/claude-code-action`, or a private runner/SDK) |
| List GitHub repos | ❌ | A GitHub App or PAT (`GITHUB_TOKEN`/App) with repo scope |
| Create a GitHub repo | ❌ | GitHub App/token + explicit owner approval per request |
| Open issues / PRs | ❌ | GitHub App/token + repo permissions |
| Trigger Claude Code GitHub Action | ❌ | `.github/workflows` + `ANTHROPIC_API_KEY` as an Actions secret + repo perms |
| Prepare a Claude Code prompt / dev task | ✅ | — |
| Propose a new project (name/repo/stack/MVP/plan) | ✅ | — |
| Classify risk + block DANGEROUS | ✅ | — |

`githubAccess()` (`registry.ts`) detects credentials by env presence only (never prints values);
currently returns unavailable.

## Project registry (`registry.ts`)

Explicit allowlist. Fields: `projectId, displayName, repoOwner, repoName, repoUrl, localPath,
defaultBranch, projectType (existing_project | new_project_request | archived_project |
sensitive_production_project), sensitivityLevel, allowedModes, requiresApprovalForCommit/Push/Main/
Deploy, notes`.

**Elkayam** = `sensitive_production_project`, sensitivity `production`, branch `main`:
read-only + task/prompt only in Stage 1; **push to main / deploy / migrations / auth / secrets /
Meta callback always require explicit owner approval.**

## Risk levels (`classify.ts`)

`READ_ONLY` (inspect/logs/git-status/build-errors) · `TASK_ONLY` (prepare prompt / create task) ·
`NEW_PROJECT_PROPOSAL` (plan a new app; no repo creation) · `SAFE_EDIT` (scoped edit; approval per
project policy) · `DANGEROUS` (main push / deploy / migrations / auth / secrets / billing / Meta /
delete / rewrite → **blocked pending explicit approval**).

## Behavior

- **Existing project** → Claude Code prompt + `jarvis_dev_tasks` row (status `prepared`). DANGEROUS →
  `blocked_needs_approval`, never executed.
- **New project** ("תבנה לי אפליקציה…") → a proposal (name/repo/stack/MVP/plan) + pending task;
  honest that no repo was created and GitHub access is missing.
- **Ambiguous** ("תתקן את זה") → asks which project (lists known + "new") and the scope — never guesses.
- **Owner-only**: re-checked in the skill; external senders are clamped away by the safety validator
  and never reach this skill.

## Audit

Every request → `jarvis_dev_tasks` (requested_by, channel, project_id, original_message,
interpreted_intent, risk_level, selected_action, approval_required, status, recommended_next_step,
claude_prompt, result_summary, linked_commit) + a `jarvis_brain_audit` row.

## Autonomous Capability Resolution (Stage 2.5)

`capabilityResolver.ts` checks whether a requested capability is already reachable (provider/key/
skill) and whether enabling it is free/safe or `needs_approval` (paid/secret/manual). The Image/
Creative skill uses it: e.g. image generation → "Gemini key exists; Nano Banana is Gemini's image
model, connectable via the same key but **paid** + not wired" → capability request + offer a
**Development connection task** (`tool_connection_request` → `SAFE_EDIT`, approval-gated). On owner
approval, the Development skill prepares the Claude Code connection task (behind an env flag, no
secrets in code, billing approved). Jarvis never fakes generation and never auto-enables a paid tool.
See `docs/JARVIS_AGENT_ARCHITECTURE.md` → "Autonomous Capability Resolution".

## Stage 2 — GitHub integration layer (built, disabled until creds)

The gated GitHub layer (`github.ts`) + Claude Code Action workflow (`.github/workflows/claude-code.yml`)
now exist. When `GITHUB_INTEGRATION_ENABLED=true` + a token are set, Jarvis can create a structured
issue; commenting `@claude` on it runs the Claude Code Action on a branch/PR (never main, no
auto-merge/deploy). Until then Jarvis prepares the issue body + prompt for manual use. Full setup,
ENV, permissions, secrets, and exact owner steps: **`docs/JARVIS_GITHUB_CLAUDE_CODE_INTEGRATION.md`**.

## Next step to enable real execution (future, with approval)

1. **GitHub App/token** (repo scope) → list repos, create repos, open issues/PRs.
2. **Claude Code GitHub Action** (`anthropics/claude-code-action`) + `ANTHROPIC_API_KEY` Actions
   secret → Jarvis files an issue/PR task; the Action runs Claude Code in CI (branch/PR, never
   direct to main). Owner approval gates remain.
3. Push-to-main / deploy / DB / auth / secrets stay **DANGEROUS → explicit approval** regardless.
