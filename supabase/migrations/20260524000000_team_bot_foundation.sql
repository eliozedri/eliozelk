-- =====================================================================
-- Elkayam Team Bot — foundation
--
-- A separate, simple Telegram order-intake + lookup bot. This migration
-- adds ONLY new team_bot_* tables and ADDITIVE, backward-compatible
-- source-tracking columns on work_orders. Nothing existing is altered or
-- dropped. Safe to run multiple times (idempotent).
--
-- The bot writes ONLY to team_bot_* tables. Promotion into real
-- work_orders is a deliberate human action in the web app, and carries
-- the source marker forward so a Telegram-origin order stays traceable
-- as "הזמנה דרך הבוט מהטלגרם" through editing / billing / reporting / audit.
-- =====================================================================

create extension if not exists pgcrypto;

-- ── team_bot_users — Telegram allowlist (default-deny) ────────────────
create table if not exists public.team_bot_users (
  id                 uuid primary key default gen_random_uuid(),
  telegram_user_id   text not null unique,
  telegram_username  text,
  display_name       text,
  phone_number       text,
  role               text not null default 'viewer'
                       check (role in ('admin','authorized_user','viewer')),
  status             text not null default 'pending'
                       check (status in ('pending','active','blocked')),
  linked_profile_id  uuid references public.profiles(id) on delete set null,
  approved_by        text,
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_team_bot_users_status
  on public.team_bot_users (status);

-- ── team_bot_access_codes — hashed onboarding codes ───────────────────
create table if not exists public.team_bot_access_codes (
  id              uuid primary key default gen_random_uuid(),
  code_hash       text not null,                 -- SHA-256 hex; never store plaintext
  role_to_assign  text not null default 'authorized_user'
                    check (role_to_assign in ('admin','authorized_user','viewer')),
  expires_at      timestamptz,
  max_uses        integer not null default 1,
  used_count      integer not null default 0,
  created_by      text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists idx_team_bot_access_codes_active
  on public.team_bot_access_codes (active) where active = true;

-- ── team_bot_sessions — per-user conversation state + working cart ────
create table if not exists public.team_bot_sessions (
  telegram_user_id  text primary key,
  state             jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now()
);

-- ── team_bot_order_drafts — bot submissions (never final records) ─────
create table if not exists public.team_bot_order_drafts (
  id                 uuid primary key default gen_random_uuid(),
  telegram_user_id   text not null,
  submitted_by_name  text,
  source             text not null default 'telegram_bot',
  intake_channel     text not null default 'telegram_team_bot',
  status             text not null default 'pending_review'
                       check (status in ('pending_review','promoted','rejected')),
  customer           text,
  contact_person     text,
  city               text,
  notes              text,
  cart               jsonb not null default '[]'::jsonb,
  promoted_order_id  text references public.work_orders(id) on delete set null,
  reviewed_by        text,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_team_bot_order_drafts_status
  on public.team_bot_order_drafts (status);

-- ── team_bot_events — audit + Telegram update_id idempotency ──────────
create table if not exists public.team_bot_events (
  id                uuid primary key default gen_random_uuid(),
  telegram_user_id  text,
  update_id         bigint,
  event_type        text,
  payload           jsonb,
  created_at        timestamptz not null default now()
);

-- Dedupe Telegram retries: one row per update_id (when present).
create unique index if not exists idx_team_bot_events_update_id
  on public.team_bot_events (update_id) where update_id is not null;

-- ── updated_at triggers (reuse existing handle_updated_at) ────────────
do $$ begin
  if exists (select 1 from pg_proc where proname = 'handle_updated_at') then
    if not exists (select 1 from pg_trigger where tgname = 'team_bot_users_updated_at') then
      create trigger team_bot_users_updated_at before update on public.team_bot_users
        for each row execute function public.handle_updated_at();
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'team_bot_sessions_updated_at') then
      create trigger team_bot_sessions_updated_at before update on public.team_bot_sessions
        for each row execute function public.handle_updated_at();
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'team_bot_order_drafts_updated_at') then
      create trigger team_bot_order_drafts_updated_at before update on public.team_bot_order_drafts
        for each row execute function public.handle_updated_at();
    end if;
  end if;
end $$;

-- ── RLS — service-role only writes; authenticated read where the web ──
--          review UI (TB-4) needs it. No client write policies anywhere.
alter table public.team_bot_users        enable row level security;
alter table public.team_bot_access_codes enable row level security;
alter table public.team_bot_sessions     enable row level security;
alter table public.team_bot_order_drafts enable row level security;
alter table public.team_bot_events       enable row level security;

-- Authenticated staff may READ the allowlist + drafts (review screens).
do $$ begin
  if not exists (select 1 from pg_policies where tablename='team_bot_users' and policyname='auth_read_team_bot_users') then
    create policy "auth_read_team_bot_users" on public.team_bot_users
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='team_bot_order_drafts' and policyname='auth_read_team_bot_order_drafts') then
    create policy "auth_read_team_bot_order_drafts" on public.team_bot_order_drafts
      for select using (auth.role() = 'authenticated');
  end if;
end $$;
-- access_codes / sessions / events: no policies → only service role (which
-- bypasses RLS) can touch them. Codes (hashes) are never client-readable.

-- ── work_orders source tracking (additive, backward-compatible) ───────
-- source: 'web' (default — all existing + manual web orders) | 'telegram_bot'
-- source_ref: originating team_bot_order_drafts.id when promoted from the bot.
alter table public.work_orders
  add column if not exists source     text not null default 'web',
  add column if not exists source_ref text;

create index if not exists idx_work_orders_source
  on public.work_orders (source) where source <> 'web';
