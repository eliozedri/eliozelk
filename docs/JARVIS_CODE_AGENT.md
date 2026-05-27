# Jarvis as a Private Code-Agent Orchestrator

This file is the durable memory of the vision, logic, and conclusions behind turning Jarvis into the
owner's private code-agent. Read this first when continuing the development/GitHub/Claude Code work.

## 1. Vision

- **Jarvis** = the owner's master **Brain / Orchestrator**.
- **Gemini / Groq** = the **reasoning / understanding** layer (Gemini first, Groq fallback).
- **GitHub** = the **source of truth** for projects / repos / code / issues / PRs.
- **Claude Code** = the **execution engine** for development work (via GitHub Actions, branch/PR).
- **Supabase** = the **persistence / audit / task / state** layer.
- **WhatsApp** = the owner's primary **control / communication** channel.

## 2. Logic (request → action)

```
Owner/Master WhatsApp message (text / image+caption / file / button)
→ identify sender role (gateway)
→ collect text/caption + media metadata + state
→ Jarvis Brain (decideBrain): Gemini → Groq → deterministic fallback (only if LLM fails/rejected)
→ safety validator (role gate, no auto-mutation, external clamp)
→ route: business skill | personal | general | OCR | creative | Development | capability request | clarification
→ Development path: project selection → risk classification → approval gate → GitHub/Claude execution OR task/prompt
→ audit (jarvis_brain_audit / jarvis_dev_tasks / jarvis_capability_requests)
→ Hebrew response to owner
```
Handlers are **executors**, not decision-makers. Media is **context, not intent**. A valid Gemini/Groq
decision is never overridden by old command logic.

## 3. Critical distinction — three readiness states

| State | Meaning | Status today |
|---|---|---|
| **Reasoning Ready** | Jarvis understands what dev/capability/project action is needed (Gemini/Groq) | ✅ yes |
| **Task Ready** | Jarvis creates dev tasks, capability requests, project proposals, Claude Code prompts, GitHub issue bodies | ✅ yes |
| **Execution Ready** | Jarvis is actually connected to GitHub/Claude Code and creates issues/repos/comments/PRs/workflow triggers | ❌ **no — waiting for GitHub token + Claude Code Action secret** |

**Do NOT claim Execution Ready until live GitHub + Claude Code credentials/secrets are configured.**

## 4. Conclusions we reached

- Jarvis must NOT be only a task generator — but it cannot fake execution either.
- GitHub is the source of truth for projects; Claude Code is the dev engine (run in CI, never on the
  serverless function; never direct-to-main; never auto-merge/deploy).
- Supabase stores audit/tasks/capability/status (additive, safe).
- **Elkayam** is a sensitive **production** project → push-to-main / deploy / migrations / auth /
  secrets / Meta callback always require explicit owner approval (classified DANGEROUS → blocked).
- A **new project** requires a proposal + name/stack/repo confirmation + explicit approval before any
  repo is created.
- Dangerous actions are always blocked pending explicit approval.
- Missing secrets/credentials → state exactly what is missing; never fake execution; never enable a
  paid service without explicit approval.
- "Nano Banana" = Gemini's image model — connectable via the same `GEMINI_API_KEY`, but **paid + not
  wired** → `needs_approval`, never auto-called.

## 5. Code map (what exists now)

- Brain: `src/lib/jarvis/brain.ts`, `llm/*` (router/providers/safety/budget), `intent.ts`, `roleGate.ts`.
- Capability resolution: `capabilityResolver.ts`; capability requests: `capabilities.ts` + `jarvis_capability_requests`.
- Development skill: `skills/development/` — `registry.ts` (projects + Elkayam policy), `classify.ts`
  (dev sub-intent + risk), `approvalGate.ts` (8-value gate), `github.ts` (gated live client),
  `githubClient.ts` (interface + pure mock for tests), `claudeCode.ts` (execution mode), `prompt.ts`,
  `store.ts` (`jarvis_dev_tasks`), `skill.ts`.
- Image/Creative: `skills/imageCreative/skill.ts`.
- Workflow: `.github/workflows/claude-code.yml` (inert until a secret).
- Audit: `audit.ts` + `jarvis_brain_audit` (brain_called / provider_used / media_present / …).

## 6. Approval gates (`approvalGate.ts`)

`allowed_now` · `allowed_read_only` · `requires_owner_approval` · `requires_github_config` ·
`requires_claude_setup` · `requires_paid_api_approval` · `blocked_dangerous` · `blocked_external_user`.

## 7. Future activation — exact setup (owner does these; I never paste secrets)

**Vercel ENV (Jarvis side — issue/repo creation):**
```
GITHUB_INTEGRATION_ENABLED=true
GITHUB_AUTH_MODE=pat
GITHUB_OWNER=eliozedri
GITHUB_REPO=eliozelk
GITHUB_TOKEN=<fine-grained PAT>
JARVIS_DEV_ALLOW_REPO_CREATE=false   # true only when you want repo creation
JARVIS_DEV_DEFAULT_PROJECT=elkayam
```
**GitHub fine-grained PAT permissions (real dev flow):** Metadata Read, Issues RW, **Contents RW**,
**Pull requests RW** — enables branch/commit/PR/file-change. The token is *capability*; `approvalGate.ts`
+ registry are *policy* (no main push / no deploy / no destructive without approval). Do NOT grant
Admin / Secrets / **Workflows** (Workflows is NOT needed — `@claude` triggers the Action under the
Actions `GITHUB_TOKEN`; the PAT would need Workflows only to edit `.github/workflows/`, which is
approval-gated and avoided). Repo creation needs Administration → only with `JARVIS_DEV_ALLOW_REPO_CREATE=true`.

**GitHub Actions secret (Claude Code engine — repo Settings → Secrets → Actions):**
- `CLAUDE_CODE_OAUTH_TOKEN` (recommended — Claude subscription, no extra API billing; `claude setup-token`)
- or `ANTHROPIC_API_KEY` (paid Anthropic API).

**Enable GitHub Actions / Claude Code:** the workflow `.github/workflows/claude-code.yml` triggers on
`@claude` issue/PR comments + `workflow_dispatch`; runs Claude Code on a branch/PR; never merges/deploys.

**Disable on incident:** set `GITHUB_INTEGRATION_ENABLED=false` (Jarvis → manual issue body/prompt mode),
and/or remove the GitHub Actions secret (workflow goes inert), and/or delete the workflow file.

## 8. How to test from WhatsApp (owner)

- "תבנה לי אפליקציית ווב לאימון כושר" → new-project proposal (no repo created).
- "תתקן את בעיית ההתראות באלקיים" → project=elkayam, risk-classified, issue body/task, no main push.
- "תתקן את זה" → asks which project.
- "תמחק את כל הטבלאות" → blocked_dangerous.
- "תחבר לי את Nano Banana 2" / "תיצור לי תמונה עם נאנו בננה 2" → capability/connection flow (not OCR;
  paid → requires approval). Each writes a `jarvis_brain_audit` row (`provider_used`, `brain_called`).
