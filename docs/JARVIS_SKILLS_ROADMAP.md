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

## Cross-cutting upgrades
- **LLM Router (🟡 built, live OFF):** multi-provider router `src/lib/jarvis/llm/` (gemini→groq→anthropic→openai→local) behind `classifyIntentSmart`, with safety validator + budget guards + deterministic fallback. Disabled (no key) → identical to deterministic. Anthropic/OpenAI paid & gated by `JARVIS_LLM_ALLOW_PAID`. See `docs/JARVIS_LLM_ROUTER.md`.
- **Agent Reasoning (🟡 built, deterministic):** `src/lib/jarvis/agent/` — owner-only safe planner that composes existing read-only commands into multi-step reports (e.g. "מה יכול לתקוע עבודות"). LLM planner dormant. See `docs/JARVIS_AGENT_REASONING.md`. Next: skill-level parameter extraction via `classifyMessageRich`; DB-backed budget; write-class actions behind approvals.
- **Async OCR (🟡 built):** receipt persists media to the private `jarvis-docs` bucket → `status='queued'`; `/api/jarvis/ocr-worker` (CRON_SECRET, daily on Hobby + manual) runs the OCR provider and writes results to the doc row. Next: WhatsApp follow-up with the summary; faster/cloud provider.
- **Skill registry/router:** generalize `orchestrator.selectSkills` as more skills + the owner path migrate fully into the brain.
- **Channel adapters:** Telegram + Web adapters call `runJarvis` like WhatsApp does.

## Invariants (all skills)
- External senders are customer-intake only — never owner menu / CEO / personal / settings / internal data.
- No real `work_order` without manual office approval.
- Never fake OCR output or CEO execution.
- Secrets only in env; never logged/printed/committed. Telegram (`src/lib/teamBot`) untouched.
