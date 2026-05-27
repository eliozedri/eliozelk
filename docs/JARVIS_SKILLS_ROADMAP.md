# Jarvis Skills Roadmap

Jarvis is the master personal assistant; channels (WhatsApp/Telegram/Web) are adapters.
Skills live under `src/lib/jarvis/skills/` and return channel-agnostic messages. See
`docs/JARVIS_AGENT_ARCHITECTURE.md` for the brain/adapter contracts.

## Status legend
✅ live · 🟡 foundation/Stage-1 (honest, partial) · ⬜ planned

## Skills

| Skill | Status | What works now | Next stage |
|---|---|---|---|
| **Order Intake** | ✅ | External + owner order text → editable pending draft (add/remove/correct-qty/confirm); summary + logo; Option-2 (create early, edit in place); `customer_confirmed` flag; never a work_order. | Owner uses the same skill; LLM extraction; structured location/contact fields. |
| **CEO / Manager** | 🟡 | Owner-only. Detects CEO request + status query; stores PENDING request in `jarvis_master_items`; lists open requests. Honest — no execution claimed. | Real CEO executor/agent integration; status transitions; result capture; notifications. |
| **OCR / Document** | 🟡 | Owner-only. Real WhatsApp media download + audit log (`jarvis_documents`) + honest reply; pluggable `OcrProvider` (current = tesseract via `analyze.ts`/`providers.ts`) wired as a callable boundary. External docs = customer-intake attachments. | Run extraction (async/queue, off the webhook) → summarize → classify → route; cloud/LLM-vision provider; structured fields. |
| **Personal Area** | 🟡 | Owner-only **channel-agnostic skill** (`skills/personalArea`): capture tasks/notes/reminders/daily-report + **list open items** ("מה המשימות שלי?"). Reuses `jarvis_master_items`. Reminders stored, **not scheduled** (honest). | Reminder scheduling/firing; due dates; edit/complete items. |
| **Inventory / Availability** | ⬜ | Extension point only (`orderIntake/catalog.ts`) — never invents stock. | Connect catalog/stock source; availability checks; alternatives. |
| **Finance / Operations** | ⬜ | — | Future skills. |

## Owner/Master Brain-First Invariant
After owner identification, no free-text/media message skips the Brain; media is context not intent;
handlers are executors; fallback never overrides an accepted LLM decision; missing capability →
Capability Request (never faked). Only explicit UI/capture paths are non-Brain (`brain_called=false`).
See `docs/JARVIS_AGENT_ARCHITECTURE.md`.

## Reasoning-first Brain + departments
Jarvis is a **reasoning-first orchestrator**: understand → pick the business **department** →
execute a read-only skill/routine, ask clarification, or file a pending department request.
**Commands are tools; departments/agents are consultable business brains; the LLM is the reasoning
layer.** If a skill is missing, Jarvis must NOT fake it or run an unrelated command — it files a
pending request and states the missing data source. See `docs/JARVIS_AGENT_ARCHITECTURE.md`.

| Department | Read-only capability | Status |
|---|---|---|
| Warehouse/Inventory | stock lookup, low stock, missing/zero, purchase reco | ✅ |
| Catalog/Pricing | missing price, missing supplier | ✅ |
| Orders | open-orders overview, pending drafts | ✅ |
| Operations | stuck/SLA, exceptions, multi-step risk routine | ✅ |
| Fleet/Equipment | unusable / dispatch-blocked equipment | ✅ |
| Finance (AR) | open customer balance | ⬜ pending request (no verified payments/AR source) |
| Management (CEO) | free-text delegation → tracked task | ✅ |
| Personal Assistant | tasks/notes/reminders/daily + list (reminders pending, not scheduled) | ✅ |
| General Assistant | open reasoning/advice/planning via LLM (owner-only; read-only; honest safe-mode when LLM off) | ✅ |
| Development / Claude Code | classify + risk-gate + Claude Code prompt/task + new-project proposal; gated GitHub layer + Claude Code Action workflow (disabled until creds); DANGEROUS blocked | 🟡 Stage 2 |
| Image / Creative Media | detect image generate/edit (owner); no provider connected → honest capability request + ready image prompt (never fakes generation); media = context not intent | 🟡 Stage 1 |

## Cross-cutting upgrades
- **LLM Router (✅ live: Gemini→Groq→deterministic):** multi-provider router `src/lib/jarvis/llm/` behind `brain.ts`/`decideBrain`, with safety validator + budget guards + deterministic fallback. Anthropic/OpenAI paid & gated by `JARVIS_LLM_ALLOW_PAID`. See `docs/JARVIS_LLM_ROUTER.md`.
- **Agent Reasoning (✅ built):** `src/lib/jarvis/agent/` — owner-only safe planner composing read-only commands into multi-step reports across departments (e.g. "מה יכול לתקוע עבודות"). LLM planner active when enabled. See `docs/JARVIS_AGENT_REASONING.md`. Next: connect a Finance AR data source; skill-level parameter extraction in order intake; DB-backed budget; write-class actions behind approvals.
- **Async OCR (🟡 built):** receipt persists media to the private `jarvis-docs` bucket → `status='queued'`; `/api/jarvis/ocr-worker` (CRON_SECRET, daily on Hobby + manual) runs the OCR provider and writes results to the doc row. Next: WhatsApp follow-up with the summary; faster/cloud provider.
- **Skill registry/router:** generalize `orchestrator.selectSkills` as more skills + the owner path migrate fully into the brain.
- **Channel adapters:** Telegram + Web adapters call `runJarvis` like WhatsApp does.

## Invariants (all skills)
- External senders are customer-intake only — never owner menu / CEO / personal / settings / internal data.
- No real `work_order` without manual office approval.
- Never fake OCR output or CEO execution.
- Secrets only in env; never logged/printed/committed. Telegram (`src/lib/teamBot`) untouched.
