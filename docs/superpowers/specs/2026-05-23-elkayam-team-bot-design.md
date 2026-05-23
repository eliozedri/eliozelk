# Elkayam Team Bot — MVP Design Spec

**Date:** 2026-05-23
**Status:** Approved — implementing
**Owner:** Elio
**Location:** Elkayam repo (`/Users/eliozedri/Desktop/eliozelk`). NOT JARVIS.

---

## 1. Purpose & scope

A **separate, simple** Telegram bot for the Elkayam operational team. It is an
order-intake + lookup bot — not a personal assistant, not a JARVIS clone, no
WhatsApp, no broad AI reasoning, no duplicate order database.

The bot only **presents** and **transfers** information. It never creates final
or irreversible business records. It writes structured **drafts** into dedicated
`team_bot_*` tables; promotion into real `work_orders` is a deliberate human
action inside the web app.

### In scope (MVP)
1. **Default-deny access control** — only approved Telegram users get a menu.
   Unknown users are blocked and placed in a pending-approval queue.
2. **Order intake** — approved user builds an order from the **active** catalog
   (departments → items → quantity → cart) or via quick free-text, then submits
   it as a draft.
3. **Source tracking** — every bot submission is permanently stamped as
   Telegram-origin (`source = 'telegram_bot'`) and remains traceable as
   **"הזמנה דרך הבוט מהטלגרם"** after promotion, editing, billing, reporting, audit.
4. **Open-orders lookup** — read-only list of open orders with status. No
   financial/sensitive data.

### Explicitly OUT of scope (deferred unless requested later)
Work logs, inventory/material requests, problem reports, general notes,
edit-existing-order, crew assignment, warehouse workflows, field-worker
workflows, employee/team chat, multi-team management.

---

## 2. Roles (minimal)

Stored on `team_bot_users.role`:

| Role | Capabilities |
|------|--------------|
| `admin` | submit orders, view open orders, approve/block pending users, mint access codes |
| `authorized_user` | submit orders, view open orders |
| `viewer` | view open orders only (read-only) |

Status lifecycle on `team_bot_users.status`: `pending` → `active` (or `blocked`).

---

## 3. Architecture

- **Transport:** raw Telegram Bot API over `fetch` to
  `https://api.telegram.org/bot<token>/<method>`. **Zero new dependencies.**
  Mirrors the existing `src/app/api/whatsapp/webhook/route.ts` pattern.
- **Webhook:** `POST /api/team-bot/webhook`. Verified via Telegram's
  `secret_token` (sent as `X-Telegram-Bot-Api-Secret-Token` header). Unverified
  requests → 401. Always returns 200 quickly to inbound updates so Telegram does
  not retry-storm.
- **Conversation state:** `team_bot_sessions` table keyed by `telegram_user_id`
  holds `state jsonb` = current step + working cart + breadcrumbs. Inline-keyboard
  `callback_query` updates drive navigation; plain text messages fill in
  quantities / customer name. No grammY, no session framework.
- **Service role:** the bot uses `getServiceSupabase()` (bypasses RLS).
  Therefore **authorization is enforced in code, default-deny, before any data
  access.**
- **Catalog reuse:** the pure department-mapping (`DEPARTMENTS`,
  `categoryToDepartment`, `findDepartment`) is factored out of
  `src/app/api/jarvis/catalog/_shared.ts` into `src/lib/catalog/departments.ts`
  and reused by both. The bot reads `catalog_items` with `is_active = true` and
  **re-validates `is_active` at submit time**.

### Code layout
```
src/lib/catalog/departments.ts            # pure DEPARTMENTS + mapping (shared)
src/lib/teamBot/
  telegram.ts                             # fetch-based Telegram client (sendMessage, editMessageText, answerCallbackQuery, setWebhook)
  auth.ts                                 # default-deny resolver, bootstrap, access-code redemption, approval
  sessions.ts                             # load/save/clear team_bot_sessions
  catalog.ts                              # active-catalog reads (departments, items, item-by-id)
  drafts.ts                               # create order draft (+ is_active re-validation, source stamping)
  orders.ts                               # read-only open-orders lookup
  messages.ts                             # Hebrew message + keyboard builders
  router.ts                               # update → handler dispatch (commands, callbacks, text)
src/app/api/team-bot/webhook/route.ts     # thin webhook: verify secret, dedupe, dispatch, return 200
scripts/teamBot/set-webhook.ts            # one-time webhook registration (run after deploy)
scripts/teamBot/delete-webhook.ts
supabase/migrations/2026XXXX_team_bot_foundation.sql
```

---

## 4. Database

### New migration: `team_bot_foundation`

**`team_bot_users`**
- `id uuid pk default gen_random_uuid()`
- `telegram_user_id text not null unique`
- `telegram_username text`
- `display_name text`
- `phone_number text` (nullable; not collected in MVP)
- `role text not null default 'viewer'` — check in (`admin`,`authorized_user`,`viewer`)
- `status text not null default 'pending'` — check in (`pending`,`active`,`blocked`)
- `linked_profile_id uuid references public.profiles(id)` (nullable)
- `approved_by text`, `approved_at timestamptz`
- `created_at`, `updated_at timestamptz`

**`team_bot_access_codes`**
- `id uuid pk`
- `code_hash text not null` — SHA-256 of the code; **never** store plaintext
- `role_to_assign text not null default 'authorized_user'`
- `expires_at timestamptz`
- `max_uses int not null default 1`, `used_count int not null default 0`
- `created_by text`, `active boolean not null default true`
- `created_at`

**`team_bot_sessions`**
- `telegram_user_id text pk`
- `state jsonb not null default '{}'`
- `updated_at timestamptz`

**`team_bot_order_drafts`**
- `id uuid pk default gen_random_uuid()`
- `telegram_user_id text not null`
- `submitted_by_name text`
- `source text not null default 'telegram_bot'`
- `intake_channel text not null default 'telegram_team_bot'`
- `status text not null default 'pending_review'` — check in (`pending_review`,`promoted`,`rejected`)
- `customer text`, `contact_person text`, `city text`, `notes text`
- `cart jsonb not null default '[]'` — `[{ catalog_item_id, name, unit, category, type, quantity, notes }]`
- `promoted_order_id text references public.work_orders(id)` (nullable)
- `reviewed_by text`, `reviewed_at timestamptz`
- `created_at`, `updated_at timestamptz`

**`team_bot_events`**
- `id uuid pk`
- `telegram_user_id text`
- `update_id bigint` — Telegram update id, for idempotency (unique where not null)
- `event_type text`
- `payload jsonb`
- `created_at`

All tables: `enable row level security`; **no client write policies** (service
role only). Authenticated read policy on `team_bot_order_drafts` and
`team_bot_users` for the web review UI (TB-4).

### Source-tracking columns on `work_orders` (additive, backward-compatible)
```sql
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS source     text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS source_ref text;  -- team_bot_order_drafts.id when promoted from bot
CREATE INDEX IF NOT EXISTS idx_work_orders_source
  ON public.work_orders (source) WHERE source <> 'web';
```
- `source` values: `'web'` (default, all existing + manual web orders) | `'telegram_bot'`.
- Promotion sets `source='telegram_bot'`, `source_ref=<draft id>`, so origin
  survives every downstream stage. Surfaced in `/orders` as a
  **"📱 הזמנה דרך הבוט מהטלגרם"** badge + a source filter.

---

## 5. Access control flow (default-deny)

Every inbound update:
1. Extract `telegram_user_id`. Dedupe by `update_id` (skip if already in `team_bot_events`).
2. Look up `team_bot_users`.
3. **Not found** → create a `pending` row (capture username/display name), log
   event, show the restricted screen:
   ```
   🔒 הגישה לבוט מוגבלת
   ━━━━━━━━━━━━━━
   בוט זה מיועד לעובדי וצוותי אלקיים בלבד.

   הבקשה שלך נשלחה למנהל לאישור.
   אפשר גם להזין קוד כניסה שקיבלת מהמנהל.

   מזהה Telegram שלך:
   <id>
   ```
   No menu, no catalog, no orders.
4. **status = `pending`** → same restricted screen ("ממתין לאישור מנהל"). Allow
   entering an access code (`/code <CODE>` or a button-prompted text) — a valid,
   active, unexpired, under-quota code flips status to `active` and assigns
   `role_to_assign`, increments `used_count`.
5. **status = `blocked`** → restricted screen, no code entry.
6. **status = `active`** → show menu; further actions gated by `role`.

### Bootstrap admin
A one-time code seeded into `team_bot_access_codes` with
`role_to_assign='admin'`, `max_uses=1`, short expiry. The plaintext is generated
locally, shown to Elio once (out of band), and only its hash is stored. Elio
presses Start and enters the code → becomes `admin`. Admins then approve pending
users and mint further codes from within the bot.

### Admin approval (in-bot, minimal)
Admin menu item "ניהול בקשות גישה" lists `pending` users with ✅ אישור /
🚫 חסימה inline buttons. Approving sets `status='active'`, default role
`authorized_user`, records `approved_by/at`.

---

## 6. Main menu (active users)

```
👷 בוט צוות — אלקיים
━━━━━━━━━━━━━━
בחר פעולה:
1. 📚 קטלוג ובניית הזמנה
2. 🛒 הסל שלי
3. 📋 הזמנה בטקסט חופשי
4. 📂 הזמנות פתוחות
5. ❓ עזרה
```
admin additionally sees: `🔐 ניהול בקשות גישה`, `➕ יצירת קוד גישה`.
viewer sees only: `📂 הזמנות פתוחות`, `❓ עזרה`.
Every screen includes: `↩️ חזרה`, `🏠 תפריט ראשי`, `🚫 ביטול פעולה`.

---

## 7. Order-intake flow

1. 📚 catalog → list departments (with active counts; empty ones greyed/disabled).
2. select department → paginated active items (name + unit + price hint).
3. select item → prompt quantity (numeric text).
4. quantity → add to cart; offer "➕ הוסף עוד" / "🛒 לסל".
5. 🛒 review cart → edit/remove lines; prompt customer (required), city, notes.
6. ✅ submit → **re-validate every cart item is still `is_active`**. If any item
   is now inactive: block submit, show which item, let user remove it. On success
   write **one** `team_bot_order_drafts` row (`status='pending_review'`,
   `source='telegram_bot'`), clear session cart, confirm with draft reference.

Quick free-text path (menu item 3): capture free text + customer → one draft row
with `cart=[]` and the text in `notes`.

The bot **never** inserts into `work_orders`.

---

## 8. Open-orders lookup (read-only)

`work_orders` where `status NOT IN ('completed','cancelled')`, ordered by
`created_at desc`, limited (e.g. 20). Per order show: order number, customer,
city, status label (Hebrew via `STATUS_LABELS`), date. **No** billed amount,
invoice, cost, or other financial/sensitive fields. Tapping an order shows the
same operational fields in detail. Available to all active roles.

---

## 9. Web review & promotion (TB-4)

A "הזמנות מהבוט" view (section in `/orders` or a sibling screen), gated to office
roles (`create_order` action permission). Lists `pending_review` drafts. Actions:
- **קידום להזמנה** → create a `work_order` with cart mapped onto `miscRows[]`
  (carrying `catalogItemId/Name/Unit/Category/Type` + quantity/notes),
  `source='telegram_bot'`, `source_ref=<draft id>`; set draft
  `status='promoted'`, `promoted_order_id`.
- **דחייה** → `status='rejected'` + reviewer/time.
Orders table shows the **"📱 הזמנה דרך הבוט מהטלגרם"** badge and a source filter.

---

## 10. Phasing

- **TB-1 — Foundation + auth gate:** migration; secure env
  (`TEAM_BOT_TELEGRAM_TOKEN`, `TEAM_BOT_WEBHOOK_SECRET`); Telegram client lib;
  webhook route (verify secret + dedupe); default-deny resolver; bootstrap-admin
  code; pending/approval; main menu; restricted screen. Smoke tests with
  simulated updates.
- **TB-2 — Catalog + cart + draft submit** (with `is_active` re-validation +
  source stamping). Smoke tests.
- **TB-3 — Open-orders lookup** (read-only). Smoke tests.
- **TB-4 — Web review & promotion + source badge/filter** in `/orders`.

---

## 11. Safety gates & non-goals

- Bot writes **only** to `team_bot_*` tables. Never `work_orders` directly.
- Token in `.env.local` only (`.env*` is gitignored). Never printed, echoed,
  committed, or written into source.
- Telegram security = default-deny + Telegram-user-ID approval. The bot link is
  distribution convenience only, never the security mechanism.
- No financial/customer-sensitive data exposed to bot users.
- No JARVIS modification, no JARVIS runtime dependency, no WhatsApp, no LLM brain.

### Stop conditions (pause for Elio)
- Connecting the **production webhook** / public deployment.
- Sending a **real Telegram message from the phone**.
- Entering the **one-time admin code** (Elio does this in Telegram).
- Anything risking secret exposure or direct production-data mutation.

---

## 12. Testing

- **Local smoke tests** (vitest): POST synthetic Telegram update payloads to the
  webhook handler and assert default-deny, code redemption, menu rendering, cart
  add, draft creation (with `source` markers), `is_active` re-validation block,
  and open-orders read shape. No live Telegram round-trip locally (webhooks need
  a public URL).
- **Live verification** (gated): after deploy, `set-webhook` against the Vercel
  URL, then Elio sends `/start` from the phone.
