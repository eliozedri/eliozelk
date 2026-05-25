-- Phase 2c — PWA + native Web Push foundation. Additive + idempotent.
-- Push is a transport hint only; the DB stays the source of truth and OS push
-- dismissal never counts as acknowledgement. Clients are read-only on policy;
-- subscription writes go through service-role API routes.

-- ── 1. Per-device push subscriptions (multi-device per user) ─────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
-- Users read their own subscriptions; master reads all. No client INSERT/UPDATE
-- (service-role API routes handle writes) — DELETE-own is allowed for self-cleanup.
drop policy if exists push_subs_read_own on public.push_subscriptions;
create policy push_subs_read_own on public.push_subscriptions
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master' and coalesce(p.is_active, true) = true)
  );
drop policy if exists push_subs_delete_own on public.push_subscriptions;
create policy push_subs_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- ── 2. Per-rule policy layers (defaults preserve current behavior) ───────
alter table public.notification_rules
  add column if not exists in_app_notification_enabled boolean not null default true,
  add column if not exists require_open_before_ack boolean not null default false,
  add column if not exists web_push_enabled boolean not null default false;

-- ── 3. Global gate scaffold — single-row settings table ──────────────────
-- Stored + admin-editable later; NOT enforced this phase. Kept separate from the
-- in-app-ack layers so a future gate phase can switch each on independently.
create table if not exists public.notification_policy (
  id boolean primary key default true check (id = true),
  require_pwa_installation boolean not null default false,
  require_push_permission boolean not null default false,
  block_work_until_push_setup_complete boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.notification_policy (id) values (true) on conflict (id) do nothing;

alter table public.notification_policy enable row level security;
drop policy if exists notif_policy_read on public.notification_policy;
create policy notif_policy_read on public.notification_policy
  for select to authenticated using (true);
-- No client write policy => writes only via service-role API (future admin gate UI).
