# Phase 2c — PWA + Native Web Push Foundation

**Date:** 2026-05-25
**Status:** approved (foundation scope; auto-send + gate enforcement deferred)
**Builds on:** `2026-05-23-critical-notification-foundation-design.md` (Phases 1–2b)

## Goal

Self-hosted, browser-native Web Push for the critical-notification system using
**VAPID only** — no Firebase / OneSignal / Knock / Novu / Pusher / Ably / SMS / any
external notification SaaS. Push is a **transport hint**, not a system of record.

## Non-negotiable principle (unchanged)

A critical notification is "handled" only when the user opens the app, views the
related item (when required), and acknowledges **inside the app**. The DB is the
source of truth. **OS/browser push dismissal NEVER counts as acknowledgement.** The
service worker only displays the message and, on click, focuses/opens the app at the
related item — it performs no ack, no DB write.

## Architecture

### 1. Database (additive migration `20260525200000_web_push_foundation`)

- **`push_subscriptions`** — one row per device endpoint:
  `id, user_id, endpoint (unique), p256dh, auth, user_agent, enabled bool default true,
  created_at, last_used_at`. Multiple rows per user = multi-device. RLS: a user may
  SELECT/DELETE own rows (+ master read-all); INSERT/UPDATE only via service-role API
  (clients never write push policy directly). Index on `user_id`.
- **Per-rule policy columns on `notification_rules`** (defaults preserve current behavior):
  - `in_app_notification_enabled boolean not null default true`
  - `require_open_before_ack boolean not null default false`
  - `web_push_enabled boolean not null default false`
- **`notification_policy`** — single-row global gate scaffold (id check forces one row):
  - `require_pwa_installation boolean not null default false`
  - `require_push_permission boolean not null default false`
  - `block_work_until_push_setup_complete boolean not null default false`
  - **Stored + admin-editable later. NOT enforced this phase** — pure scaffold so the
    layers exist independently and a future gate phase can switch them on safely.

All additive. Existing events stay byte-identical: `web_push_enabled` defaults `false`,
so no event pushes until an admin flips it; the global gates default `false` and are
read by nothing yet.

### 2. Server

- **`src/lib/notifications/push.ts`** — `sendWebPush(userId, payload)`:
  - Reads VAPID config from env. **Dormant no-op (returns `{sent:0, skipped:'no-vapid'}`)
    when `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` are absent** — the feature stays dark
    until keys are set, so shipping it changes nothing in prod.
  - Loads the user's `enabled` subscriptions, sends via `web-push`, and prunes
    subscriptions on `404`/`410` (gone). Never throws into callers.
- **API routes** (apiAuth-guarded, service-role writes):
  - `POST /api/notifications/push/subscribe` — upsert caller's subscription (by endpoint).
  - `POST /api/notifications/push/unsubscribe` — disable/remove caller's subscription.
  - `POST /api/notifications/push/test` — **master-only**; sends a test push to the
    caller's own devices to verify the pipe end-to-end.
- `src/lib/notifications/client.ts` gains `subscribePush` / `unsubscribePush` / `testPush`.

### 3. Client

- **`public/sw.js`** — plain JS, no build step. Handles `push` (showNotification with
  title/body/url/tag from payload) and `notificationclick` (focus an existing client or
  open the app at the related URL). **No ack, no fetch-to-ack.**
- **`src/lib/notifications/webpush.ts`** — readiness + lifecycle:
  - `pushSupported()`, `permissionState()`, `getReadiness()` → `{supported, permission,
    subscribed}`.
  - `registerServiceWorker()`, `enablePush()` (register SW → `Notification.requestPermission`
    → `pushManager.subscribe` with the `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → POST subscribe),
    `disablePush()` (unsubscribe + POST unsubscribe).
  - **Never auto-prompts.** Permission is only requested from an explicit user action.

### 4. PWA manifest

- **`public/manifest.webmanifest`** (name, short_name, RTL/`he`, `display: standalone`,
  theme/background, icons) linked from `layout.tsx` metadata.
- Existing `elkayam-logo.png` (425×95 wordmark) is referenced as a basic icon; proper
  square **192×192 + 512×512 maskable** icons for full install criteria are a flagged
  manual follow-up (does not block push, which only needs SW + subscription).

### 5. UI

- An opt-in control in the Notification Center ("התראות דפדפן" — enable/disable +
  readiness state). Opt-in only; no forced setup, no auto-prompt.

## VAPID key handling

`web-push` is added as a dependency. A VAPID keypair is generated locally; the values are
handed to the owner to place in env (Vercel + `.env.local`):
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client subscribe)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (server) — **private key never committed**
- `VAPID_SUBJECT` (`mailto:` contact)

Until set, `sendWebPush` is a no-op and the UI shows push as unavailable.

## Deliberately deferred (NOT this phase)

- **Automatic push fan-out on notification-create** — pairs with the escalation/cron
  worker (2e). This phase ships the helper + master test route only; auto-delivery is a
  documented integration point.
- **Enforcement of the three global gates** (`require_pwa_installation`,
  `require_push_permission`, `block_work_until_push_setup_complete`) — stored scaffold only.
- Reminders / snooze / escalation worker.
- Proper square maskable PWA icons.

## Rollback

- Code: revert the commit (push helper is dormant without env, so no runtime effect).
- DB: migration is purely additive (new table + nullable-with-default columns + new
  single-row table). Rollback = `drop table push_subscriptions; drop table
  notification_policy; alter table notification_rules drop column ...` — none of it is
  referenced by existing triggers/resolver, so dropping is safe.

## Testing

- Node 24 `tsc --noEmit` + `npm test` before commit.
- End-to-end push (subscribe → master test → OS banner → click opens item) requires a
  real browser + HTTPS (Vercel) + VAPID env — **manual browser verification**, flagged
  in the completion report.

## Phase 2d — delivered (2026-05-25, follow-on)

Implemented on top of this foundation (no PWA SaaS; VAPID self-hosted):

- **Automatic push fan-out + reminder/escalation/expiry worker** —
  `src/lib/notifications/worker.ts` (idempotent) invoked by `/api/notifications/cron`
  (GET for Vercel Cron, POST manual), guarded by `CRON_SECRET`. `vercel.json` schedules
  `*/5 * * * *`. No DB migration — reuses the Phase-1 columns (`last_push_sent_at`,
  `next_reminder_at`, `escalation_level`, rule `reminder_*`/`escalation_*`/`expires_*`).
  Push is best-effort (no-op without VAPID); reminder/escalation/expiry state still runs.
  Sub-daily cron needs Vercel **Pro**; on Hobby the route is still callable manually.
- **Policy layers now admin-editable (master only)** — per-rule
  `in_app_notification_enabled`/`require_open_before_ack`/`web_push_enabled` in the rules
  table; global gates via `/api/notifications/policy/update` + a new "מדיניות התקנה" admin
  section; all changes audited.
- **Readiness + setup gate** — `isStandalone()` PWA detection; `NotificationSetupGate`
  (default-inert) soft banner / admin-gated hard block (master-exempt, push-permission
  only, never traps).
- **require_open_before_ack wired** in the ack route (live rule flag, default-strict);
  backfill migration `20260525210000` preserves current behavior.
- **Snooze API** `/api/notifications/snooze` (reuses `next_reminder_at`, never acks).
- **PWA icons** — real 192/512 maskable icons generated from branding.

Additional env beyond VAPID: **`CRON_SECRET`** (enables the worker route + Vercel Cron
auth). Without it the worker is dormant (503).
