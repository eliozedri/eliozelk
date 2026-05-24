# Critical Notification & Acknowledgement — Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the database-driven foundation of an internal critical-notification system: DB-trigger detection of 3 operational events, realtime in-app delivery, a role-filtered Notification Center, and a blocking acknowledgement gate that enforces "view the item before you can acknowledge" — with the DB as the single source of truth.

**Architecture:** Postgres `AFTER INSERT/UPDATE` triggers call a `SECURITY DEFINER` resolver that reads seeded `notification_rules`, snapshots behavior onto a `notifications` row, and fans out per-user `notification_recipients` rows. Clients are **read-only** on these tables (Supabase Realtime + RLS); all writes (`seen`/`mark-opened`/`acknowledge`/`demo`) go through service-role API routes guarded by `apiAuth.ts`. A React `NotificationProvider` subscribes to the user's recipient rows; `CriticalAlertGate` blocks navigation until a critical notification is acknowledged.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, TypeScript, Tailwind v4 (RTL), Supabase (Postgres + Realtime + RLS + Auth), Vitest, `lucide-react` icons, Web Audio API.

**Spec:** `docs/superpowers/specs/2026-05-23-critical-notification-foundation-design.md`

---

## File structure (created / modified)

**Created:**
- `src/types/notification.ts` — TS row + view types, enums.
- `src/lib/notifications/state.ts` — pure helpers (merge, href resolver, ack predicates). **TDD.**
- `src/lib/notifications/__tests__/state.test.ts` — unit tests for the helpers.
- `src/lib/notifications/client.ts` — bearer-authed fetch wrappers for the API routes.
- `src/lib/notifications/sound.ts` — Web Audio chime + mute + autoplay priming.
- `supabase/migrations/20260601000000_notification_foundation.sql` — tables, indexes, RLS, realtime, triggers, seeds.
- `scripts/apply-notification-migration.ts` — apply the migration via the Supabase Management API.
- `src/app/api/notifications/seen/route.ts`
- `src/app/api/notifications/mark-opened/route.ts`
- `src/app/api/notifications/acknowledge/route.ts`
- `src/app/api/notifications/demo/route.ts`
- `src/context/NotificationContext.tsx` — provider + `useNotifications()` (realtime, hydrate, actions).
- `src/components/notifications/NotificationBell.tsx` — fixed bell button + badge.
- `src/components/notifications/NotificationCenter.tsx` — slide-over drawer + demo control.
- `src/components/notifications/NotificationItem.tsx` — one row.
- `src/components/notifications/CriticalAlertGate.tsx` — blocking modal / banner state machine.

**Modified:**
- `src/components/AppShell.tsx` — mount `NotificationProvider`, `NotificationBell`, `CriticalAlertGate` in the authenticated branch.

**Naming contract (used across tasks — keep identical):**
- Types: `NotificationSeverity`, `NotificationSourceModule`, `NotificationStatus`, `RelatedEntityType`, `NotificationRow`, `RecipientRow`, `NotificationView`.
- Helpers (in `state.ts`): `toView`, `relatedEntityHref`, `isOpenedSatisfied`, `canAcknowledge`, `pickPendingCritical`, `unseenCount`, `mergeViews`, `serverAckAllowed`.
- SQL: `fn_emit_notification`, `trg_work_orders_notify`, `trg_work_diaries_notify`, `trg_order_problems_notify`.
- API: `/api/notifications/{seen,mark-opened,acknowledge,demo}`.
- localStorage key: `elkayam_notif_sound` (`"on"` | `"off"`).

---

## Task 1: Notification types + pure state helpers (TDD)

**Files:**
- Create: `src/types/notification.ts`
- Create: `src/lib/notifications/state.ts`
- Test: `src/lib/notifications/__tests__/state.test.ts`

- [ ] **Step 1: Create the types file**

Create `src/types/notification.ts`:

```ts
export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationSourceModule =
  | "orders" | "work_logs" | "inventory" | "finance" | "system" | "telegram" | "field";

export type NotificationStatus =
  | "pending" | "delivered" | "seen" | "acknowledged" | "escalated" | "failed" | "expired";

export type RelatedEntityType = "work_order" | "work_diary" | "order_problem";

export interface NotificationRow {
  id: string;
  event_type: string;
  rule_id: string | null;
  title: string;
  message: string;
  severity: NotificationSeverity;
  source_module: NotificationSourceModule;
  related_entity_type: RelatedEntityType | null;
  related_entity_id: string | null;
  created_by: string | null;
  requires_ack: boolean;
  blocking: boolean;
  play_sound: boolean;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RecipientRow {
  id: string;
  notification_id: string;
  user_id: string;
  matched_role: string | null;
  status: NotificationStatus;
  delivered_at: string | null;
  seen_at: string | null;
  related_opened_at: string | null;
  acknowledged_at: string | null;
  ack_was_direct: boolean;
  escalation_level: number;
  last_push_sent_at: string | null;
  next_reminder_at: string | null;
  created_at: string;
}

export interface NotificationView {
  recipientId: string;
  notificationId: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  sourceModule: NotificationSourceModule;
  relatedEntityType: RelatedEntityType | null;
  relatedEntityId: string | null;
  metadata: Record<string, unknown>;
  requiresAck: boolean;
  blocking: boolean;
  playSound: boolean;
  status: NotificationStatus;
  seenAt: string | null;
  relatedOpenedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/notifications/__tests__/state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { NotificationRow, RecipientRow } from "@/types/notification";
import {
  toView, relatedEntityHref, isOpenedSatisfied, canAcknowledge,
  pickPendingCritical, unseenCount, mergeViews, serverAckAllowed,
} from "@/lib/notifications/state";

function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "n1", event_type: "field.issue", rule_id: "r1", title: "t", message: "m",
    severity: "critical", source_module: "field", related_entity_type: "work_order",
    related_entity_id: "o1", created_by: null, requires_ack: true, blocking: true,
    play_sound: true, expires_at: null, metadata: {}, created_at: "2026-06-01T10:00:00Z", ...over,
  };
}
function rec(over: Partial<RecipientRow> = {}): RecipientRow {
  return {
    id: "rc1", notification_id: "n1", user_id: "u1", matched_role: "office_manager",
    status: "pending", delivered_at: null, seen_at: null, related_opened_at: null,
    acknowledged_at: null, ack_was_direct: false, escalation_level: 0,
    last_push_sent_at: null, next_reminder_at: null, created_at: "2026-06-01T10:00:00Z", ...over,
  };
}
describe("relatedEntityHref", () => {
  it("maps known entity types to module routes", () => {
    expect(relatedEntityHref("work_order", "o1")).toBe("/orders");
    expect(relatedEntityHref("order_problem", "p1")).toBe("/orders");
    expect(relatedEntityHref("work_diary", "d1")).toBe("/work-diary");
  });
  it("returns null when there is no related entity", () => {
    expect(relatedEntityHref(null, null)).toBeNull();
  });
});

describe("toView", () => {
  it("merges a recipient row and notification row into a view", () => {
    const v = toView(rec({ status: "seen", related_opened_at: "2026-06-01T11:00:00Z" }), row());
    expect(v.recipientId).toBe("rc1");
    expect(v.notificationId).toBe("n1");
    expect(v.severity).toBe("critical");
    expect(v.requiresAck).toBe(true);
    expect(v.status).toBe("seen");
    expect(v.relatedOpenedAt).toBe("2026-06-01T11:00:00Z");
  });
});

describe("isOpenedSatisfied / canAcknowledge", () => {
  it("requires opening the related item before ack", () => {
    const unopened = toView(rec(), row());
    expect(isOpenedSatisfied(unopened)).toBe(false);
    expect(canAcknowledge(unopened)).toBe(false);
    const opened = toView(rec({ related_opened_at: "2026-06-01T11:00:00Z" }), row());
    expect(isOpenedSatisfied(opened)).toBe(true);
    expect(canAcknowledge(opened)).toBe(true);
  });
  it("allows direct ack when there is no related entity", () => {
    const v = toView(rec(), row({ related_entity_type: null, related_entity_id: null }));
    expect(isOpenedSatisfied(v)).toBe(true);
    expect(canAcknowledge(v)).toBe(true);
  });
  it("cannot ack an already-acknowledged item", () => {
    const v = toView(rec({ status: "acknowledged", related_opened_at: "x" }), row());
    expect(canAcknowledge(v)).toBe(false);
  });
});

describe("pickPendingCritical", () => {
  it("returns the oldest pending blocking+requires_ack view, or null", () => {
    expect(pickPendingCritical([])).toBeNull();
    const a = toView(rec({ id: "a" }), row({ id: "na", created_at: "2026-06-01T10:00:00Z" }));
    const b = toView(rec({ id: "b" }), row({ id: "nb", created_at: "2026-06-01T09:00:00Z" }));
    const ackd = toView(rec({ id: "c", status: "acknowledged" }), row({ id: "nc" }));
    expect(pickPendingCritical([a, b, ackd])?.recipientId).toBe("b");
  });
  it("ignores non-blocking notifications", () => {
    const info = toView(rec(), row({ blocking: false, requires_ack: false, severity: "info" }));
    expect(pickPendingCritical([info])).toBeNull();
  });
});

describe("unseenCount", () => {
  it("counts pending + delivered", () => {
    const a = toView(rec({ id: "a", status: "pending" }), row({ id: "na" }));
    const b = toView(rec({ id: "b", status: "delivered" }), row({ id: "nb" }));
    const c = toView(rec({ id: "c", status: "seen" }), row({ id: "nc" }));
    expect(unseenCount([a, b, c])).toBe(2);
  });
});

describe("mergeViews", () => {
  it("prepends new and replaces existing by recipientId", () => {
    const a = toView(rec({ id: "a" }), row({ id: "na" }));
    const a2 = toView(rec({ id: "a", status: "seen" }), row({ id: "na" }));
    const b = toView(rec({ id: "b" }), row({ id: "nb" }));
    expect(mergeViews([a], b).map(v => v.recipientId)).toEqual(["b", "a"]);
    expect(mergeViews([a], a2).find(v => v.recipientId === "a")?.status).toBe("seen");
  });
});

describe("serverAckAllowed", () => {
  it("blocks ack of a related-entity notification until opened", () => {
    expect(serverAckAllowed("work_order", null)).toBe(false);
    expect(serverAckAllowed("work_order", "2026-06-01T11:00:00Z")).toBe(true);
    expect(serverAckAllowed(null, null)).toBe(true);
  });
});
```

> Note: the `view()` placeholder helper above is intentionally unused — delete it; tests call `toView(...)` directly.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/notifications/__tests__/state.test.ts`
Expected: FAIL — `Cannot find module '@/lib/notifications/state'`.

- [ ] **Step 4: Implement the helpers**

Create `src/lib/notifications/state.ts`:

```ts
import type {
  NotificationRow, RecipientRow, NotificationView, RelatedEntityType,
} from "@/types/notification";

export function toView(rec: RecipientRow, n: NotificationRow): NotificationView {
  return {
    recipientId: rec.id,
    notificationId: n.id,
    title: n.title,
    message: n.message,
    severity: n.severity,
    sourceModule: n.source_module,
    relatedEntityType: n.related_entity_type,
    relatedEntityId: n.related_entity_id,
    metadata: n.metadata ?? {},
    requiresAck: n.requires_ack,
    blocking: n.blocking,
    playSound: n.play_sound,
    status: rec.status,
    seenAt: rec.seen_at,
    relatedOpenedAt: rec.related_opened_at,
    acknowledgedAt: rec.acknowledged_at,
    createdAt: n.created_at,
  };
}

// SINGLE source of the module-route assumption (Phase 1 compromise).
// A later phase upgrades this to deep links (e.g. `/orders?orderId=${id}`)
// without touching any other file.
export function relatedEntityHref(
  type: RelatedEntityType | null,
  _id: string | null,
  _metadata?: Record<string, unknown>,
): string | null {
  if (!type) return null;
  switch (type) {
    case "work_order": return "/orders";
    case "order_problem": return "/orders";
    case "work_diary": return "/work-diary";
    default: return null;
  }
}

// SINGLE predicate for "view-before-ack". A later phase can require the
// *specific* entity to have been viewed; callers must not re-implement this.
export function isOpenedSatisfied(v: NotificationView): boolean {
  if (!v.relatedEntityType) return true;
  return v.relatedOpenedAt != null;
}

export function canAcknowledge(v: NotificationView): boolean {
  if (!v.requiresAck) return false;
  if (v.status === "acknowledged") return false;
  return isOpenedSatisfied(v);
}

export function pickPendingCritical(views: NotificationView[]): NotificationView | null {
  const pending = views.filter(
    v => v.blocking && v.requiresAck && v.status !== "acknowledged" && v.status !== "expired",
  );
  if (pending.length === 0) return null;
  return pending
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

export function unseenCount(views: NotificationView[]): number {
  return views.filter(v => v.status === "pending" || v.status === "delivered").length;
}

export function mergeViews(prev: NotificationView[], incoming: NotificationView): NotificationView[] {
  const idx = prev.findIndex(v => v.recipientId === incoming.recipientId);
  if (idx === -1) return [incoming, ...prev];
  const next = prev.slice();
  next[idx] = incoming;
  return next;
}

// Server-side mirror of isOpenedSatisfied, working on raw values (no view object).
export function serverAckAllowed(
  relatedEntityType: string | null,
  relatedOpenedAt: string | null,
): boolean {
  if (!relatedEntityType) return true;
  return relatedOpenedAt != null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/notifications/__tests__/state.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in the new files.

- [ ] **Step 7: Commit**

```bash
git add src/types/notification.ts src/lib/notifications/state.ts src/lib/notifications/__tests__/state.test.ts
git commit -m "feat(notifications): foundation types + pure state helpers (TDD)"
```

---

## Task 2: DB migration — tables, indexes, RLS, realtime

**Files:**
- Create: `supabase/migrations/20260601000000_notification_foundation.sql`

- [ ] **Step 1: Write the schema portion of the migration**

Create `supabase/migrations/20260601000000_notification_foundation.sql` with this content (the trigger + seed portion is appended in Task 3 — leave the file ready to extend):

```sql
-- Critical Notification & Acknowledgement — Phase 1 foundation.
-- Additive and idempotent. Clients are read-only; all writes happen via
-- SECURITY DEFINER triggers or service-role API routes.

-- ── 1. Tables ──────────────────────────────────────────────────────────
create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  event_type text unique not null,
  enabled boolean not null default true,
  title text not null,
  message text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  source_module text not null default 'system',
  requires_ack boolean not null default false,
  blocking boolean not null default false,
  play_sound boolean not null default false,
  show_in_center boolean not null default true,
  exclude_actor boolean not null default true,
  reminder_enabled boolean not null default false,
  reminder_interval_minutes integer,
  escalation_enabled boolean not null default false,
  escalation_delay_minutes integer,
  escalation_target jsonb,
  expires_after_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_rule_recipients (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.notification_rules(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('role','user','group')),
  recipient_value text not null,
  created_at timestamptz not null default now(),
  unique (rule_id, recipient_type, recipient_value)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  rule_id uuid references public.notification_rules(id) on delete set null,
  title text not null,
  message text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  source_module text not null default 'system',
  related_entity_type text,
  related_entity_id text,
  created_by uuid,
  requires_ack boolean not null default false,
  blocking boolean not null default false,
  play_sound boolean not null default false,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null,
  matched_role text,
  status text not null default 'pending'
    check (status in ('pending','delivered','seen','acknowledged','escalated','failed','expired')),
  delivered_at timestamptz,
  seen_at timestamptz,
  related_opened_at timestamptz,
  acknowledged_at timestamptz,
  ack_was_direct boolean not null default false,
  escalation_level integer not null default 0,
  last_push_sent_at timestamptz,
  next_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, user_id)
);

create table if not exists public.notification_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  recipient_id uuid not null references public.notification_recipients(id) on delete cascade,
  user_id uuid not null,
  acknowledged_at timestamptz not null default now(),
  related_opened_at timestamptz,
  ack_was_direct boolean not null default false,
  device_info jsonb,
  created_at timestamptz not null default now()
);

-- ── 2. Indexes ─────────────────────────────────────────────────────────
create index if not exists idx_notification_recipients_user_status on public.notification_recipients (user_id, status);
create index if not exists idx_notification_recipients_notification on public.notification_recipients (notification_id);
create index if not exists idx_notifications_event_type on public.notifications (event_type);
create index if not exists idx_notifications_created_at on public.notifications (created_at desc);
create index if not exists idx_notification_rule_recipients_rule on public.notification_rule_recipients (rule_id);
create index if not exists idx_notification_acks_user on public.notification_acknowledgements (user_id);

-- ── 3. RLS — clients read only their own; master reads all ──────────────
alter table public.notification_rules enable row level security;
alter table public.notification_rule_recipients enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_acknowledgements enable row level security;

drop policy if exists notif_rules_read on public.notification_rules;
create policy notif_rules_read on public.notification_rules
  for select to authenticated using (true);

drop policy if exists notif_rule_recipients_read on public.notification_rule_recipients;
create policy notif_rule_recipients_read on public.notification_rule_recipients
  for select to authenticated using (true);

drop policy if exists notif_recipients_read_own on public.notification_recipients;
create policy notif_recipients_read_own on public.notification_recipients
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master')
  );

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated
  using (
    exists (
      select 1 from public.notification_recipients nr
      where nr.notification_id = notifications.id and nr.user_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master')
  );

drop policy if exists notif_acks_read_own on public.notification_acknowledgements;
create policy notif_acks_read_own on public.notification_acknowledgements
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master')
  );
-- No INSERT/UPDATE/DELETE policies => default-deny for clients.
-- Triggers (SECURITY DEFINER) and service-role API routes bypass RLS.

-- ── 4. Realtime: deliver recipient-row changes to the targeted user ─────
alter table public.notification_recipients replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.notification_recipients;
exception when duplicate_object then null; end $$;
```

- [ ] **Step 2: Sanity-check the SQL locally (syntax only)**

Run: `grep -c "create table if not exists" supabase/migrations/20260601000000_notification_foundation.sql`
Expected: `5`

- [ ] **Step 3: Commit (schema portion)**

```bash
git add supabase/migrations/20260601000000_notification_foundation.sql
git commit -m "feat(notifications): migration part 1 — tables, indexes, RLS, realtime"
```

---

## Task 3: DB migration — resolver function, triggers, seeds

**Files:**
- Modify: `supabase/migrations/20260601000000_notification_foundation.sql` (append)

> **Verify-first sub-step:** confirm the exact source columns before writing the triggers, so metadata references are real. Run these and note the column names:
> - `SELECT column_name FROM information_schema.columns WHERE table_name='work_orders' AND column_name IN ('status','order_number');`
> - `SELECT column_name FROM information_schema.columns WHERE table_name='work_diaries' AND column_name IN ('status','number','diary_number');`
> - `SELECT column_name FROM information_schema.columns WHERE table_name='order_problems' AND column_name IN ('order_id','category','description','status');`
>
> Use the Supabase MCP `execute_sql` tool (project `gtevmcnasvrahzfdqrqk`) for these reads. If `order_number` / diary number column differs, adjust the `jsonb_build_object(...)` keys below accordingly. If a referenced column does NOT exist, drop it from the metadata object (metadata is non-essential; triggers must not reference non-existent columns).

- [ ] **Step 1: Append the resolver function**

Append to `supabase/migrations/20260601000000_notification_foundation.sql`:

```sql
-- ── 5. Resolver: snapshot rule onto a notification, fan out recipients ──
create or replace function public.fn_emit_notification(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_created_by uuid,
  p_metadata jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.notification_rules%rowtype;
  v_notification_id uuid;
begin
  select * into v_rule from public.notification_rules
  where event_type = p_event_type and enabled = true;
  if not found then
    return;
  end if;

  insert into public.notifications (
    event_type, rule_id, title, message, severity, source_module,
    related_entity_type, related_entity_id, created_by,
    requires_ack, blocking, play_sound, expires_at, metadata
  ) values (
    v_rule.event_type, v_rule.id, v_rule.title, v_rule.message, v_rule.severity, v_rule.source_module,
    p_entity_type, p_entity_id, p_created_by,
    v_rule.requires_ack, v_rule.blocking, v_rule.play_sound,
    case when v_rule.expires_after_minutes is not null
         then now() + make_interval(mins => v_rule.expires_after_minutes) else null end,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_notification_id;

  -- role-targeted
  insert into public.notification_recipients (notification_id, user_id, matched_role, status)
  select v_notification_id, p.id, p.role, 'pending'
  from public.profiles p
  join public.notification_rule_recipients r
    on r.rule_id = v_rule.id and r.recipient_type = 'role' and r.recipient_value = p.role
  where coalesce(p.is_active, true) = true
    and (v_rule.exclude_actor = false or p_created_by is null or p.id <> p_created_by)
  on conflict (notification_id, user_id) do nothing;

  -- explicit user-targeted
  insert into public.notification_recipients (notification_id, user_id, matched_role, status)
  select v_notification_id, p.id, p.role, 'pending'
  from public.profiles p
  join public.notification_rule_recipients r
    on r.rule_id = v_rule.id and r.recipient_type = 'user' and r.recipient_value = p.id::text
  where coalesce(p.is_active, true) = true
    and (v_rule.exclude_actor = false or p_created_by is null or p.id <> p_created_by)
  on conflict (notification_id, user_id) do nothing;

  -- master always receives (so master sees everything in their own center)
  insert into public.notification_recipients (notification_id, user_id, matched_role, status)
  select v_notification_id, p.id, p.role, 'pending'
  from public.profiles p
  where p.role = 'master' and coalesce(p.is_active, true) = true
  on conflict (notification_id, user_id) do nothing;
end;
$$;
```

- [ ] **Step 2: Append the three event triggers**

Append (adjust `jsonb_build_object` keys per the verify-first step):

```sql
-- ── 6. Event triggers ──────────────────────────────────────────────────
-- order.created: fire when an order first becomes non-draft (insert OR draft->live).
create or replace function public.trg_work_orders_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and coalesce(new.status,'') <> 'draft')
     or (tg_op = 'UPDATE' and coalesce(old.status,'') = 'draft' and coalesce(new.status,'') <> 'draft') then
    perform public.fn_emit_notification(
      'order.created', 'work_order', new.id::text, null,
      jsonb_build_object('order_number', new.order_number, 'status', new.status)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists work_orders_notify on public.work_orders;
create trigger work_orders_notify
  after insert or update on public.work_orders
  for each row execute function public.trg_work_orders_notify();

-- diary.submitted: fire when status transitions into 'submitted' (NOT on draft insert).
create or replace function public.trg_work_diaries_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(old.status,'') is distinct from 'submitted'
     and coalesce(new.status,'') = 'submitted' then
    perform public.fn_emit_notification(
      'diary.submitted', 'work_diary', new.id::text, null,
      jsonb_build_object('status', new.status)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists work_diaries_notify on public.work_diaries;
create trigger work_diaries_notify
  after update on public.work_diaries
  for each row execute function public.trg_work_diaries_notify();

-- field.issue: every order_problem insert is a genuine field issue.
create or replace function public.trg_order_problems_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_emit_notification(
    'field.issue', 'order_problem', new.id::text, null,
    jsonb_build_object('order_id', new.order_id, 'category', new.category, 'description', new.description)
  );
  return new;
end;
$$;
drop trigger if exists order_problems_notify on public.order_problems;
create trigger order_problems_notify
  after insert on public.order_problems
  for each row execute function public.trg_order_problems_notify();
```

- [ ] **Step 3: Append the seeds**

Append:

```sql
-- ── 7. Seed the 3 Phase-1 rules + recipients ────────────────────────────
insert into public.notification_rules
  (event_type, enabled, title, message, severity, source_module, requires_ack, blocking, play_sound, show_in_center, exclude_actor)
values
  ('order.created',   true, 'הזמנה חדשה נוצרה',   'נוצרה הזמנה חדשה במערכת',          'warning',  'orders',    false, false, true,  true, true),
  ('diary.submitted', true, 'יומן עבודה הוגש',     'עובד שטח הגיש יומן עבודה',          'info',     'work_logs', false, false, false, true, true),
  ('field.issue',     true, 'בעיה דווחה בשטח',     'דווחה בעיה הדורשת טיפול ואישור',     'critical', 'field',     true,  true,  true,  true, true)
on conflict (event_type) do nothing;

-- recipients (master is auto-added by the resolver, so it is not listed here)
insert into public.notification_rule_recipients (rule_id, recipient_type, recipient_value)
select r.id, 'role', v.role
from public.notification_rules r
join (values
  ('order.created','office_manager'), ('order.created','graphics_manager'),
  ('diary.submitted','fleet_manager'), ('diary.submitted','office_manager'),
  ('field.issue','office_manager'), ('field.issue','fleet_manager')
) as v(event_type, role) on v.event_type = r.event_type
on conflict (rule_id, recipient_type, recipient_value) do nothing;
```

- [ ] **Step 4: Commit (triggers + seeds)**

```bash
git add supabase/migrations/20260601000000_notification_foundation.sql
git commit -m "feat(notifications): migration part 2 — resolver, event triggers, seeded rules"
```

---

## Task 4: Apply the migration + verify in the database

**Files:**
- Create: `scripts/apply-notification-migration.ts`

- [ ] **Step 1: Write the apply script**

Create `scripts/apply-notification-migration.ts` (mirrors `scripts/apply-migration-phase34.ts`):

```ts
/**
 * Apply the notification foundation migration via the Supabase Management API.
 * Usage: SUPABASE_PAT=<pat> node_modules/.bin/tsx scripts/apply-notification-migration.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = "gtevmcnasvrahzfdqrqk";

if (!PAT) {
  console.error("Set SUPABASE_PAT=<your-personal-access-token>");
  process.exit(1);
}

const sql = readFileSync(
  join(import.meta.dirname, "../supabase/migrations/20260601000000_notification_foundation.sql"),
  "utf-8",
);

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (!res.ok) { console.error("Migration failed:", body); process.exit(1); }
console.log("Migration applied successfully.");
console.log(body);
```

- [ ] **Step 2: Apply the migration**

Preferred: use the Supabase MCP `apply_migration` tool (name `notification_foundation`, project `gtevmcnasvrahzfdqrqk`) with the file contents.
Fallback: `SUPABASE_PAT=<pat> node_modules/.bin/tsx scripts/apply-notification-migration.ts`
Expected: "Migration applied successfully."

- [ ] **Step 3: Verify tables, seeds, RLS via execute_sql**

Run (MCP `execute_sql`, project `gtevmcnasvrahzfdqrqk`):

```sql
select count(*) as rule_count from public.notification_rules;          -- expect 3
select event_type, severity, requires_ack, blocking from public.notification_rules order by event_type;
select r.event_type, rr.recipient_type, rr.recipient_value
  from public.notification_rule_recipients rr
  join public.notification_rules r on r.id = rr.rule_id
  order by r.event_type, rr.recipient_value;                            -- expect 6 rows
select tablename, rowsecurity from pg_tables
  where schemaname='public' and tablename like 'notification%';         -- rowsecurity = true for all
select 1 from pg_publication_tables
  where pubname='supabase_realtime' and tablename='notification_recipients'; -- expect 1 row
```

- [ ] **Step 4: Smoke-test the resolver (then clean up)**

Run (MCP `execute_sql`):

```sql
-- Fire a demo field.issue directly through the resolver.
select public.fn_emit_notification('field.issue','order_problem','SMOKE-1', null,
  '{"note":"smoke"}'::jsonb);
-- Expect: 1 notification + N recipient rows (one per active office_manager/fleet_manager/master).
select n.event_type, n.severity, n.blocking, count(nr.*) as recipients
  from public.notifications n
  left join public.notification_recipients nr on nr.notification_id = n.id
  where n.related_entity_id = 'SMOKE-1'
  group by n.id, n.event_type, n.severity, n.blocking;
-- Clean up the smoke data:
delete from public.notifications where related_entity_id = 'SMOKE-1';
```

Expected: one row, `event_type=field.issue`, `blocking=true`, `recipients >= 1`. (If `recipients = 0`, there are no active users with those roles — seed/assign at least one, e.g. a `master`, before runtime testing.)

- [ ] **Step 5: Commit**

```bash
git add scripts/apply-notification-migration.ts
git commit -m "chore(notifications): migration apply script + DB verification"
```

---

## Task 5: API routes — acknowledge, seen, mark-opened

**Files:**
- Create: `src/app/api/notifications/acknowledge/route.ts`
- Create: `src/app/api/notifications/seen/route.ts`
- Create: `src/app/api/notifications/mark-opened/route.ts`

> All three mirror `src/app/api/supplier-documents/route.ts`: `requireAuth` → `getServiceSupabase()` → ownership check → write. `serverAckAllowed` (Task 1) is already unit-tested.

- [ ] **Step 1: Implement the acknowledge route**

Create `src/app/api/notifications/acknowledge/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";
import { serverAckAllowed } from "@/lib/notifications/state";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { recipientId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const recipientId = body.recipientId;
  if (!recipientId) return NextResponse.json({ error: "recipientId required" }, { status: 400 });

  const db = getServiceSupabase();
  const { data: rec, error } = await db
    .from("notification_recipients")
    .select("id, user_id, related_opened_at, status, notification_id, notifications(related_entity_type)")
    .eq("id", recipientId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isMaster = auth.user.profile.role === "master";
  if (rec.user_id !== auth.user.id && !isMaster) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const related = rec as unknown as {
    related_opened_at: string | null;
    status: string;
    notification_id: string;
    user_id: string;
    notifications: { related_entity_type: string | null } | null;
  };
  const relatedType = related.notifications?.related_entity_type ?? null;
  const relatedOpenedAt = related.related_opened_at ?? null;

  if (!serverAckAllowed(relatedType, relatedOpenedAt)) {
    return NextResponse.json({ error: "must_open_item_first" }, { status: 400 });
  }
  if (related.status === "acknowledged") return NextResponse.json({ ok: true, already: true });

  const now = new Date().toISOString();
  const ackDirect = relatedType == null;

  const { error: upErr } = await db
    .from("notification_recipients")
    .update({ status: "acknowledged", acknowledged_at: now, ack_was_direct: ackDirect })
    .eq("id", recipientId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await db.from("notification_acknowledgements").insert({
    notification_id: related.notification_id,
    recipient_id: recipientId,
    user_id: related.user_id,
    acknowledged_at: now,
    related_opened_at: relatedOpenedAt,
    ack_was_direct: ackDirect,
    device_info: { ua: req.headers.get("user-agent") ?? null },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Implement the mark-opened route**

Create `src/app/api/notifications/mark-opened/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { recipientId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!body.recipientId) return NextResponse.json({ error: "recipientId required" }, { status: 400 });

  const db = getServiceSupabase();
  const { data: rec, error } = await db
    .from("notification_recipients")
    .select("id, user_id, related_opened_at")
    .eq("id", body.recipientId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isMaster = auth.user.profile.role === "master";
  if (rec.user_id !== auth.user.id && !isMaster) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!rec.related_opened_at) {
    const { error: upErr } = await db
      .from("notification_recipients")
      .update({ related_opened_at: new Date().toISOString() })
      .eq("id", body.recipientId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Implement the seen route**

Create `src/app/api/notifications/seen/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { recipientIds?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const ids = Array.isArray(body.recipientIds) ? body.recipientIds.filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  const db = getServiceSupabase();
  // Only mark the caller's own rows, and only those not yet seen/acknowledged.
  const { data, error } = await db
    .from("notification_recipients")
    .update({ status: "seen", seen_at: new Date().toISOString() })
    .in("id", ids)
    .eq("user_id", auth.user.id)
    .in("status", ["pending", "delivered"])
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notifications/acknowledge/route.ts src/app/api/notifications/mark-opened/route.ts src/app/api/notifications/seen/route.ts
git commit -m "feat(notifications): acknowledge/seen/mark-opened API routes (service-role + view-before-ack)"
```

---

## Task 6: API route — demo / test notification

**Files:**
- Create: `src/app/api/notifications/demo/route.ts`

- [ ] **Step 1: Implement the demo route**

Create `src/app/api/notifications/demo/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/apiAuth";

const ALLOWED_EVENTS = ["order.created", "diary.submitted", "field.issue"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["master", "office_manager", "fleet_manager"]);
  if (!auth.ok) return auth.response;

  let body: { eventType?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const eventType = body.eventType ?? "field.issue";
  if (!ALLOWED_EVENTS.includes(eventType as (typeof ALLOWED_EVENTS)[number])) {
    return NextResponse.json({ error: "unknown eventType" }, { status: 400 });
  }

  const db = getServiceSupabase();
  const { data: rule, error: ruleErr } = await db
    .from("notification_rules").select("*").eq("event_type", eventType).eq("enabled", true).maybeSingle();
  if (ruleErr) return NextResponse.json({ error: ruleErr.message }, { status: 500 });
  if (!rule) return NextResponse.json({ error: "rule not found/disabled" }, { status: 404 });

  // A blocking rule needs a related entity so view-before-ack can be exercised.
  const withEntity = rule.blocking === true;

  const { data: notif, error: insErr } = await db
    .from("notifications")
    .insert({
      event_type: rule.event_type,
      rule_id: rule.id,
      title: `${rule.title} (בדיקה)`,
      message: rule.message,
      severity: rule.severity,
      source_module: rule.source_module,
      related_entity_type: withEntity ? "work_order" : null,
      related_entity_id: withEntity ? "DEMO" : null,
      requires_ack: rule.requires_ack,
      blocking: rule.blocking,
      play_sound: rule.play_sound,
      metadata: { demo: true },
    })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const { error: recErr } = await db.from("notification_recipients").insert({
    notification_id: notif.id,
    user_id: auth.user.id,
    matched_role: auth.user.profile.role,
    status: "pending",
  });
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, notificationId: notif.id });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors), then:

```bash
git add src/app/api/notifications/demo/route.ts
git commit -m "feat(notifications): demo/test notification route (managers + master only)"
```

---

## Task 7: Client lib — fetch wrappers + Web Audio sound

**Files:**
- Create: `src/lib/notifications/client.ts`
- Create: `src/lib/notifications/sound.ts`

- [ ] **Step 1: Implement the fetch wrappers**

Create `src/lib/notifications/client.ts` (bearer pattern mirrors `src/hooks/useAgentChat.ts`):

```ts
import { getSupabase } from "@/lib/supabase/client";

async function getBearerToken(): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session?.access_token ?? null;
}

async function post(path: string, payload: unknown): Promise<boolean> {
  const token = await getBearerToken();
  if (!token) return false;
  const res = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[notifications] ${path} failed:`, res.status, text);
    return false;
  }
  return true;
}

export const notificationsApi = {
  seen: (recipientIds: string[]) => post("/api/notifications/seen", { recipientIds }),
  markOpened: (recipientId: string) => post("/api/notifications/mark-opened", { recipientId }),
  acknowledge: (recipientId: string) => post("/api/notifications/acknowledge", { recipientId }),
  demo: (eventType: string) => post("/api/notifications/demo", { eventType }),
};
```

- [ ] **Step 2: Implement the sound module**

Create `src/lib/notifications/sound.ts`:

```ts
const MUTE_KEY = "elkayam_notif_sound"; // "on" | "off"
let ctx: AudioContext | null = null;

type AudioCtor = typeof AudioContext;
function getCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ?? null;
}

// Call from a user gesture so the AudioContext is allowed to start.
export function primeAudio(): void {
  if (ctx) { if (ctx.state === "suspended") void ctx.resume(); return; }
  const Ctor = getCtor();
  if (!Ctor) return;
  try { ctx = new Ctor(); if (ctx.state === "suspended") void ctx.resume(); } catch { ctx = null; }
}

export function isMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "off";
}

export function setMuted(muted: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MUTE_KEY, muted ? "off" : "on");
}

// Gentle two-note chime (A5 -> D6). No-op when muted or audio unavailable.
export function playChime(): void {
  if (isMuted()) return;
  if (!ctx) { primeAudio(); }
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes: Array<[number, number]> = [[880, 0], [1175, 0.18]];
  for (const [freq, delay] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.linearRampToValueAtTime(0.12, t + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.4);
  }
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors), then:

```bash
git add src/lib/notifications/client.ts src/lib/notifications/sound.ts
git commit -m "feat(notifications): client API wrappers + Web Audio chime"
```

---

## Task 7.5 (BLOCKER before Task 8): reconcile `order.created` rule with production-intake business logic

> Added 2026-05-24 per owner clarification. See spec §6.1 / §6.2. Do this **before** Task 8 — the
> Provider/Center/Gate behavior depends on the rule's real severity/ack/blocking + recipient routing.

The applied seed has `order.created` = `warning / requires_ack=false / blocking=false` targeting
`office_manager, graphics_manager, master`. The business logic now says `order.created` is a
**production-intake event**: strong, requires receipt-acknowledgement, view-before-ack, pending until
acknowledged, and **routed to the relevant production departments** (Graphics / Metal Workshop /
Warehouse — content-aware) plus managers/master.

This is a **design + migration** step (not a client hand-edit), and it is **not yet specced in
implementation detail** — when reached, brainstorm/plan it because it involves real decisions:
- Follow-up migration to set `order.created` `requires_ack=true`, `blocking=true` (or persistent).
- **Content-aware recipient routing** (which departments an order touches) — current model is a
  static role list; the order row carries `needsGraphics`/sign content, `fabricationRequired`,
  `warehouseRequired`. Decide: richer trigger emit, rules-engine resolver, or department-tagged metadata.
- **Role-model gap:** no dedicated Metal-Workshop/Warehouse manager role exists today
  (`graphics_manager` does). Map the 3 departments → real recipients (roles/users/groups).
- Likely new per-rule fields (future): `display_mode`, `require_open_before_ack`, `auto_dismiss_seconds`,
  `snooze_enabled`, `web_push_*` — admin-configurable later, not hardcoded.

Keep `diary.submitted` light (`toast_5s`, no required ack). Do NOT fold this into Task 7.

## Task 8: NotificationProvider (realtime + hydrate + actions)

**Files:**
- Create: `src/context/NotificationContext.tsx`

> Realtime pattern mirrors `src/hooks/useOrders.ts` lines 290-366. Auth comes from `useAuth()` (`src/context/AuthContext.tsx`). Realtime payload is a `RecipientRow`; fetch the joined `NotificationRow` once and cache.

- [ ] **Step 1: Implement the provider**

Create `src/context/NotificationContext.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { NotificationRow, RecipientRow, NotificationView } from "@/types/notification";
import { toView, mergeViews, unseenCount, pickPendingCritical } from "@/lib/notifications/state";
import { notificationsApi } from "@/lib/notifications/client";
import { playChime, primeAudio } from "@/lib/notifications/sound";

interface NotificationContextValue {
  views: NotificationView[];
  unseen: number;
  pendingCritical: NotificationView | null;
  markSeen: (recipientIds: string[]) => Promise<void>;
  markOpened: (recipientId: string) => Promise<void>;
  acknowledge: (recipientId: string) => Promise<boolean>;
  sendDemo: (eventType: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  views: [], unseen: 0, pendingCritical: null,
  markSeen: async () => {}, markOpened: async () => {},
  acknowledge: async () => false, sendDemo: async () => {},
});

const notifCache = new Map<string, NotificationRow>();

async function fetchNotification(id: string): Promise<NotificationRow | null> {
  if (notifCache.has(id)) return notifCache.get(id)!;
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.from("notifications").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as NotificationRow;
  notifCache.set(id, row);
  return row;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [views, setViews] = useState<NotificationView[]>([]);
  const viewsRef = useRef<NotificationView[]>([]);
  useEffect(() => { viewsRef.current = views; }, [views]);

  const upsertFromRecipient = useCallback(async (rec: RecipientRow, withSound: boolean) => {
    const n = await fetchNotification(rec.notification_id);
    if (!n) return;
    const v = toView(rec, n);
    setViews(prev => mergeViews(prev, v));
    if (withSound && v.playSound && (v.status === "pending" || v.status === "delivered")) {
      playChime();
    }
  }, []);

  // Initial hydrate (most recent 100 of the user's recipient rows).
  const hydrate = useCallback(async () => {
    const db = getSupabase();
    if (!db || !profile) return;
    const { data } = await db
      .from("notification_recipients")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!data) return;
    const recs = data as RecipientRow[];
    const built: NotificationView[] = [];
    for (const rec of recs) {
      const n = await fetchNotification(rec.notification_id);
      if (n) built.push(toView(rec, n));
    }
    setViews(built);
  }, [profile]);

  useEffect(() => {
    const db = getSupabase();
    if (!db || !profile) return;

    hydrate();

    const channel = db
      .channel("notification_recipients_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_recipients", filter: `user_id=eq.${profile.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            void upsertFromRecipient(payload.new as RecipientRow, true);
          } else if (payload.eventType === "UPDATE") {
            void upsertFromRecipient(payload.new as RecipientRow, false);
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) setViews(prev => prev.filter(v => v.recipientId !== id));
          }
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") console.log("[notifications] realtime connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          console.warn("[notifications] realtime issue:", status, err?.message ?? "");
      });

    // Prime audio on the first user gesture so the chime is allowed to play.
    const prime = () => { primeAudio(); window.removeEventListener("pointerdown", prime); };
    window.addEventListener("pointerdown", prime);

    const onVisible = () => { if (document.visibilityState === "visible") hydrate(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      db.removeChannel(channel);
      window.removeEventListener("pointerdown", prime);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [profile, hydrate, upsertFromRecipient]);

  const markSeen = useCallback(async (recipientIds: string[]) => {
    if (recipientIds.length === 0) return;
    setViews(prev => prev.map(v =>
      recipientIds.includes(v.recipientId) && (v.status === "pending" || v.status === "delivered")
        ? { ...v, status: "seen", seenAt: new Date().toISOString() } : v));
    await notificationsApi.seen(recipientIds);
  }, []);

  const markOpened = useCallback(async (recipientId: string) => {
    setViews(prev => prev.map(v =>
      v.recipientId === recipientId && !v.relatedOpenedAt
        ? { ...v, relatedOpenedAt: new Date().toISOString() } : v));
    await notificationsApi.markOpened(recipientId);
  }, []);

  const acknowledge = useCallback(async (recipientId: string) => {
    const ok = await notificationsApi.acknowledge(recipientId);
    if (ok) {
      setViews(prev => prev.map(v =>
        v.recipientId === recipientId
          ? { ...v, status: "acknowledged", acknowledgedAt: new Date().toISOString() } : v));
    }
    return ok;
  }, []);

  const sendDemo = useCallback(async (eventType: string) => {
    await notificationsApi.demo(eventType);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        views,
        unseen: unseenCount(views),
        pendingCritical: pickPendingCritical(views),
        markSeen, markOpened, acknowledge, sendDemo,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors), then:

```bash
git add src/context/NotificationContext.tsx
git commit -m "feat(notifications): NotificationProvider with realtime delivery + optimistic actions"
```

---

## Task 9: Notification Center UI (bell + drawer + item)

**Files:**
- Create: `src/components/notifications/NotificationItem.tsx`
- Create: `src/components/notifications/NotificationCenter.tsx`
- Create: `src/components/notifications/NotificationBell.tsx`

- [ ] **Step 1: Implement the item row**

Create `src/components/notifications/NotificationItem.tsx`:

```tsx
"use client";

import type { NotificationView } from "@/types/notification";

const SEVERITY_STYLES: Record<NotificationView["severity"], { dot: string; label: string }> = {
  critical: { dot: "bg-red-500", label: "קריטי" },
  warning: { dot: "bg-amber-500", label: "אזהרה" },
  info: { dot: "bg-sky-500", label: "מידע" },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "ממתין", delivered: "ממתין", seen: "נצפה",
  acknowledged: "אושר", escalated: "הוסלם", failed: "נכשל", expired: "פג תוקף",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "עכשיו";
  if (m < 60) return `לפני ${m} ד׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} ש׳`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

export function NotificationItem({ view, onClick }: { view: NotificationView; onClick: () => void }) {
  const sev = SEVERITY_STYLES[view.severity];
  const isUnseen = view.status === "pending" || view.status === "delivered";
  return (
    <button
      onClick={onClick}
      className={`w-full text-right rounded-xl border p-3 transition-colors ${
        isUnseen ? "bg-sky-50 border-sky-200" : "bg-white border-gray-200"
      } hover:bg-gray-50`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${sev.dot}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-navy-900 text-sm truncate">{view.title}</span>
            <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(view.createdAt)}</span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{view.message}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{view.sourceModule}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              {STATUS_LABEL[view.status] ?? view.status}
            </span>
            {view.requiresAck && view.status !== "acknowledged" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">דורש אישור</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Implement the drawer (Notification Center)**

Create `src/components/notifications/NotificationCenter.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { relatedEntityHref } from "@/lib/notifications/state";
import { isMuted, setMuted } from "@/lib/notifications/sound";
import { NotificationItem } from "./NotificationItem";
import type { NotificationView } from "@/types/notification";

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { profile } = useAuth();
  const { views, markSeen, markOpened, sendDemo } = useNotifications();

  // Mark unseen as seen when the drawer opens.
  useEffect(() => {
    if (!open) return;
    const unseen = views.filter(v => v.status === "pending" || v.status === "delivered").map(v => v.recipientId);
    if (unseen.length > 0) void markSeen(unseen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const pending = views.filter(v => v.requiresAck && v.status !== "acknowledged");
  const fresh = views.filter(v => !(v.requiresAck && v.status !== "acknowledged") && (v.status === "pending" || v.status === "delivered" || v.status === "seen"));
  const history = views.filter(v => v.status === "acknowledged" || v.status === "expired");

  const onItem = (v: NotificationView) => {
    const href = relatedEntityHref(v.relatedEntityType, v.relatedEntityId, v.metadata);
    if (href) { void markOpened(v.recipientId); router.push(href); onClose(); }
  };

  const Section = ({ title, items }: { title: string; items: NotificationView[] }) =>
    items.length === 0 ? null : (
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-gray-500 px-1">{title}</h3>
        {items.map(v => <NotificationItem key={v.recipientId} view={v} onClick={() => onItem(v)} />)}
      </div>
    );

  const canDemo = profile && ["master", "office_manager", "fleet_manager"].includes(profile.role);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <aside className="fixed inset-y-0 left-0 z-[61] w-full max-w-sm bg-surface shadow-2xl flex flex-col" dir="rtl">
        <header className="flex items-center justify-between px-4 py-3 border-b bg-white">
          <h2 className="font-bold text-navy-900">מרכז התראות</h2>
          <button onClick={onClose} aria-label="סגור" className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {views.length === 0 && <p className="text-sm text-gray-400 text-center mt-10">אין התראות</p>}
          <Section title="קריטי וממתין לאישור" items={pending} />
          <Section title="חדש" items={fresh} />
          <Section title="נקרא" items={history} />
        </div>

        <footer className="border-t bg-white px-4 py-2 flex items-center justify-between">
          <button
            onClick={() => { setMuted(!isMuted()); }}
            className="text-xs text-gray-600 hover:text-navy-900"
          >
            {isMuted() ? "🔕 צליל כבוי" : "🔔 צליל פעיל"}
          </button>
          {canDemo && (
            <button
              onClick={() => void sendDemo("field.issue")}
              className="text-xs font-semibold text-ek-blue hover:underline"
            >
              שלח התראת בדיקה
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}
```

> The mute button uses `isMuted()` at render; because `setMuted` writes localStorage without state, toggle re-render is driven by the parent re-render on next open. If you want immediate label flip, lift a `muted` `useState` initialized from `isMuted()`; not required for Phase 1.

- [ ] **Step 3: Implement the bell**

Create `src/components/notifications/NotificationBell.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import { NotificationCenter } from "./NotificationCenter";

export function NotificationBell() {
  const { unseen } = useNotifications();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="התראות"
        className="fixed top-3 left-3 z-30 flex items-center justify-center w-10 h-10 rounded-xl shadow-md bg-white border border-gray-200 no-print"
      >
        <Bell className="w-5 h-5 text-navy-900" />
        {unseen > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </button>
      <NotificationCenter open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors), then:

```bash
git add src/components/notifications/
git commit -m "feat(notifications): Notification Center UI — bell, drawer, item rows"
```

---

## Task 10: CriticalAlertGate (blocking modal / banner)

**Files:**
- Create: `src/components/notifications/CriticalAlertGate.tsx`

> Implements the spec §9 state machine using `pendingCritical`, `relatedEntityHref`, `canAcknowledge`, `isOpenedSatisfied`, and `usePathname()`. One critical at a time (Phase 1).

- [ ] **Step 1: Implement the gate**

Create `src/components/notifications/CriticalAlertGate.tsx`:

```tsx
"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import { relatedEntityHref, isOpenedSatisfied, canAcknowledge } from "@/lib/notifications/state";

export function CriticalAlertGate() {
  const { pendingCritical, markOpened, acknowledge } = useNotifications();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!pendingCritical) return null;
  const v = pendingCritical;

  const href = relatedEntityHref(v.relatedEntityType, v.relatedEntityId, v.metadata);
  const onEntityRoute = href != null && pathname === href;
  const opened = isOpenedSatisfied(v);
  const ackEnabled = canAcknowledge(v) && !busy;

  const handleOpen = async () => {
    if (!href) return;
    await markOpened(v.recipientId);
    router.push(href);
  };
  const handleAck = async () => {
    setBusy(true);
    const ok = await acknowledge(v.recipientId);
    setBusy(false);
    if (!ok) {
      // Server rejected (e.g. item not opened yet). The gate stays up so the
      // user must open the item first; no extra UI needed in Phase 1.
      console.warn("[notifications] acknowledge rejected for", v.recipientId);
    }
  };

  // VIEWED + on the entity route -> non-dismissable banner so the user can work.
  if (opened && onEntityRoute) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-[80] bg-red-600 text-white px-4 py-3 flex items-center justify-between gap-3 no-print" dir="rtl">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold truncate">{v.title} — אשר/י לאחר צפייה בפריט</span>
        </div>
        <button
          onClick={handleAck}
          disabled={!ackEnabled}
          className="px-4 py-1.5 rounded-lg bg-white text-red-700 text-sm font-bold disabled:opacity-60"
        >
          אישור
        </button>
      </div>
    );
  }

  // Otherwise -> full-screen blocking modal.
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4 no-print" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-navy-900">{v.title}</h2>
        <p className="text-sm text-gray-600 mt-2">{v.message}</p>
        {!opened && href && (
          <p className="text-xs text-red-600 mt-3 font-semibold">צפה/י בפריט לפני אישור</p>
        )}
        <div className="flex gap-2 mt-6">
          {href && (
            <button
              onClick={handleOpen}
              className="flex-1 px-4 py-2.5 rounded-xl bg-ek-blue text-white text-sm font-bold"
            >
              פתח/י את הפריט
            </button>
          )}
          <button
            onClick={handleAck}
            disabled={!ackEnabled}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
          >
            אישור
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors), then:

```bash
git add src/components/notifications/CriticalAlertGate.tsx
git commit -m "feat(notifications): CriticalAlertGate blocking modal + banner with view-before-ack"
```

---

## Task 11: Wire provider + bell + gate into the app shell

**Files:**
- Modify: `src/components/AppShell.tsx`

> `AppShell` (lines 101-121) wraps the authenticated app in `AuthProvider` → `NavigationGuardProvider` → `AppShellInner`. Mount `NotificationProvider` between `AuthProvider` and `NavigationGuardProvider`, and render `NotificationBell` + `CriticalAlertGate` inside `AppShellInner`.

- [ ] **Step 1: Add imports**

In `src/components/AppShell.tsx`, add near the existing imports (after the `AuthProvider` import on line 7):

```tsx
import { NotificationProvider } from "@/context/NotificationContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CriticalAlertGate } from "@/components/notifications/CriticalAlertGate";
```

- [ ] **Step 2: Render bell + gate inside `AppShellInner`**

In `AppShellInner`'s returned JSX, inside `<GlobalFloatingChatProvider>` and right after the `<OfflineBanner />`/hamburger area (before the `<div className="flex min-h-screen">` on line 68), add:

```tsx
        <NotificationBell />
```

And just before the closing `</GlobalFloatingChatProvider>` (after the draft-protection modal block, line ~95), add:

```tsx
        <CriticalAlertGate />
```

- [ ] **Step 3: Wrap the authenticated branch with `NotificationProvider`**

Replace the authenticated `return` block (lines 114-120) with:

```tsx
  return (
    <AuthProvider>
      <NotificationProvider>
        <NavigationGuardProvider>
          <AppShellInner>{children}</AppShellInner>
        </NavigationGuardProvider>
      </NotificationProvider>
    </AuthProvider>
  );
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: typecheck clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppShell.tsx
git commit -m "feat(notifications): mount provider, bell, and critical alert gate in the app shell"
```

---

## Task 12: End-to-end runtime verification (per AGENTS.md protocol)

**Files:** none (verification only). This task follows the project's mandatory **Runtime UI Verification Protocol** in `AGENTS.md` — static success is not enough.

- [ ] **Step 1: Confirm branch + commits + dev server**

```bash
git branch --show-current
git log --oneline -8
lsof -ti :3000 || (npm run dev & )
```
Expected: on the working branch; the notification commits present; dev server running. Restart the server if it was started before these changes: `kill $(lsof -ti :3000); sleep 1; npm run dev &` then wait for `✓ Ready`.

- [ ] **Step 2: Confirm routes resolve**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/orders
```
Expected: `200` (or `307` to `/login` if unauthenticated — then log in via the browser first).

- [ ] **Step 3: Demo critical flow (the core)**

In the browser, logged in as a `master`/`office_manager`/`fleet_manager`:
1. Open the bell → Notification Center → click **שלח התראת בדיקה**.
2. Expect: gentle chime, a **full-screen blocking modal** for "בעיה דווחה בשטח (בדיקה)", **[אישור] disabled**, **[פתח/י את הפריט]** enabled.
3. Click **פתח/י את הפריט** → navigates to `/orders`; modal becomes a **red bottom banner** with **[אישור] enabled**.
4. Navigate elsewhere (e.g. dashboard) → **full blocking modal re-asserts** (ack still enabled).
5. Click **אישור** → gate clears.

- [ ] **Step 4: Verify acknowledgement persisted**

Run (MCP `execute_sql`):
```sql
select nr.status, nr.related_opened_at, nr.acknowledged_at, nr.ack_was_direct
  from public.notification_recipients nr
  join public.notifications n on n.id = nr.notification_id
  where (n.metadata->>'demo') = 'true'
  order by nr.created_at desc limit 1;
select count(*) from public.notification_acknowledgements;  -- >= 1
```
Expected: `status='acknowledged'`, `related_opened_at` set, `acknowledged_at` set; one ack-log row.

- [ ] **Step 5: Verify server-side view-before-ack guard**

```bash
# Create a fresh demo critical, grab its recipientId, then try to ack WITHOUT opening.
# (Run the two execute_sql + curl using a real bearer token from the browser devtools.)
```
Use MCP `execute_sql` to read the newest demo `notification_recipients.id`, then:
```bash
curl -s -X POST http://localhost:3000/api/notifications/acknowledge \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"recipientId":"<RECIPIENT_ID>"}'
```
Expected: `{"error":"must_open_item_first"}` with HTTP 400.

- [ ] **Step 6: Verify a real event end-to-end**

In the browser: create a real order (`/new-order`) and submit it (non-draft). As an `office_manager`/`graphics_manager`/`master`, expect an `order.created` notification to arrive **live** (warning, no modal, chime), excluding nothing critical. Then report (per the AGENTS.md completion format): branch, latest commit hash, server PID/port, whether restarted, route HTTP status, feature visible in active UI (verified), permissions verified at runtime.

- [ ] **Step 7: Run the test suite once more**

```bash
npm test
```
Expected: all tests pass (including `state.test.ts`).

---

## Out of scope (explicitly NOT in Phase 1 — future phases)

- **Web Push / VAPID** + `push_subscriptions` + `notification_delivery_attempts` (Phase 4). `last_push_sent_at` column already exists.
- **PWA** manifest + service worker + standalone detection (Phase 3) and the **mandatory employee setup gate** + `profiles.notification_setup_complete` (Phase 5).
- **Reminders & escalation** worker/cron (Phase 6). Inert columns already present: `reminder_*`, `escalation_*`, `next_reminder_at`, `escalation_level`, `expires_at`.
- **Admin notification-management UI** (System B) over `notification_rules` / `notification_rule_recipients`, plus `notification_admin_audit_log` and `notification_recipient_groups`.
- **Stacked multi-critical queue** UI (data model already supports it; Phase 1 handles one at a time).
- **Strict deep-linking** to the exact entity before ack (the single `relatedEntityHref` resolver + `isOpenedSatisfied` predicate are the only upgrade points).

## Rollback / safety notes

- The migration is **additive** — it creates new tables and adds 3 triggers. Rollback = `drop trigger ... ; drop function ... ; drop table ... cascade;` for the `notification*` objects. No existing table is altered except `replica identity`/publication membership on `notification_recipients` (a new table).
- The 3 triggers are **fail-safe by omission**: if a rule is disabled or missing, `fn_emit_notification` returns without error, so order/diary/problem inserts never fail because of notifications.
- Clients cannot write the tables (RLS default-deny), so a client bug cannot forge/clear acknowledgements.
- If realtime misbehaves, the provider still hydrates on load and on tab-visibility — the bell/center remain correct; only push-latency degrades.

## Known Phase-1 limitations

- `exclude_actor` is **best-effort/inert**: `work_orders`/`work_diaries` carry no creator uuid and `order_problems.reported_by` is a name string, so the resolver passes `created_by = NULL` and excludes no one. The flag/column remain for when events carry a real actor uuid (e.g. server-action or agent sources).
- `master` is always added as a recipient (so master's own center shows everything), even for self-created events.
- "Opening the item" = navigating to the module route (`/orders`, `/work-diary`); not yet the specific record.
