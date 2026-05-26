# Jarvis Agent Architecture

Source of truth for how Jarvis is structured as a personal-assistant agent. Code: `src/lib/jarvis/`.

## Principles

1. **Jarvis is the master personal assistant** — business, Elkayam operations, personal tasks, reminders, documents, OCR, CEO/manager requests, orders, inventory, reports, future automations.
2. **Channels are adapters, not the brain.** WhatsApp / Telegram / Web UI normalize their payloads into a `JarvisInput`, call the orchestrator, and render the returned `OutboundMessage[]`. They own no business logic.
3. **WhatsApp is only one channel.** The same skills must serve Telegram and the UI later.
4. **Brain/Orchestrator + Skills.** The orchestrator identifies sender role + conversation state, selects a skill, and returns messages. Skills are channel-agnostic and never call a channel directly.
5. **Order Intake is the first real skill.** Others (OCR/Documents, CEO/Manager Request, Personal Tasks/Reminders, Inventory/Availability, Finance, Operations) register into the same orchestrator over time.
6. **Natural Hebrew text is understood throughout.** Buttons/menus are UX helpers, never the only input.
7. **External customers are customer-intake only** — never owner menu / CEO / personal area / settings / internal data / real work_orders.
8. **No real `work_order` is created without manual approval.** Skills create pending drafts; promotion is a deliberate office action.
9. **Inventory/product availability is an extension point** — skills may call it; it never invents stock.
10. **LLM is a future upgrade behind the same interfaces** — swap the deterministic parser for an LLM with no change to state, persistence, or adapters. Not a rewrite.

## Layout

```
Channels:  WhatsApp adapter (src/lib/whatsapp/gateway.ts) · Telegram (future) · Web (future)
              ↓ JarvisInput
Brain:     src/lib/jarvis/orchestrator.ts  (runJarvis → selectSkills → skill.handle)
Contracts: src/lib/jarvis/types.ts  (JarvisInput, JarvisResponse, OutboundMessage,
                                      SkillContext, SkillResult, Skill, SenderRole, Channel)
Skills:    src/lib/jarvis/skills/
              orderIntake/  state · parse · catalog · store · skill  (editable cart, Option-2 drafts)
              ceoManager/   intent · store · skill  (pending CEO/manager request queue + status)
              ocrDocument/  classify · analyze · store · skill  (doc audit + OCR service boundary)
              ↓
Actions/DB: team_bot_order_drafts (pending) · whatsapp_sessions (state.order) ·
            jarvis_master_items (ceo_request) · jarvis_documents (doc audit) · notifications
```

## Current reality (honest)

- The **brain + skill skeleton is real**, and **Order Intake is a real channel-agnostic skill** (not inline WhatsApp handlers).
- The **parser is deterministic** (rule/keyword + stem matching), **not an LLM** yet. It's isolated behind `parse.ts` so an LLM can replace it without touching state/persistence/adapters.
- **Three skills exist:** Order Intake (full), CEO/Manager (pending queue), OCR/Document (audit + service boundary).
- The owner menu (`src/lib/whatsapp/master.ts`) is still the WhatsApp owner adapter, but it now **delegates CEO + OCR to their skills** (via `runSkill` → `JarvisInput`). Order-for-owner is the remaining inline path.
- **CEO/Manager skill (Stage 1):** owner-only. Detects CEO request / status query, stores a PENDING request in `jarvis_master_items` (kind=ceo_request; title/priority/links in metadata), lists open requests. **No CEO executor agent exists** (`/api/agents/ceo/scan` only monitors SLAs) → Jarvis never claims execution.
- **OCR/Document skill (Stage 1):** owner-only owner-OCR. Real WhatsApp media **download** (`src/lib/whatsapp/media.ts`) + audit log (`jarvis_documents`) + honest reply. The tesseract engine (`src/lib/supplierDocuments/ocrAdapter`) is wired via `analyze.ts` as a callable **service boundary** but is **NOT run inline in the webhook** (tesseract is slow → Meta retry/timeout risk); in-chat extraction is the async next step. External documents are logged as **customer-intake attachments** by the Order Intake skill (never owner OCR).
- **Not built yet:** general skill registry beyond these three, LLM parser, live inventory data, owner using the order skill, inline/async OCR extraction over WhatsApp, real CEO/reminder execution.

## Order Intake behavior (see also docs/WHATSAPP_JARVIS_LOGIC.md)

- **Draft timing = Option 2 (immediate + editable).** A meaningful customer request creates a pending draft right away (no lead is lost); follow-up free text edits the **same** draft (add / remove / correct quantity); "מאשר/שלח/זה בסדר" sets `customer_confirmed=true` (status stays `pending_review`, so it remains in the office queue, flagged ✓). A real work_order is never created automatically.
- **State:** the active draft id is held in `whatsapp_sessions.state.order`; the cart items live in `team_bot_order_drafts.cart`.
- **Summary** is regenerated from the cart after every edit and sent back to the customer, followed by the Elkayam logo on open/confirm.
