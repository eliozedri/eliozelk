# Jarvis WhatsApp — Product Logic & Routing

This document is the source of truth for how Jarvis behaves on WhatsApp. Keep code and
this doc in sync. Code lives in `src/lib/whatsapp/` and `src/app/api/whatsapp/webhook/route.ts`.

## Core product principles

1. **Jarvis is an assistant/agent, not a dumb menu bot.** It reads and interprets natural
   Hebrew. Buttons/menus are convenience helpers, never the only way to interact.
2. **The wa.me pre-filled link is only a convenience shortcut.** The system must behave
   identically whether the customer used the link, scanned a QR, saved the contact, got
   the number from someone, or just typed any first message. Logic must never depend on
   "did this exact text come from the link?".
3. **Sender role is the first routing decision** (see Routing order).
4. **External customers automatically enter customer/order-intake context.** No setup, no
   keyword required.
5. **External customers never need to type "תפריט".**
6. **A vague / greeting / random / starter first message opens the customer intake
   wizard** — it never produces "לא בטוח שהבנתי" as a first response and never creates an
   empty draft.
7. **A meaningful order message is parsed directly** into a pending draft + structured
   Hebrew summary + Elkayam logo.
8. **Buttons are UX helpers, not the only input method.** Free text always works.
9. **No external customer can access owner/master capabilities** (menu, CEO, personal
   area, settings, admin).
10. **No real `work_order` is ever created automatically.** External (and owner) intake
    only ever creates a PENDING draft in `/team-bot-orders`; promotion to a real order is
    a manual office action.

## Routing order (the gateway: `gateway.ts`)

1. **Sender role.** `JARVIS_MASTER_PHONE` (csv `JARVIS_MASTER_PHONES` supported), compared
   on a normalized phone (`phone.ts`). Master → Owner Mode; everyone else → External Mode.
2. **Interactive reply** (button/list tap) → routed by stable id (`main.orders`, `nav.back`…).
3. **Global word triggers** (owner): `תפריט` / `menu` / `ג׳ארוויס` / `חזור` / `ביטול`.
4. **Conversation state** (`whatsapp_sessions`): owner `flow`, external `ext` (awaiting details).
5. **Content classification** → intelligent route.
6. **Service-oriented fallback** — only after the customer was already guided.

## External Customer Mode (decision tree)

For an external text message:

- **Awaiting details** (we already sent the intro):
  - looks like an order **or** not pure greeting/noise → create pending draft + summary + logo.
  - still pure greeting/noise → service re-prompt (`EXTERNAL_REPROMPT`), stay awaiting.
- **First message:**
  - `looksLikeOrder(text)` (names a concrete work item — תמרור / שלט / סימון / צביעה /
    מחסום / אבני שפה / כביש / חניה …) → create pending draft + summary + logo.
  - otherwise (greeting / starter / "אפשר הצעת מחיר?" / "צריך עבודה" / "123" / "?" /
    random) → open the intake wizard (`EXTERNAL_INTRO`) and set awaiting.
- Non-text (media) → professional acknowledgement (no draft).

Classifier: `classify.ts` — `looksLikeOrder()` (concrete work keywords; vague intent words
like עבודה / הצעת מחיר / פרטים are deliberately excluded) and `isPureGreetingOrNoise()`.
Summary builder: `summary.ts` (`buildCustomerSummary` — numbered, "כפי שהתקבלה אצלנו",
never invents details, no pricing/execution promises).

## Owner / Master Mode (`master.ts`)

Stateful wizard (interactive list/buttons with numeric + free-text fallback). Areas:
orders/drafts, document/OCR, CEO request, personal area, settings, dictation help. Free-text
intent router covers order / reminder / OCR / CEO; the pre-filled starter opens the orders
menu. Owner is never treated as an external customer.

## Current implementation reality (honest)

- This is a **deterministic, rule/keyword-based router + state machine** — **not** an
  LLM-backed agent. There is no semantic NLU and no shared skill/agent framework wired into
  Jarvis WhatsApp. (The in-app `/api/agents` "digital office" + `chat-engine.ts` is separate
  and NOT used here.)
- Capture-only foundations: WhatsApp media OCR is **not** wired to read documents (web OCR in
  `src/lib/supplierDocuments/` is upload-only); CEO requests and personal reminders are stored
  PENDING and are **not** executed/scheduled.
- **Next-stage upgrade path** (if/when desired): add an LLM classification/extraction layer
  (e.g. Claude via the API) for true semantic understanding + structured order extraction,
  representative-contact routing, and media OCR. The current heuristics satisfy the documented
  behavior and degrade safely (a misjudged opener just costs one extra guiding step; a
  misjudged order still lands a reviewable draft).

## Jarvis Agent Brain / Intent Logic

Jarvis is built as **Brain/Orchestrator + Skills** (see `docs/JARVIS_AGENT_ARCHITECTURE.md`).
WhatsApp is a **channel adapter** (`gateway.ts`) — it normalizes inbound into a `JarvisInput`,
calls `runJarvis()`, and renders the returned messages. The **Order Intake skill**
(`src/lib/jarvis/skills/orderIntake`) is the first real skill and owns all order logic.

- Natural Hebrew text is interpreted by **sender role + conversation state**, not just buttons.
- **External order flow supports additions/corrections before AND after the summary**, via free
  text: add ("תוסיף 20 קונוסים"), correct quantity ("בעצם 7 תמרורים במקום 5"), remove ("תמחק
  את סימון החניה"), confirm ("מאשר/שלח/זה בסדר"), cancel, ask for a representative.
- **In-progress order summaries are editable through text** — each edit updates the SAME draft and
  regenerates the numbered summary. No duplicate drafts.
- **Confirmation is handled naturally** — sets `customer_confirmed` (status stays `pending_review`).
- **Draft-timing decision = Option 2 (create early, edit in place, never lose a lead):** a meaningful
  request creates a pending draft immediately so no customer lead is lost; it stays editable; only
  manual office promotion turns it into a real `work_order`.
- **Inventory/product availability** is an extension point (`catalog.ts`) — Jarvis never invents stock;
  if no data, it says the team will check.
- **LLM is a future upgrade** behind the `parse.ts` interface — swap the deterministic parser for an
  LLM with no change to state/persistence/adapters.
- **More skills (owner-only):** CEO/Manager (pending request queue + status, `jarvis_master_items`),
  OCR/Document (media download + audit `jarvis_documents` + pluggable OCR boundary, not run inline), and
  Personal Area (tasks/notes/reminders/daily capture + list) are wired via the owner adapter. External
  senders can NEVER reach them — external documents are logged as customer-intake attachments only.
  Nothing fakes execution/OCR/scheduling. See `docs/JARVIS_SKILLS_ROADMAP.md`.
- **Central Brain routing:** owner free-text is classified by `src/lib/jarvis/intent.ts` (one classifier,
  role-gated by `registry.ts`) and routed to the matching skill — buttons/menus are optional shortcuts,
  natural Hebrew works throughout. `classifyIntentSmart` now delegates to the **multi-provider LLM Router**
  (`src/lib/jarvis/llm/`) with a safety validator + deterministic fallback; **live LLM is disabled** (no
  key) so behavior is unchanged. The owner CEO/Manager path also gains **Agent Reasoning**: a directive
  resolves to a single read-only command → a multi-step read-only plan → or a queued human task.
  See `docs/JARVIS_LLM_ROUTER.md` + `docs/JARVIS_AGENT_REASONING.md`.

## Invariants (must always hold)

- External never sees the owner menu / CEO / personal / settings.
- No automatic `work_order`. Pending drafts only, manual promotion.
- Telegram (`src/lib/teamBot/*`) is independent and untouched by WhatsApp changes.
- Secrets (tokens, app secret) live only in env; never logged, printed, or committed.
