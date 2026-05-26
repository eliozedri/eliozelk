# Jarvis LLM Router + Agent Reasoning — Design

Date: 2026-05-26 · Status: approved (owner pre-authorized autonomous build) · Author: Claude (Opus 4.7)

## Goal

Evolve the Jarvis Brain from deterministic-only into a real **Brain/Orchestrator + Skills**
system with two new layers, behind the existing interfaces (not a WhatsApp-only patch):

- **Stage 2 — LLM Router:** an LLM understands natural language, classifies intent, selects a
  skill, extracts parameters, and decides whether to ask clarification.
- **Stage 3 — Agent Reasoning:** the owner can issue a complex request that Jarvis breaks into a
  safe multi-step plan over **existing** skills/commands, executes the read-only steps, and
  summarizes.

Hard principle: **the LLM is a reasoning/router layer only.** It never mutates the DB or runs
arbitrary actions. Real work happens exclusively through safe Jarvis skills + approved tools,
and every LLM output passes a strict **safety validator** before routing.

## Environment reality (drives the build)

No `GEMINI_API_KEY` / `GROQ_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` exists in
`.env.local` or Vercel production (verified by name, never by value). Therefore:

- Build the **full multi-provider infrastructure**.
- **Live LLM stays DISABLED** (`JARVIS_LLM_ENABLED` defaults false).
- **local/mock provider** powers tests; **deterministic fallback** is the permanent default.
- Document the exact ENV needed to enable Gemini/Groq later.
- No new paid account/key, no billing, no secrets logged/committed.

## Provider priority

`gemini → groq → anthropic → openai → local → deterministic`. Configurable via
`JARVIS_LLM_PROVIDER_PRIORITY`. Gemini & Groq are the free-tier-friendly defaults the owner
authorized to enable when a key exists; Anthropic & OpenAI are code-supported but **never
auto-enabled** (assumed paid). Anthropic API is NOT covered by a Claude/Claude Code subscription.

## Architecture (isolation & testability)

```
src/lib/jarvis/llm/
  types.ts        LLMRequest/Response/Usage/Error/IntentResult/PlanResult/ProviderStatus (pure)
  config.ts       loadLlmConfig() from env — enabled, provider, priority, model, caps (pure)
  prompt.ts       buildIntentPrompt / buildPlanPrompt + parseJsonLoose (pure)
  budget.ts       in-memory per-instance usage guard keyed by UTC day (pure; documented limit)
  safety.ts       validateRoute(result, ctx) → accept|clamp|clarify|fallback|deny (pure)
  router.ts       routeViaProviders(providers[], req, opts) — failover + timeout + parse (pure)
  providers/
    types.ts      LLMProvider interface (pure)
    local.ts      mock provider — deterministic structured output, no network (pure)
    gemini.ts     server-only fetch — Google Generative Language API
    groq.ts       server-only fetch — OpenAI-compatible
    anthropic.ts  server-only fetch — Messages API
    openai.ts     server-only fetch — Chat Completions
    registry.ts   server-only — build available providers from env + priority
  index.ts        server-only — routeMessage(): config→registry→budget→router→safety→fallback
  classifier.ts   EXISTING — classifyIntentSmart() now delegates to index.routeMessage,
                  preserving its signature and deterministic-when-off behavior.

src/lib/jarvis/agent/
  types.ts        AgentPlan / PlanStep / PlanResult (pure)
  catalog.ts      safe planner actions → existing read-only ceoManager commands (pure refs)
  planner.ts      deterministic known-pattern planner + optional LLM hook (pure)
  runner.ts       server-only — execute read-only steps via existing commands, summarize
```

**Dependency injection:** the decision core (router/safety/budget/config/prompt/planner +
local provider) carries **no `server-only`** and is unit-testable in Node via `tsx`. The
`server-only` wrappers (index, registry, live providers, runner, classifier) assemble it.

## Data flow

```
message → channel adapter → Jarvis Brain
  → classifyIntentSmart (index.routeMessage)
      if LLM enabled & budget ok & provider available:
        router failover (gemini→…→local) → parse JSON → safety.validateRoute
          accept → use LLM intent/skill/params
          clamp  → force safe intent for role
          else   → deterministic fallback
      else: deterministic fallback (classifyIntent)
  → registry.resolveSkill(role, intent)  (role gate, defense-in-depth)
  → skill.handle → messages
```

Agent Reasoning sits inside the **ceoManager dispatcher** (owner-only): a directive tries
(1) a single read-only command, else (2) the multi-step **planner** (known patterns like
"daily operations risk report"), else (3) a queued human task. Steps map only to existing
read-only commands; nothing is faked.

## Safety validator (post-LLM, before routing)

Checks: JSON schema valid · confidence ≥ `JARVIS_LLM_MIN_CONFIDENCE` · intent allowed for role ·
skill allowed for role · no auto-mutation (write/`work_order` → require approval/pending) ·
external never reaches owner skills (clamp to order_intake) · LLM cannot override policy. On
failure → deterministic fallback / clarify / polite deny by context.

## Role gating

External/unknown: only `external_*` intents → Order Intake (customer context). Owner: full
intent set. Even if the LLM proposes an owner skill for an external sender, the validator clamps
it. This layers on top of the existing `registry.resolveSkill` and `sanitizeIntentForRole`.

## Budget / quota

Env caps: `JARVIS_LLM_MAX_TOKENS`, `JARVIS_LLM_TIMEOUT_MS`, `JARVIS_LLM_MIN_CONFIDENCE`,
`JARVIS_LLM_DAILY_BUDGET_LIMIT` (request count), `JARVIS_LLM_DAILY_TOKEN_LIMIT`. In-memory guard
per serverless instance (honest limitation — not a hard global cap; DB-backed counter is a
documented future step). On exceed → deterministic fallback.

## Deterministic fallback (permanent safe mode)

Activates when: LLM disabled · no key · provider error/timeout · budget exceeded · low
confidence · invalid JSON · safety rejection · unsupported intent. Uses the existing
`classifyIntent` + order parser + skill router. Jarvis never stops when the LLM is unavailable.

## Testing

`scripts/jarvis-llm-selfcheck.ts` (tsx) drives the pure core with fake/mock providers across the
10 required scenarios. Plus `tsc --noEmit` + `eslint`. No live network. `next build` skipped
locally (iCloud `.next` hazard) — Vercel builds on deploy.

## Out of scope / not faked

- No live LLM enabled (no key). No write-class agent actions (approval system not extended now).
- No reminder firing, no inline OCR. Telegram (`src/lib/teamBot`) untouched.
