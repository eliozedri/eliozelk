-- ================================================================
-- Elkayam Road Marking Ltd — Full Database Schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- ================================================================

-- ── Profiles (linked to Supabase Auth for future migration) ─────────────────
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  email       text not null,
  name        text not null,
  role        text not null default 'viewer',
  is_active   boolean not null default true,
  allowed_tabs        text[] not null default '{}',
  action_permissions  text[] not null default '{}',
  last_login_at       timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_master()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'master' and is_active = true
  );
$$;

drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile" on profiles
  for select using (auth.uid() = id);

drop policy if exists "Masters can read all profiles" on profiles;
create policy "Masters can read all profiles" on profiles
  for select using (public.is_master());

drop policy if exists "Masters can update profiles" on profiles;
create policy "Masters can update profiles" on profiles
  for update using (public.is_master());

drop policy if exists "Service role can insert profiles" on profiles;
create policy "Service role can insert profiles" on profiles
  for insert with check (true);

-- ── Updated-at trigger function ─────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function public.handle_updated_at();

-- ── Customers ────────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id            text primary key,
  name          text not null,
  location      text not null default '',
  phone         text not null default '',
  last_order    text not null default '',
  notes         text,
  payment_terms text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.customers enable row level security;

drop policy if exists "Allow all for anon" on customers;
create policy "Allow all for anon" on customers for all using (true) with check (true);

drop trigger if exists customers_updated_at on customers;
create trigger customers_updated_at
  before update on customers
  for each row execute function public.handle_updated_at();

-- ── Catalog Items ────────────────────────────────────────────────────────────
create table if not exists public.catalog_items (
  id              text primary key,
  name            text not null,
  type            text not null,
  category        text not null default '',
  unit_of_measure text not null,
  dimension_value text,
  dimension_unit  text,
  default_price   numeric,
  description     text not null default '',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.catalog_items enable row level security;

drop policy if exists "Allow all for anon" on catalog_items;
create policy "Allow all for anon" on catalog_items for all using (true) with check (true);

drop trigger if exists catalog_items_updated_at on catalog_items;
create trigger catalog_items_updated_at
  before update on catalog_items
  for each row execute function public.handle_updated_at();

-- ── Crews ────────────────────────────────────────────────────────────────────
create table if not exists public.crews (
  id                   text primary key,
  name                 text not null,
  leader               text not null default '',
  worker_count         integer not null default 1,
  phone                text not null default '',
  skills               text[] not null default '{}',
  region               text not null default 'all',
  daily_capacity_hours numeric not null default 8,
  active               boolean not null default true,
  notes                text not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.crews enable row level security;

drop policy if exists "Allow all for anon" on crews;
create policy "Allow all for anon" on crews for all using (true) with check (true);

drop trigger if exists crews_updated_at on crews;
create trigger crews_updated_at
  before update on crews
  for each row execute function public.handle_updated_at();

-- ── Work Orders ──────────────────────────────────────────────────────────────
create table if not exists public.work_orders (
  id           text primary key,
  order_number text not null,
  status       text not null default 'graphics_pending',
  priority     text not null default 'normal',
  customer     text not null default '',
  city         text not null default '',
  order_date   text not null default '',
  data         jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.work_orders enable row level security;

drop policy if exists "Allow all for anon" on work_orders;
create policy "Allow all for anon" on work_orders for all using (true) with check (true);

drop trigger if exists work_orders_updated_at on work_orders;
create trigger work_orders_updated_at
  before update on work_orders
  for each row execute function public.handle_updated_at();

-- ── Work Diaries ─────────────────────────────────────────────────────────────
create table if not exists public.work_diaries (
  id             text primary key,
  diary_number   text not null,
  status         text not null default 'draft',
  customer_name  text not null default '',
  site_name      text not null default '',
  execution_date text not null default '',
  submitted_at   timestamptz,
  data           jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.work_diaries enable row level security;

drop policy if exists "Allow all for anon" on work_diaries;
create policy "Allow all for anon" on work_diaries for all using (true) with check (true);

drop trigger if exists work_diaries_updated_at on work_diaries;
create trigger work_diaries_updated_at
  before update on work_diaries
  for each row execute function public.handle_updated_at();

-- ── Cost Rates (single-row config table) ─────────────────────────────────────
create table if not exists public.cost_rates (
  id         integer primary key default 1,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

alter table public.cost_rates enable row level security;

drop policy if exists "Allow all for anon" on cost_rates;
create policy "Allow all for anon" on cost_rates for all using (true) with check (true);

-- Ensure row exists
insert into public.cost_rates (id, data) values (1, '{}') on conflict (id) do nothing;

-- ── Sequential counters ──────────────────────────────────────────────────────
-- Backs the next_counter() RPC used for ORD-YYYY-NNN and WD-YYYY-NNN numbers.

create table if not exists public.counters (
  key   text   primary key,
  value bigint not null default 0
);

alter table public.counters enable row level security;

-- No direct-access policies. SECURITY DEFINER function is the only path in.

create or replace function public.next_counter(counter_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_val integer;
begin
  update public.counters set value = value + 1
  where key = counter_key returning value into next_val;
  if next_val is null then
    insert into public.counters (key, value) values (counter_key, 1)
    on conflict (key) do update set value = public.counters.value + 1
    returning value into next_val;
  end if;
  return next_val;
end;
$$;

-- Grant execute only to authenticated; deny anon.
revoke all on function public.next_counter(text) from public;
grant execute on function public.next_counter(text) to authenticated;

-- ================================================================
-- Notes:
-- 1. RLS is enabled on all tables; anon-permissive policies were replaced
--    by auth-only policies via migration 20260513000001.
-- 2. Complex nested data (signRows, paintingItems, etc.) is stored as JSONB.
-- 3. The cost_rates table uses a single row (id = 1) for the rate config.
-- 4. work_orders and work_diaries store the full object in `data` JSONB
--    for schema flexibility, with indexed columns for filtering.
-- 5. next_counter() uses SECURITY DEFINER so it bypasses RLS on counters
--    and can be called by authenticated users without direct table access.
-- ================================================================
