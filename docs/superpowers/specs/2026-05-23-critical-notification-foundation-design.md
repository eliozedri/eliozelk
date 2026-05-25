# Critical Employee Notification & Acknowledgement — Foundation (Phase 1) Design

**Date:** 2026-05-23
**Status:** Approved for spec review
**Scope:** Phase 1 (foundation) of a larger, multi-phase notification platform. This document
specifies the foundation only. Web Push, PWA, mandatory setup gate, reminders/escalation, the
admin rules-management UI, and recipient groups are explicitly **out of scope here** and have
dedicated future phases.

---

## 1. Goal & core principle

Build the operational foundation for an internal, self-hosted critical-notification system for the
Elkayam operations platform. No third-party notification SaaS (no Firebase, OneSignal, Knock, Novu,
Pusher, Ably, SMS). Phase 1 relies only on the existing stack: Supabase (Postgres + Realtime + RLS),
Next.js server routes, and browser-native APIs.

**Core principle (drives the whole design):** a critical notification is *not* "handled" because a
toast or OS notification was dismissed. It is handled only when the assigned employee **opens the
Elkayam app and acknowledges it inside the application** — and, for items with a related entity,
only after they have **viewed that entity**. The application database is the single source of truth.

### Phase 1 delivers
- 5 DB tables + triggers + RLS (detection, events, per-recipient state, ack audit, rule config).
- DB-trigger-based event detection for 3 seeded operational events.
- `NotificationProvider` with Supabase Realtime delivery.
- Notification Center (bell + slide-over drawer), role-filtered, available to all users.
- `CriticalAlertGate` — blocking modal with view-before-ack enforcement (one critical at a time).
- Gentle in-app sound (Web Audio, mute toggle, autoplay-safe).
- Server API routes for acknowledge / seen / mark-opened / demo.
- Demo/test event generation for end-to-end verification.

---

## 2. Existing-system context (verified)

- **Stack:** Next.js 16.2.6, React 19, TypeScript, Tailwind v4, Hebrew RTL, Heebo font.
- **Supabase** cloud (`gtevmcnasvrahzfdqrqk`): Auth + Postgres + **Realtime already used** via
  `.channel(...).on("postgres_changes", …)` in `src/hooks/useOrders.ts`, `useWorkDiaries.ts`, etc.
- **Roles ARE the org units** (`src/types/auth.ts`): `master`, `office_manager`, `graphics_manager`,
  `procurement_manager`, `tender_manager`, `finance_manager`, `fleet_manager`, `field_worker`,
  `viewer`. There is **no separate `departments` table** — "by department" maps onto role. Per-user
  `allowed_tabs` / `action_permissions` live on the `profiles` table.
- **Server auth:** `src/lib/auth/apiAuth.ts` (`requireAuth` / `requireAction` / `requireRole`) + a
  service-role Supabase client. All new write endpoints reuse this.
- **Client auth:** `src/context/AuthContext.tsx` exposes `useAuth()` → `{ profile, loading, … }`.
- **Shell / injection point:** `src/components/AppShell.tsx` →
  `AuthProvider` → `NavigationGuardProvider` → `AppShellInner` (Sidebar + main). The
  `NotificationProvider` and `CriticalAlertGate` mount here.
- **Event origins (verified):** all three Phase-1 events are created by **direct client-side
  Supabase inserts**, not server routes:
  - new order → `src/hooks/useOrders.ts` (`work_orders` insert)
  - work log → `src/hooks/useWorkDiaries.ts` (`work_diaries` insert)
  - field issue → `src/hooks/useOrders.ts` (`order_problems` insert)
- **No PWA manifest, no service worker, no web push exist today** — that is future-phase work.

---

## 3. Architecture decision: DB-trigger detection (Approach A — approved)

Because events are created by direct client inserts and may in future also originate from Telegram,
external APIs, automation, imports, or agent actions, detection lives in the **database**, not in the
app layer. An `AFTER INSERT` trigger fires regardless of which client or code path created the row.

- **Cannot be bypassed** — satisfies the "employees can't bypass mandatory alerts" requirement.
- **Source-agnostic** — any future writer of these rows triggers the same notification.
- **No throwaway** — rule config lives in real `notification_rules` tables from day one, so the
  future admin panel (System B) is pure UI over existing tables.
- **Templating stays out of SQL** — rules store static `title`/`message`; dynamic values (order #)
  travel via `related_entity_id` / `metadata` and are rendered client-side.

Rejected alternative (Approach B, app-layer TS dispatch util): client-driven (bypassable), scatters
detection across hooks, and requires rework once admin rules arrive.

---

## 4. Database schema (Phase 1 migration)

Delivered as an idempotent migration, consistent with the project's existing setup-endpoint pattern.
Five tables. The two `*_rules` tables are created **and seeded** now (no admin UI yet) so config is
DB-backed from day one.

### 4.1 `notification_rules` — config source (seeded with 3 rows)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| event_type | text unique | e.g. `order.created` |
| enabled | bool default true | |
| title | text | static; client renders dynamic suffixes |
| message | text | static |
| severity | text check in (`info`,`warning`,`critical`) | |
| source_module | text | `orders`/`work_logs`/`inventory`/`finance`/`system`/`telegram`/`field` |
| requires_ack | bool default false | |
| blocking | bool default false | show `CriticalAlertGate` |
| play_sound | bool default false | |
| show_in_center | bool default true | |
| exclude_actor | bool default true | don't notify the creator |
| reminder_enabled | bool default false | **inert in P1** (Phase 6 slot) |
| reminder_interval_minutes | int null | inert P1 |
| escalation_enabled | bool default false | inert P1 |
| escalation_delay_minutes | int null | inert P1 |
| escalation_target | jsonb null | inert P1 |
| expires_after_minutes | int null | inert P1 |
| created_at / updated_at | timestamptz default now() | |

### 4.2 `notification_rule_recipients` — who each rule targets
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| rule_id | uuid fk → notification_rules | on delete cascade |
| recipient_type | text check in (`role`,`user`,`group`) | `group` inert in P1 |
| recipient_value | text | role name, user uuid, or group key |
| created_at | timestamptz default now() | |

### 4.3 `notifications` — the fired event (immutable behavior snapshot)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| event_type | text | |
| rule_id | uuid fk null | |
| title / message | text | |
| severity | text | snapshot from rule at fire time |
| source_module | text | |
| related_entity_type | text null | `work_order`/`work_diary`/`order_problem` |
| related_entity_id | text null | |
| created_by | uuid null | actor (from source row) |
| requires_ack | bool | snapshot |
| blocking | bool | snapshot |
| play_sound | bool | snapshot |
| expires_at | timestamptz null | inert in P1 |
| metadata | jsonb default '{}' | dynamic values (e.g. order number) |
| created_at | timestamptz default now() | |

Behavior is **snapshotted** onto the notification at fire time, so later rule edits never mutate
already-fired events.

### 4.4 `notification_recipients` — per-person delivery + ack state (realtime + RLS surface)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| notification_id | uuid fk → notifications | on delete cascade |
| user_id | uuid | targeted user |
| matched_role | text null | role that matched (audit) |
| status | text default `pending` | `pending`/`delivered`/`seen`/`acknowledged`/`escalated`/`failed`/`expired` |
| delivered_at | timestamptz null | |
| seen_at | timestamptz null | drawer opened / item seen in list |
| related_opened_at | timestamptz null | set when user opens the related entity |
| acknowledged_at | timestamptz null | |
| ack_was_direct | bool default false | true when acked with no related entity |
| escalation_level | int default 0 | inert in P1 |
| last_push_sent_at | timestamptz null | inert in P1 (Phase 4 slot) |
| next_reminder_at | timestamptz null | inert in P1 |
| created_at | timestamptz default now() | |

One row per targeted user (each person acknowledges individually).
Unique constraint `(notification_id, user_id)` to de-duplicate fan-out.

### 4.5 `notification_acknowledgements` — immutable audit log ("provable ack")
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| notification_id | uuid fk | |
| recipient_id | uuid fk → notification_recipients | |
| user_id | uuid | |
| acknowledged_at | timestamptz default now() | |
| related_opened_at | timestamptz null | copied from recipient at ack |
| ack_was_direct | bool | |
| device_info | jsonb null | user-agent snapshot (optional) |
| created_at | timestamptz default now() | |

### 4.6 Indexes
`notification_recipients(user_id, status)`, `notification_recipients(notification_id)`,
`notifications(event_type)`, `notifications(created_at desc)`,
`notification_rule_recipients(rule_id)`, unique `notification_recipients(notification_id, user_id)`.

### 4.7 RLS — client is read-only on these tables
- `notification_recipients`: SELECT where `user_id = auth.uid()`; `master` sees all.
- `notifications`: SELECT where an owned recipient row exists (`EXISTS (… user_id = auth.uid())`);
  `master` sees all.
- `notification_rules` / `notification_rule_recipients`: SELECT for authenticated (read-only);
  writes service-role only (admin panel later).
- `notification_acknowledgements`: SELECT where `user_id = auth.uid()`; `master` sees all.
- **All INSERT/UPDATE** happen via trigger functions (`SECURITY DEFINER`) or service-role API
  routes. The client never writes these tables directly. This mirrors `apiAuth.ts` posture and the
  project's "API routes use service role; clients read via RLS" convention.

### 4.8 Tables intentionally NOT created in Phase 1
`push_subscriptions`, `notification_delivery_attempts`, `notification_admin_audit_log`,
`notification_recipient_groups`. (Phases 4 / 6 / admin-panel.)

---

## 5. Detection & recipient resolution (triggers)

### 5.1 Trigger functions
`SECURITY DEFINER` plpgsql function `fn_emit_notification(p_event_type text, p_entity_type text,
p_entity_id text, p_created_by uuid, p_metadata jsonb)`:
1. `SELECT` the enabled rule for `p_event_type`; if none or `enabled=false`, return.
2. Insert one `notifications` row, snapshotting `severity/source_module/requires_ack/blocking/
   play_sound/title/message` from the rule and setting `related_entity_*`, `created_by`, `metadata`.
3. Fan out `notification_recipients`:
   - role targets → `INSERT … SELECT id, 'role-name' FROM profiles WHERE role = value AND is_active`
   - user targets → that user id
   - group targets → no-op in P1
   - always include `master` users
   - if `rule.exclude_actor` then exclude `p_created_by`
   - `ON CONFLICT (notification_id, user_id) DO NOTHING` to de-dupe.

Thin per-table trigger wrappers translate each table's row shape into the call:
- `trg_work_orders_ai` → `fn_emit_notification('order.created','work_order',NEW.id,NEW.created_by, …)`
- `trg_work_diaries_ai` → `fn_emit_notification('diary.submitted','work_diary',NEW.id,…)`
- `trg_order_problems_ai` → `fn_emit_notification('field.issue','order_problem',NEW.id,…)`

(Exact source-column names — `created_by`, order number for metadata — verified against the live
schema during implementation.)

### 5.2 Point-in-time semantics
Recipients resolve at fire time. A later role change does not retro-target an existing notification —
correct for a point-in-time operational event.

---

## 6. Phase 1 seeded event defaults (approved)

| event_type | severity | requires_ack / blocking | play_sound | recipient roles |
|---|---|---|---|---|
| `order.created` | warning | no / no | yes | office_manager, graphics_manager, master |
| `diary.submitted` | info | no / no | no | fleet_manager, office_manager, master |
| `field.issue` | **critical** | **yes / yes** | yes | office_manager, fleet_manager, master |

`master` is always added by the resolver regardless of rule recipients. `field.issue` is the event
that exercises the full blocking + view-before-ack loop.

### 6.1 `order.created` is a PRODUCTION-INTAKE event (business-logic clarification — 2026-05-24)

> **Added after Phase-1 apply, per owner clarification. This supersedes the simplistic seeded
> default in the table above, which is now flagged as a mismatch to fix (see §6.2).**

A new order is **not** a generic office toast — it is a **production/fulfillment intake event** that
starts work inside the factory. The notification must reach the **relevant production departments**
so they cannot miss an incoming order, and it must be **received/acknowledged**, not merely seen.

**Target by relevant department (content-aware), not a generic office list.** The three production
departments and the order content that routes to each:
- **Graphics / גרפיקה** — graphics, print, design, sketch, signage design, stickers, visual prep.
- **Metal Workshop / מסגרייה** — metal fabrication, sign structures, posts, frames, barriers,
  workshop production.
- **Warehouse / מחסן** — stock items, traffic equipment, cones, barriers, signs from inventory,
  safety accessories, warehouse picking/preparation.
- An order touching multiple areas → **all** relevant departments receive it.
- **Plus** operational managers / `master` per configuration (for monitoring).

**"Office" nuance:** do not assume every new order pings the general office visually. Distinguish
(a) office/staff users who may not need every production alert, (b) operational managers / `master`
who need monitoring, (c) future agent/"office-of-agents" logic (separate). The *user-facing* alert
targets the **production departments**.

**Required behavior for `order.created`:**
- `severity`: warning or critical (admin-configurable) — **treated as a strong operational alert**,
  not `toast_5s`.
- `requires_ack: true` — the relevant department/assigned user must confirm **receipt**.
- `require_open_before_ack: true` — open/view the order before confirming receipt.
- Remains **pending until acknowledged**; dismissing an OS/browser notification never counts.
- Identifying info to surface: **order name, order number, customer (if available), relevant
  department/work area (if available)**.
- Later: Web Push when app/browser/screen closed; snooze/reminders if a department doesn't ack;
  appears in the future **"מרכז התראות"**.

Contrast: `diary.submitted` and routine updates stay **light** (`toast_5s`, no required ack, no
aggressive sound). `order.created` is intake and must not behave like a routine toast.

### 6.2 RECONCILIATION DECISION (2026-05-24) — safe Phase-1 fallback, NON-blocking

The **applied** DB seed (migration `20260601000000`, live on prod) has `order.created` as
`severity=warning, requires_ack=false, blocking=false`, recipients `office_manager, graphics_manager,
master`. That does not match the production-intake intent (§6.1).

**Decided Phase-1 reconciliation (owner-approved 2026-05-24):** make `order.created` a *strong,
acknowledged* intake event, but **NOT hard-blocking yet**, and keep the existing static recipients
(true department routing deferred). Rationale: there are 0 `graphics_manager` users, no Metal-Workshop/
Warehouse roles, `exclude_actor` is inert (orders carry no creator uuid), and the schema has only one
per-notification `blocking` flag (no per-recipient mode) — so hard-blocking would lock master/office
on every order, including self-created ones.

**Ready follow-up migration (NOT yet applied — needs separate explicit approval to touch prod):**
```sql
-- 20260603000000_order_created_production_intake.sql  (additive: one UPDATE)
update public.notification_rules
set requires_ack = true,       -- was false: now requires receipt-acknowledgement
    blocking     = false,      -- HARD-BLOCK DEFERRED (see conditions below)
    severity     = 'warning',  -- strong operational warning (not critical full-lock)
    play_sound   = true,
    updated_at   = now()
where event_type = 'order.created';
```
- **View-before-ack already works**: `order.created` notifications carry a related `work_order`
  entity, so the existing `serverAckAllowed` / gate predicate requires opening the order before ack.
  No code change needed.
- **Recipients unchanged** (`graphics_manager + office_manager + master`). Strong/persistent in the
  Notification Center, pending until acknowledged; **not** a `toast_5s`.

**Hard-blocking for `order.created` is DEFERRED until ALL of these exist:**
1. clean content-aware **department routing** (signals available: `fabrication_required`,
   `warehouse_required`, graphics proxy `graphics_sent_at`/`status='graphics_pending'`);
2. **roles/users** for Graphics, Metal Workshop, Warehouse (today only `graphics_manager` exists);
3. **creator-exclusion** (needs a creator uuid on the order row, currently absent);
4. **per-recipient display/blocking mode** (schema today has a single per-notification `blocking` flag);
5. **admin control** from the future **"מרכז התראות"** panel.

**Future per-rule fields** implied by the consolidated requirements (not in the current schema):
`display_mode` (`toast_5s`/`persistent_banner`/`blocking_modal`/`notification_center_only`),
`require_open_before_ack`, `block_app_until_ack`, `auto_dismiss_seconds`, `snooze_enabled`,
`reminder_*`, `web_push_*`, `include_entity_details_in_push` — admin-configurable later, not hardcoded.

---

## 7. Realtime delivery (`NotificationProvider`)

- New client provider mounted in `AppShellInner` (inside `AuthProvider`).
- Subscribes to Supabase Realtime on `notification_recipients` filtered `user_id=eq.<uid>`, events
  INSERT + UPDATE, reusing the existing `.channel(...).on("postgres_changes", …)` pattern.
- On a new recipient row: fetch the joined `notification` (RLS-allowed) once and cache it in state.
- Provider state: `notifications[]` (merged recipient+notification view), `unseenCount`,
  `pendingCritical` (highest-priority `blocking && requires_ack && status != acknowledged`),
  helper actions (`open`, `markSeen`, `markOpened`, `acknowledge`).
- On mount / app load: hydrate from DB (`SELECT` recent recipient rows for the user) so a refresh
  while a critical is pending re-raises the gate. De-dupe by notification id across tabs.

---

## 8. Notification Center (UI placement)

- **Bell:** in the Sidebar header (always visible on desktop) **plus** a fixed mobile bell button
  mirroring the existing top-right hamburger (top-left in RTL). Badge = unseen/unacknowledged count.
- **Drawer:** RTL slide-over. Grouped sections, top→bottom:
  1. **קריטי וממתין לאישור** — pending `requires_ack` items
  2. **חדש** — unseen non-critical
  3. **נקרא** — seen/acknowledged history
- **Row:** severity icon + color, title, message, relative time, source-module chip, status badge
  (`ממתין` / `נצפה` / `אושר` / `פג תוקף`), primary action button (`פתח` / `אשר`).
- Opening the drawer marks visible items `seen` (via `/api/notifications/seen`).
- All copy in plain Hebrew; no technical jargon for employees.

---

## 9. `CriticalAlertGate` + view-before-ack (core behavior)

A top-level overlay in `AppShellInner`, driven by `pendingCritical`. **One critical at a time in
Phase 1** (data model already supports many; stacking is a later UI-only change). Per-critical state
machine:

- **UNVIEWED** — full-screen blocking modal. Buttons: **[פתח/י את הפריט]** (calls
  `/api/notifications/mark-opened`, then navigates to the related entity route) and **[אישור]**
  *(disabled)*. Copy: "צפה/י בפריט לפני אישור."
- **VIEWED + on the related entity route** — modal collapses to a **persistent, non-dismissable
  banner** with **[אישור]** *enabled*, so the user can work the item.
- **VIEWED + navigated elsewhere** — full blocking modal **re-asserts** (ack enabled, since already
  viewed). This is what keeps "normal navigation elsewhere blocked."
- **No related entity** — ack enabled immediately; on ack, `ack_was_direct=true` and it is logged.
- **ACKNOWLEDGED** — gate clears; next pending critical (if any) takes over.

The gate decides modal-vs-banner by comparing the current `pathname` to the related entity's route
(`relatedEntityHref(type, id)`). Phase 1 routes: `work_order`/`order_problem` → `/orders`,
`work_diary` → `/work-diary`.

**TEMPORARY (Phase 1 compromise — must be documented as such):** navigating to the *module route*
(e.g. `/orders`) counts as "opened" for order-related notifications; deep-linking to the *specific*
record is not yet required. `related_opened_at` is recorded on the open-item button click regardless.

**Preserve the strict deep-link path:** `relatedEntityHref(type, id)` must be a single resolver that
already takes both `related_entity_type` and `related_entity_id`, and the "opened" check must be a
single predicate function. This keeps a clean upgrade path so a later phase can require the user to
open the *exact* order / work diary / field issue (e.g. `/orders?orderId=<id>` with the page opening
that record, and `related_opened_at` set only once that specific record is in view) without
reworking the gate or the schema. The implementation must not hard-code module-route assumptions
anywhere outside this single resolver/predicate pair.

**Coexistence:** the `CriticalAlertGate` takes visual precedence over the existing
draft-protection modal (`NavigationGuardProvider`). Both can mount; the critical gate wins z-order.

---

## 10. Acknowledgement storage & server enforcement

- **Current state** lives on `notification_recipients` (`status`, `seen_at`, `related_opened_at`,
  `acknowledged_at`, `ack_was_direct`).
- **Immutable audit** lives in `notification_acknowledgements` (one row per ack).
- **Server enforces view-before-ack.** `/api/notifications/acknowledge` (service role +
  `requireAuth`, ownership check `recipient.user_id == auth user`):
  - if notification has a related entity and `related_opened_at IS NULL` → **HTTP 400** (client
    cannot fake the ack).
  - else set `status='acknowledged'`, `acknowledged_at=now()`, insert the audit row;
    `ack_was_direct = (related_entity is null)`.

---

## 11. Server API routes (service role + `apiAuth.ts`)

| route | method | auth | purpose |
|---|---|---|---|
| `/api/notifications/seen` | POST | `requireAuth` + ownership | mark recipient rows `seen` |
| `/api/notifications/mark-opened` | POST | `requireAuth` + ownership | set `related_opened_at` |
| `/api/notifications/acknowledge` | POST | `requireAuth` + ownership | enforce view-before-ack, ack + audit |
| `/api/notifications/demo` | POST | `requireRole(['master','office_manager','fleet_manager'])` | fire a seeded rule to the calling user |

Clients perform **no direct writes** to the notification tables — only these routes and the triggers
write. Clients read via RLS + Realtime.

---

## 12. In-app sound

- Gentle two-note chime synthesized with the **Web Audio API** (no binary asset; fully in-stack).
- Autoplay policy handled by **priming** the `AudioContext` on the first user gesture after login.
- **Mute toggle** persisted in `localStorage` (`elkayam_notif_sound`).
- Sound is an aid only — mandatory criticals still display/block when muted. Never the source of
  truth.

---

## 13. Demo / test events

1. `POST /api/notifications/demo` (managers/master) — fires any seeded rule **to the calling user**,
   so a single person can exercise the entire loop including the blocking modal.
2. A **"שלח התראת בדיקה"** control in the Notification Center, visible to `master`.
3. Real path — create an actual order / work diary / order-problem and watch the notification arrive
   live via Realtime.

---

## 14. Forward-compatibility (nothing throwaway)

- **Admin panel (System B):** UI built directly on `notification_rules` /
  `notification_rule_recipients`; add `notification_admin_audit_log` then. No schema rework.
- **Web Push (Phase 4):** add `push_subscriptions` + `notification_delivery_attempts`; sender reads
  existing `notification_recipients`; `last_push_sent_at` column already present.
- **Reminders / escalation (Phase 6):** the inert columns (`reminder_*`, `escalation_*`,
  `next_reminder_at`, `escalation_level`, `expires_at`) get a cron/worker; no schema change.
- **PWA mandatory setup gate (Phase 5):** a `profiles.notification_setup_complete` flag + a gate
  component; independent of these tables.
- **Recipient groups:** `notification_recipient_groups` + `recipient_type='group'` resolution
  (already a no-op slot in the resolver).

---

## 15. Risks & mitigations

| risk | mitigation |
|---|---|
| plpgsql fan-out correctness | integration/SQL tests; small, reviewable resolver |
| RLS for realtime reads (see nothing / too much) | explicit policy tests; `master`-all + own-rows only |
| refresh while critical pending | provider hydrates pending criticals from DB on load |
| draft-modal vs critical-gate conflict | critical gate wins z-order; documented coexistence |
| autoplay/sound blocked | gesture-priming + graceful no-sound fallback |
| multi-tab double chime | de-dupe by notification id in provider state |
| point-in-time targeting surprises | documented: role changes don't retro-target |
| source-column assumptions in triggers | verified against live schema during implementation |

---

## 16. Phase 1 scope boundary

**In scope:** 5 tables + triggers + RLS; DB-trigger detection for 3 seeded events;
`NotificationProvider` + Realtime; bell + drawer Notification Center (role-filtered, all users);
`CriticalAlertGate` with view-before-ack; Web Audio chime + mute; ack/seen/mark-opened/demo API
routes; 3 seeded rules wired to triggers; demo event generation.

**Explicitly out of scope (future phases):** Web Push / VAPID, service worker, PWA manifest,
mandatory employee setup gate, reminders, escalation worker, admin rules-management UI, recipient
groups, delivery-attempt tracking, admin monitoring dashboard.

---

## 17. Phase 1 acceptance / test plan

1. Run the migration; confirm 5 tables + 3 seeded rules + recipients exist; RLS enabled.
2. As a manager user, open the app — bell renders, drawer opens, empty state correct.
3. `POST /api/notifications/demo` with `field.issue` → critical modal raises, sound plays,
   `[אישור]` is disabled, `[פתח/י את הפריט]` enabled.
4. Click open-item → navigates to `/orders`, banner shows with `[אישור]` enabled; navigate away →
   full modal re-asserts (ack still enabled).
5. Acknowledge → gate clears; `notification_recipients.status='acknowledged'`; one
   `notification_acknowledgements` row written.
6. Attempt to acknowledge a related-entity critical via API with `related_opened_at` null → 400.
7. Create a real `work_orders` row → `order.created` notification arrives live (warning, no block,
   sound) to office/graphics/master, excluding the creator.
8. Create a real `work_diaries` row → `diary.submitted` (info, no sound) to fleet/office/master.
9. RLS: a `viewer` who is not a recipient sees none of the above; `master` sees all.

---

## 18. Audit reconciliation & Phase 1.5 (2026-05-25)

Authoritative business logic + status after the post-Phase-1 audit. Two notification classes:

### 18.1 Class A — Department order-intake (strong, persistent)
`order.created` is a **production/department intake event**, NOT a generic office toast. In the
**final** behavior it must reach the **relevant production departments** by order content:
- **Graphics / גרפיקה** (graphics/print/design/stickers/signage), **Warehouse / מחסן**
  (stock/cones/inventory/safety accessories/picking), **Metal Workshop / מסגרייה**
  (metal fabrication/posts/frames/barriers/workshop).
- The notification **stays pending until a real response**: the relevant user **opens/views the
  order** and then **either (a) acknowledges receipt, or (b) reports a problem with the order**.
- It must **not** behave like a 5-second toast and must **not** silently disappear.

**Implemented now (Phase 1.5):** `order.created` = `requires_ack=true`, view-before-ack,
non-blocking, persistent in the Notification Center; acknowledged from the drawer. Recipients =
`graphics_manager + office_manager + master` (static).
**Still pending (follow-up):** (a) the **"report a problem"** resolution path (§18.4), (b) true
**content-aware department routing** + Warehouse/Metal-Workshop roles (§18.5).

### 18.2 Class B — General informational notifications (light) — IMPLEMENTED
Examples: `diary.submitted`, Telegram intake, `finance.document_new` / `finance.duplicate_suspected`
/ `finance.needs_classification` (added by a parallel session), scanned document, fleet/field
updates. Behavior: small **top-left toast, auto-dismiss ~5s**, RTL, optional gentle ping per rule,
**non-blocking, no acknowledgement**, also visible in the Notification Center. Implemented via a
client-side rule in `NotificationProvider`: a notification gets a transient toast iff
`!blocking && !requires_ack` (severity → info/warning styling). `auto_dismiss_seconds`/`display_mode`
DB fields remain a future enhancement; the current behavior is derived from `blocking`/`requires_ack`.

### 18.3 Sound / mute policy — IMPLEMENTED
Normal employees/users **cannot** mute mandatory notification sounds: the Notification Center
mute control (and test-send) renders **only for `MANAGER_ROLES` = master/office_manager/fleet_manager**.
The sound system itself is unchanged; blocking criticals still display even when muted. Full,
server-side, per-rule mandatory-sound policy is a future **admin "מרכז התראות"** capability.

### 18.4 "Report a problem" resolution — DESIGN (pending approval; needs a prod DB change)
A department user resolves an `order.created` notification by **acknowledge receipt** OR
**report a problem** — these are distinct outcomes. The current `notification_recipients.status`
CHECK (`pending/delivered/seen/acknowledged/escalated/failed/expired`) has no distinct
"problem reported" value. **Smallest safe additive change (not yet applied):**
```sql
-- (proposed) additive, non-destructive: distinguish the resolution outcome
alter table public.notification_recipients
  add column if not exists resolution text;   -- null | 'acknowledged' | 'problem_reported'
```
Flow: `POST /api/notifications/report-problem {recipientId, description}` (service-role + ownership +
view-before-ack): set `status='acknowledged'` (leaves the pending queue) **and** `resolution=
'problem_reported'`, write the immutable `notification_acknowledgements` row, and create the matching
`order_problems` row via the existing mechanism (which fires the `field.issue` critical → escalation
path). UI: a **"דווח על בעיה"** action on order-related notification items, enabled after the item is
opened. Auditability preserved (who/when/related notification/related order). **Apply only after
explicit approval — production DB change.**

### 18.5 Department routing readiness (gap)
Roles today: `graphics_manager` exists; **no** Warehouse or Metal-Workshop role (fabrication/
warehouse are tabs; `procurement_manager` holds the warehouse tab). Order content signals exist as
columns (`fabrication_required`, `warehouse_required`, graphics proxy `graphics_sent_at`/
`status='graphics_pending'`). The recipient model is a **static role list**; there is no creator-uuid
(so `exclude_actor` is inert) and only a **per-notification** blocking flag (no per-recipient mode).
**True department routing is a follow-up phase** — do not hardcode fragile routing; add
Warehouse/Metal-Workshop roles (or a department-membership model) + content-aware recipient
resolution first.

### 18.6 Out of scope here — Phase 2 (future, separate brainstorm→spec→plan)
- **PWA + native Web Push (VAPID, self-hosted — NO Firebase/OneSignal/etc.)**: manifest, service
  worker, per-user/device push subscriptions, push-when-closed, standalone detection.
- **Mandatory employee setup gate**: require department users (graphics/warehouse/workshop) to
  install to home screen + enable notifications + keep an active push subscription, blockable by
  admin policy until complete.
- **Admin "מרכז התראות" management panel**: configure rules/recipients/severity/sound/blocking/
  reminders + audit log; control sound policy and setup enforcement.
- **Escalation / reminders / snooze**; hard-block decision for `order.created`.
None of these are implemented; none may be claimed as done.
