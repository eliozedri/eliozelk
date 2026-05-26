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
Skills:    src/lib/jarvis/skills/orderIntake/
              state.ts   — editable cart (OrderItem[]) + pure ops + summary (stem-matched item lookup)
              parse.ts   — deterministic Hebrew edit parser (add/remove/setQty/confirm/cancel/representative) — LLM-swappable
              catalog.ts — availability hook (no-invent extension point)
              store.ts   — session state + draft CRUD (the draft IS the state store)
              skill.ts   — orchestration (load → parse → apply → persist → reply)
              ↓
Actions/DB: team_bot_order_drafts (pending), whatsapp_sessions (state.order), notifications
```

## Current reality (honest)

- The **brain + skill skeleton is real**, and **Order Intake is a real channel-agnostic skill** (not inline WhatsApp handlers).
- The **parser is deterministic** (rule/keyword + stem matching), **not an LLM** yet. It's isolated behind `parse.ts` so an LLM can replace it without touching state/persistence/adapters.
- The **owner menu is still WhatsApp-adapter-direct** (`src/lib/whatsapp/master.ts`) — not yet migrated into the skill layer. That migration + additional skills are the next steps.
- **Not built yet:** general skill registry beyond order intake, LLM parser, live inventory data, owner using the order skill, OCR-from-WhatsApp, CEO/reminder execution.

## Order Intake behavior (see also docs/WHATSAPP_JARVIS_LOGIC.md)

- **Draft timing = Option 2 (immediate + editable).** A meaningful customer request creates a pending draft right away (no lead is lost); follow-up free text edits the **same** draft (add / remove / correct quantity); "מאשר/שלח/זה בסדר" sets `customer_confirmed=true` (status stays `pending_review`, so it remains in the office queue, flagged ✓). A real work_order is never created automatically.
- **State:** the active draft id is held in `whatsapp_sessions.state.order`; the cart items live in `team_bot_order_drafts.cart`.
- **Summary** is regenerated from the cart after every edit and sent back to the customer, followed by the Elkayam logo on open/confirm.
