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
Brain:     src/lib/jarvis/orchestrator.ts  (runJarvis: classify → resolve skill → execute)
           src/lib/jarvis/llm/classifier.ts (classifyIntentSmart: LLM-first if enabled → deterministic fallback)
           src/lib/jarvis/intent.ts        (central DETERMINISTIC intent classifier — the fallback/default)
           src/lib/jarvis/registry.ts      (intent → skill, role-gated; external = order intake only)
Contracts: src/lib/jarvis/types.ts  (JarvisInput, JarvisContext, JarvisResponse, OutboundMessage,
                                      Intent, IntentResult, Confidence, ConversationState,
                                      ActionSafetyLevel, SkillContext, SkillResult, Skill, SenderRole, Channel)
Skills:    src/lib/jarvis/skills/
              orderIntake/  state · parse · catalog · store · skill  (editable cart, Option-2 drafts)
              ceoManager/   intent · store · skill  (pending CEO/manager request queue + status)
              ocrDocument/  classify · analyze · providers · store · skill  (doc audit + pluggable OCR boundary)
              personalArea/ store · skill  (tasks/notes/reminders/daily capture + list; reminders not scheduled)
              ↓
Actions/DB: team_bot_order_drafts (pending) · whatsapp_sessions (state.order) ·
            jarvis_master_items (ceo_request + personal_*) · jarvis_documents (doc audit) · notifications

## Brain pipeline (runJarvis)

1. **Normalize** — the channel adapter builds a `JarvisInput` (channel, senderId, senderRole,
   text, interactiveId, media, messageId).
2. **Classify intent** — `classifyIntent(text, role)` → `{intent, confidence}` (deterministic
   Stage 1; an LLM can implement the same signature later).
3. **Resolve skill** — `registry.resolveSkill(role, intent)`, **role-gated**: external/unknown
   reach ONLY order intake; CEO/OCR/personal/status are owner-only.
4. **Execute** — `skill.handle({ input })` → `SkillResult { handled, messages }`.
5. **Return** — `JarvisResponse { messages }`; the adapter renders them. Fallback asks a focused
   clarification (owner) or guides into intake (external) — not a bare "לא הבנתי".

OCR is pluggable via `ocrDocument/providers.ts` (`OcrProvider`: current = tesseract; placeholder
for a future cloud / LLM-vision provider) — swap engines without touching the skill.

## Jarvis as Master Reasoning Assistant

The owner can write Jarvis **anything in natural Hebrew**; Jarvis is not limited to menu buttons or
exact command matching. Core principles:
- The owner's **sender role is detected first**, before any reasoning.
- The **LLM Router is the primary reasoning layer** (when enabled+safe); the deterministic
  dispatcher is an **emergency fallback only** and never overrides an accepted LLM decision.
- **Skills/commands are execution tools.** **Department agents** (CEO, Operations, Finance,
  Warehouse, Orders, Catalog, Fleet, OCR, Personal) are consultable business brains.
- Jarvis decides: answer directly · ask clarification · run a Skill · run a multi-step Routine ·
  consult a department/agent · file a **Capability Request** for a missing skill/data source ·
  (owner-only) record a capability-build request.
- **Missing capabilities become structured records, never fake answers.** Jarvis says honestly
  what it cannot do yet and opens a tracked request.
- **External customers are restricted** to customer/order-intake scope — never internal reports,
  CEO/finance/inventory internals, personal area, or settings. No real `work_order` is ever
  created automatically. Risky/write actions require confirmation (no write tooling today).

## Reasoning-first Brain + department routing (Stage 2 + 3)

**Jarvis is REASONING-FIRST, commands-second.** It does not map a message to the closest command.
It understands the request, decides which business **department** owns the answer, and only then
resolves an execution path. Commands are *tools*; departments/agents are *consultable business
brains*; the LLM Router is the *reasoning layer*.

### Mandatory pipeline (every free-text message)
```
message
→ identify sender + role (gateway: master vs external) — ALWAYS before the LLM
→ load conversation state/context
→ decideBrain (src/lib/jarvis/brain.ts):
     LLM Router reasons (intent, skill, parameters, confidence, clarification, safety)
     → attach business department (src/lib/jarvis/departments.ts)
     → resolve ONE path: single read-only action | multi-step routine | clarification |
       pending department request (when the department has no verified data source)
   (LLM unavailable/low-confidence/unsafe/invalid → deterministic decision, which ASKS
    clarification rather than guessing a command)
→ safety validator (llm/safety.ts): role gate, confidence, no auto-mutation, external clamp
→ executor (skills/ceoManager/dispatcher.ts executeManagerDecision): run approved read-only
   work, or file an honest pending request — never a wrong/unrelated command
→ Hebrew answer (verified) or an honest "no verified source / pending" reply
```

### BrainDecision (the structured decision that flows end-to-end)
`{ source, provider, intent, coarseIntent, businessDomain, targetAgents,
requiresDepartmentConsultation, skill, action, parameters, confidence, requiresClarification,
clarificationQuestion, routine, safetyLevel, verifiedAnswerPossible, dataSourceNeeded }`.
Intent, skill, action/command, routine, clarification, confidence and safety are kept **distinct** —
nothing is collapsed into a command id at the door.

### Decision priority — LLM-first; the dispatcher is a FALLBACK safety net (not the brain)
```
1. sender role          2. context/state        3. allowed skills for role
4. Gemini (1st)         5. Groq (2nd, on Gemini fail/timeout/quota/low-conf/invalid/unsafe)
6. deterministic dispatcher/command fallback  ← ONLY if 4 AND 5 produced no accepted decision,
                                                 or the LLM is disabled by ENV
7. safety validator (final authority)         8. execute approved skill/action/routine
9. full audit trail (jarvis_brain_audit)
```
**Hard rule:** when Gemini or Groq returns a valid, safety-accepted decision, the brain executes
*that exact* intent→action/routine. The deterministic resolver (`match.ts`) is reached **only** via
`deterministicDecision` when `routeMessage` returned `mode:"deterministic"` (LLM disabled / both
providers failed / timeout / quota / low-confidence / invalid JSON / unsafe). It **never** overrides
or re-maps an accepted LLM decision, and a valid stock-lookup can never become a missing-price report
(`brain.ts` uses `intentToCommandId(rich.intent)`; the dispatcher executes `decision.action` and never
re-classifies). The exact `fallbackReason` (and `provider_used` / `decision_source` / `safety_result`)
is recorded in `jarvis_brain_audit`. This is the regression guarantee for the cones bug.

### Departments (consultable business brains)
| Domain | Agent(s) | Read-only capability today |
|---|---|---|
| Warehouse / Inventory | inventory-agent | stock lookup, low stock, missing/zero, purchase reco ✅ |
| Catalog / Pricing | catalog-pricing-agent | missing price, missing supplier ✅ |
| Orders | orders-agent | open-orders overview, pending drafts ✅ |
| Operations | ceo | stuck/SLA, exceptions, multi-step risk routine ✅ |
| Fleet / Equipment | equipment-fleet-agent | unusable / dispatch-blocked equipment ✅ |
| Finance | cfo-agent / billing-collections-agent | **no verified AR source → pending request** ⬜ |
| Management (CEO) | ceo | free-text delegation → tracked task ✅ |
| Documents / Personal | — | OCR audit / personal capture (existing skills) |

**Missing capability rule:** if a domain has no executable read-only skill (e.g. Finance AR — no
customer-payments table), Jarvis does **not** run an unrelated command and does **not** invent an
answer. It files (1) a pending department task and (2) a structured **Capability Request**
(`jarvis_capability_requests`, via `capabilities.ts`): `requested_by, channel, original_message,
interpreted_intent, kind (skill_build|data_source|tool), missing_skill_or_data_source, target_agent,
priority, status, recommended_next_step`. It tells the owner exactly what is missing
(`dataSourceNeeded`). The owner can also explicitly ask to BUILD a capability — intent
`capability_request` ("תבנה לי יכולת…") → a `skill_build` Capability Request routed to the System
Manager, with the honest reply *"אין לי עדיין יכולת מובנית לזה — פתחתי בקשת יכולת"*. A new safe
capability = a new read-only command (`commands.ts`) + a row in `departments.ts`/`match.ts` — the
brain picks it up automatically. The audit row links to the capability request (`capability_request_id`).

### Providers / safety / budget
Multi-provider router `gemini → groq → anthropic → openai → local` (priority configurable).
Gemini/Groq are free-tier friendly and enabled when a key exists; Anthropic/OpenAI are
code-supported but **paid** and stay off unless `JARVIS_LLM_ALLOW_PAID=true` (Anthropic API is NOT
covered by a Claude/Claude Code subscription). Safety validator + role gate + budget caps as above.
Every decision is logged secrets-free via `brainLog.ts`.

See `docs/JARVIS_LLM_ROUTER.md` and `docs/JARVIS_AGENT_REASONING.md` for full detail, env vars,
billing rules, and how to enable a provider safely.

## Async OCR worker

OCR runs OFF the WhatsApp webhook (tesseract is slow; Meta retries a slow webhook). At receipt
the skill downloads the media (Meta URLs expire ~5 min) and persists it to the private
`jarvis-docs` Storage bucket, setting the document `status='queued'` (best-effort — a failure
leaves it 'received', nothing breaks). The worker `processQueuedDocuments` (`skills/ocrDocument/
worker.ts`) — invoked by `/api/jarvis/ocr-worker` (Vercel Cron `GET` or manual `POST`, both
CRON_SECRET-guarded; daily on Hobby) — downloads from storage, runs the active OCR provider,
writes `extracted_text`/`summary`/`classification` onto the row (`status='processed'`), and then
**sends the Hebrew summary back to the OWNER over WhatsApp** (best-effort; owner docs only —
external senders already got their acknowledgement). Still no inline OCR in the webhook.
```

## Current reality (honest)

- The **brain + skill skeleton is real**, and **Order Intake is a real channel-agnostic skill** (not inline WhatsApp handlers).
- The **parser is deterministic** (rule/keyword + stem matching), **not an LLM** yet. It's isolated behind `parse.ts` so an LLM can replace it without touching state/persistence/adapters.
- **Central intent classifier + role-gated skill registry now exist** (`intent.ts`, `registry.ts`) — the Brain routes by intent, not scattered per-adapter regexes. Owner free-text in `master.ts` delegates to `classifyIntent`.
- **Four skills exist:** Order Intake (full), CEO/Manager (pending queue), OCR/Document (audit + pluggable boundary), Personal Area (capture + list).
- The owner menu (`src/lib/whatsapp/master.ts`) is still the WhatsApp owner adapter, but it now **delegates CEO + OCR to their skills** (via `runSkill` → `JarvisInput`). Order-for-owner is the remaining inline path.
- **CEO/Manager skill (Stage 1):** owner-only. Detects CEO request / status query, stores a PENDING request in `jarvis_master_items` (kind=ceo_request; title/priority/links in metadata), lists open requests. **No CEO executor agent exists** (`/api/agents/ceo/scan` only monitors SLAs) → Jarvis never claims execution.
- **OCR/Document skill (Stage 1):** owner-only owner-OCR. Real WhatsApp media **download** (`src/lib/whatsapp/media.ts`) + audit log (`jarvis_documents`) + honest reply. The tesseract engine (`src/lib/supplierDocuments/ocrAdapter`) is wired via `analyze.ts` as a callable **service boundary** but is **NOT run inline in the webhook** (tesseract is slow → Meta retry/timeout risk); in-chat extraction is the async next step. External documents are logged as **customer-intake attachments** by the Order Intake skill (never owner OCR).
- **Not built yet:** general skill registry beyond these three, LLM parser, live inventory data, owner using the order skill, inline/async OCR extraction over WhatsApp, real CEO/reminder execution.

## Previous state vs current architecture direction (honest)

**Before** (initial WhatsApp work): Jarvis was **not** a central assistant — it was a set of
**per-channel handlers**. The WhatsApp webhook owned the business logic directly: it parsed
text with regex, created drafts inline, and replied with static strings. There was **no brain,
no skill abstraction, no shared state model, no channel-agnostic core**. Telegram was a
separate handler stack; the in-app `/api/agents` chat-engine was a third, unrelated stack.
"Skills" did not exist as a concept — flows were local deterministic handlers.

**After**: Jarvis is defined as **Brain/Orchestrator + Skills**, with channels as **adapters**.
- **Brain** (`orchestrator.ts`): identifies sender role + state, selects a skill, returns messages.
- **Skills** (`src/lib/jarvis/skills/*`): channel-agnostic units that own a domain and return
  messages — Order Intake (full), CEO/Manager (pending queue), OCR/Document (audit + boundary).
- **WhatsApp** (`gateway.ts` / `master.ts`): a thin adapter — normalize → call skill → render.
- **Telegram / Web / UI**: future adapters that will call the same `runJarvis` + skills.

**Per-area before → after**
- **Order Intake:** inline draft creation with thrown-away summary → a real skill with an editable
  cart, free-text edits, confirmation, Option-2 persistence.
- **CEO/Manager:** inline `createMasterItem('ceo_request')` from the menu → a skill with intent
  detection, structured pending requests, and status listing (still no executor — honest).
- **OCR/Document:** a placeholder that logged a `jarvis_master_items` row and said "not connected"
  → a skill with real media download, a `jarvis_documents` audit trail, and the tesseract engine
  wired as a callable service boundary (still not run inline — honest).
- **Owner menu:** all logic inline in `master.ts` → menu/navigation stays, but CEO + OCR now
  **delegate to their skills**; order-for-owner is the remaining inline path.
- **External customer flow:** keyed off the exact link phrase, made garbage drafts for greetings →
  content-classified intake routed through the Order Intake skill; documents = customer attachments.

**What Jarvis is NOT yet (do not overstate):**
- **No LLM brain.** All understanding is **deterministic** (regex/keyword + Hebrew stem matching),
  isolated behind skill interfaces so an LLM can replace it later with no state/adapter changes.
- **No general skill registry** — `selectSkills` is an initial structure (external → orderIntake;
  owner CEO/OCR via the adapter). The owner path isn't fully migrated into the brain.
- **No live inventory, no inline/async OCR extraction, no CEO executor, no reminder firing.**
- **To become a stronger true AI assistant:** add an LLM classification/extraction layer behind the
  parsers; a real skill registry + intent router; an async worker for OCR; executor integrations
  for CEO/reminders/inventory; and Telegram/Web adapters on the same core.

## Order Intake behavior (see also docs/WHATSAPP_JARVIS_LOGIC.md)

- **Draft timing = Option 2 (immediate + editable).** A meaningful customer request creates a pending draft right away (no lead is lost); follow-up free text edits the **same** draft (add / remove / correct quantity); "מאשר/שלח/זה בסדר" sets `customer_confirmed=true` (status stays `pending_review`, so it remains in the office queue, flagged ✓). A real work_order is never created automatically.
- **State:** the active draft id is held in `whatsapp_sessions.state.order`; the cart items live in `team_bot_order_drafts.cart`.
- **Summary** is regenerated from the cart after every edit and sent back to the customer, followed by the Elkayam logo on open/confirm.
