-- ================================================================
-- Elkayam Road Marking Ltd — Access Control Schema
-- Run this in the Supabase SQL Editor
-- ================================================================

-- Profiles table (linked to Supabase Auth)
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

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Helper: check if current user is master (avoids RLS recursion)
create or replace function public.is_master()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'master' and is_active = true
  );
$$;

-- Policies
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

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function public.handle_updated_at();

-- ================================================================
-- Notes:
-- 1. The first master user must be created via /setup in the app
--    (or manually via Supabase Dashboard → Auth → Users + SQL INSERT)
-- 2. Only masters can read/update other profiles
-- 3. Profile inserts happen via service role key (API routes)
-- ================================================================
