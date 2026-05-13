-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1: Supabase Auth migration
-- Replaces custom SHA-256 auth (public.users) with Supabase Auth + profiles.
-- Safe to run multiple times (all statements are idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Profiles table (application permissions, linked to auth.users) ─────────
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  name               text not null,
  role               text not null default 'viewer',
  is_active          boolean not null default true,
  allowed_tabs       text[] not null default '{}',
  action_permissions text[] not null default '{}',
  last_login_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- All authenticated users can read all profiles (needed by AccessManager)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='profiles' and policyname='auth_read_profiles'
  ) then
    create policy "auth_read_profiles" on public.profiles
      for select using (auth.role() = 'authenticated');
  end if;
end $$;

-- Only service role (server API routes) can insert/update/delete profiles.
-- No client-side write policies — intentional.

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='profiles_updated_at') then
    create trigger profiles_updated_at
      before update on public.profiles
      for each row execute function public.handle_updated_at();
  end if;
end $$;

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));

-- ── 2. Lock down public.users (old table) ────────────────────────────────────
-- Remove the dangerous "anon can read everything including password_hash" policy.
drop policy if exists "anon_all_users" on public.users;

-- Only service role (bypasses RLS) can now touch this table.
-- All remaining references from server migration route use service role.

-- ── 3. Harden RLS on all operational tables ───────────────────────────────────
-- Replace "anon_all_*" (unauthenticated full access) with authenticated-only.

-- customers
drop policy if exists "anon_all_customers" on public.customers;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='customers' and policyname='auth_all_customers'
  ) then
    create policy "auth_all_customers" on public.customers
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- work_orders
drop policy if exists "anon_all_orders" on public.work_orders;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='work_orders' and policyname='auth_all_orders'
  ) then
    create policy "auth_all_orders" on public.work_orders
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- work_diaries
drop policy if exists "anon_all_diaries" on public.work_diaries;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='work_diaries' and policyname='auth_all_diaries'
  ) then
    create policy "auth_all_diaries" on public.work_diaries
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- crews
drop policy if exists "anon_all_crews" on public.crews;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='crews' and policyname='auth_all_crews'
  ) then
    create policy "auth_all_crews" on public.crews
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- catalog_items
drop policy if exists "anon_all_catalog" on public.catalog_items;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='catalog_items' and policyname='auth_all_catalog'
  ) then
    create policy "auth_all_catalog" on public.catalog_items
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- cost_rates
drop policy if exists "anon_all_rates" on public.cost_rates;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='cost_rates' and policyname='auth_all_rates'
  ) then
    create policy "auth_all_rates" on public.cost_rates
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- counters: restrict next_counter() execute grant to authenticated only
revoke execute on function public.next_counter(text) from anon;

-- ── 4. Realtime publication: add profiles ────────────────────────────────────
alter table public.profiles replica identity full;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
