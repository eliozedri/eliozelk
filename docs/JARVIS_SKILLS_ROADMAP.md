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
| **OCR / Document** | 🟡 | Owner-only. Real WhatsApp media download + audit log (`jarvis_documents`) + honest reply; tesseract engine wired as a callable service boundary (`analyze.ts`). External docs = customer-intake attachments. | Run extraction (async/queue, off the webhook) → summarize → classify → route to Order Intake/CEO/personal; structured fields. |
| **Personal Tasks / Reminders** | 🟡 | Capture only (`jarvis_master_items`: personal_task/note/reminder); reminders stored, not scheduled. | Reminder scheduling/firing; task lists; due dates. |
| **Inventory / Availability** | ⬜ | Extension point only (`orderIntake/catalog.ts`) — never invents stock. | Connect catalog/stock source; availability checks; alternatives. |
| **Finance / Operations** | ⬜ | — | Future skills. |

## Cross-cutting upgrades
- **LLM brain:** swap deterministic parsers (`parse.ts`, intent detectors) for an LLM behind the same skill interfaces — no change to state/persistence/adapters.
- **Skill registry/router:** generalize `orchestrator.selectSkills` as more skills + the owner path migrate fully into the brain.
- **Channel adapters:** Telegram + Web adapters call `runJarvis` like WhatsApp does.

## Invariants (all skills)
- External senders are customer-intake only — never owner menu / CEO / personal / settings / internal data.
- No real `work_order` without manual office approval.
- Never fake OCR output or CEO execution.
- Secrets only in env; never logged/printed/committed. Telegram (`src/lib/teamBot`) untouched.
