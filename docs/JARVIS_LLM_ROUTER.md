# Jarvis LLM Router (Stage 2)

Multi-provider LLM layer that understands natural language, classifies intent, selects a skill,
extracts parameters, and decides whether to ask clarification — **behind the existing Brain**.
Code: `src/lib/jarvis/llm/`.

> **Status: live LLM ENABLED** with Gemini (1st) → Groq (2nd) → deterministic fallback
> (`JARVIS_LLM_ENABLED=true`, `JARVIS_LLM_PROVIDER=auto`, `JARVIS_LLM_PROVIDER_PRIORITY=gemini,groq`).
> Anthropic/OpenAI remain off (paid; `JARVIS_LLM_ALLOW_PAID` unset). On any provider error/timeout/
> quota/low-confidence/unsafe/invalid output → automatic deterministic fallback. Jarvis never stops.

## Core principle — reasoning-first

The LLM is a **reasoning/router layer only**. It never mutates the DB and never performs actions.
It reasons about the request; the Brain attaches the owning **business department**; the **safety
validator** decides what may route; a **read-only command/routine** (the tool) executes — or, when
the department has no verified data source, Jarvis files an honest **pending request** instead of
running a wrong command or inventing an answer. The structured `BrainDecision`
(`src/lib/jarvis/brain.ts`) — intent / department / skill / action / routine / parameters /
confidence / clarification / safety / verifiedAnswerPossible / dataSourceNeeded — flows end-to-end;
nothing is collapsed into a command id at the door. Departments + capabilities are documented in
`docs/JARVIS_AGENT_ARCHITECTURE.md`.

## Pipeline

```
text → classifyIntentSmart (llm/classifier.ts)
     → routeMessage (llm/index.ts)
         config (env) → budget guard → provider registry (priority+paid+key gates)
         → router failover (timeout per call) → parse JSON → safety.validateRoute
            accept → use intent  ·  clamp → safe customer intent  ·  else → deterministic
     → map to coarse Intent → sanitizeIntentForRole → registry.resolveSkill → skill.handle
```

When `routeMessage` returns `deterministic` (disabled / no key / over budget / timeout /
low-confidence / unsafe / invalid JSON / unsupported), the caller runs the existing
`classifyIntent` — Jarvis never stops.

## Providers & priority

Default order `gemini → groq → anthropic → openai → local`, configurable via
`JARVIS_LLM_PROVIDER_PRIORITY`. Each provider is plain `fetch` (no SDK), server-side, key read
from env and **never logged**.

| Provider | Env key | Default model | Notes |
|---|---|---|---|
| gemini | `GEMINI_API_KEY` | `gemini-2.0-flash` | **1st** — free-tier friendly |
| groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | **2nd** — free-tier friendly |
| anthropic | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` | **PAID** — off unless `JARVIS_LLM_ALLOW_PAID=true` |
| openai | `OPENAI_API_KEY` | `gpt-4o-mini` | **PAID** — off unless `JARVIS_LLM_ALLOW_PAID=true` |
| local | — | — | mock, always available, deterministic output (tests/offline) |

Per-provider model override: `GEMINI_MODEL`, `GROQ_MODEL`, … else `JARVIS_LLM_MODEL` else default.

## Billing rules (hard)

- Anthropic/OpenAI are **code-supported but never auto-enabled** — the registry drops them unless
  `JARVIS_LLM_ALLOW_PAID=true`. The Anthropic API is separate metered billing and is **NOT**
  covered by a Claude / Claude Code subscription.
- Gemini & Groq are enabled only when their key exists in env and the operator opts in.
- No new paid account/key is ever created by Jarvis. Secrets are never logged/committed.

## Safety validator (`llm/safety.ts`)

`validateRoute(result, {role, minConfidence})` → `accept | clamp | clarify | fallback | deny`:
confidence gate · external senders clamped to customer intake for any non-allowed intent ·
external never auto-mutates · owner `write`/`blocked` levels never auto-run (→ deterministic /
human task) · explicit clarification respected. Layers on top of `sanitizeIntentForRole` + the
registry role gate (defense in depth).

## Budget / quota (`llm/budget.ts`)

Env caps: `JARVIS_LLM_MAX_TOKENS`, `JARVIS_LLM_TIMEOUT_MS`, `JARVIS_LLM_MIN_CONFIDENCE`,
`JARVIS_LLM_DAILY_BUDGET_LIMIT` (request count), `JARVIS_LLM_DAILY_TOKEN_LIMIT`. Over a cap →
deterministic fallback. **Honest limitation:** the counter is in-memory per serverless instance
(best-effort, not a hard global cap); a DB-backed counter is the documented next step. The real
overage protection is using a free-tier key + provider-side rate limits.

## Environment variables

```
JARVIS_LLM_ENABLED=false              # master switch (default false)
JARVIS_LLM_PROVIDER=auto              # auto | gemini | groq | anthropic | openai | local
JARVIS_LLM_PROVIDER_PRIORITY=gemini,groq,anthropic,openai,local
JARVIS_LLM_MODEL=                     # optional global model override
JARVIS_LLM_MAX_TOKENS=512
JARVIS_LLM_TIMEOUT_MS=8000
JARVIS_LLM_MIN_CONFIDENCE=0.6
JARVIS_LLM_DAILY_BUDGET_LIMIT=1000    # requests/day/instance (0 = unlimited)
JARVIS_LLM_DAILY_TOKEN_LIMIT=0        # tokens/day/instance (0 = unlimited)
JARVIS_LLM_ALLOW_PAID=false           # gate for anthropic/openai
GEMINI_API_KEY=...                    # presence enables gemini
GROQ_API_KEY=...                      # presence enables groq
ANTHROPIC_API_KEY=...                 # + ALLOW_PAID to use
OPENAI_API_KEY=...                    # + ALLOW_PAID to use
```

## Enable Gemini safely (later)

1. In Google AI Studio, copy an existing **free-tier** API key (do not enable billing).
2. `vercel env add GEMINI_API_KEY production` (paste when prompted — never in chat/logs).
3. `vercel env add JARVIS_LLM_ENABLED production` → `true`.
4. (optional) `JARVIS_LLM_PROVIDER_PRIORITY=gemini,groq,local`, `JARVIS_LLM_DAILY_BUDGET_LIMIT=500`.
5. Redeploy. Verify `[jarvis:llm] route … provider=gemini` in logs; if quota/error → auto-fallback.

## Enable Groq safely (later)

Same as Gemini with `GROQ_API_KEY` (console.groq.com free tier). Keep `JARVIS_LLM_ALLOW_PAID`
unset/false so Anthropic/OpenAI stay off.

## Audit trail (`jarvis_brain_audit`)

Every OWNER brain decision writes one row: `sender_role, channel, msg_id, inbound_text, llm_enabled,
provider_used (gemini/groq/deterministic), decision_source (llm/deterministic), intent,
business_domain, target_agent, skill, action, parameters, confidence, requires_clarification,
fallback_reason, safety_result (accept/clamp/clarify), verified_answer_possible, outgoing_summary`.
This reconstructs *incoming → decision → action → reply* without ephemeral console logs. Written by
`src/lib/jarvis/audit.ts` (service-role only; message text truncated; no secrets). The dispatcher is a
**fallback safety net, not the brain** — `fallback_reason` is null whenever the LLM decision was
accepted, and set (e.g. `router_fallback`, `safety_low_confidence`, `llm_disabled`) only when the
deterministic path ran.

## Tests

`scripts/jarvis-llm-selfcheck.ts` (`npx tsx`) — 14 checks over the pure core + mock providers:
disabled, no-key, valid routing, external-CEO blocked, low-confidence, owner planner, external
order, external system_status blocked, invalid JSON, timeout, write-block, budget cap, failover.
