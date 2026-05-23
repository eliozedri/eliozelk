-- =====================================================================
-- Team Bot — Telegram-admin approval model
--
-- Shifts the access workflow to: user starts bot -> pending request ->
-- admin gets a Telegram alert -> admin approves/rejects from Telegram ->
-- status saved in DB -> user gets access. The DB stays the source of
-- truth; the web view is for management/audit.
--
-- Additive columns + a status-vocabulary migration. Idempotent.
-- =====================================================================

alter table public.team_bot_users
  add column if not exists chat_id      text,
  add column if not exists first_name   text,
  add column if not exists last_name    text,
  add column if not exists requested_at timestamptz default now(),
  add column if not exists rejected_at  timestamptz,
  add column if not exists rejected_by  text;

update public.team_bot_users set requested_at = created_at where requested_at is null;

-- Status vocabulary: pending / approved / rejected / inactive.
-- Remap any legacy values (active->approved, blocked->rejected) before
-- swapping the CHECK constraint.
alter table public.team_bot_users drop constraint if exists team_bot_users_status_check;
update public.team_bot_users set status = 'approved' where status = 'active';
update public.team_bot_users set status = 'rejected' where status = 'blocked';
alter table public.team_bot_users
  add constraint team_bot_users_status_check
  check (status in ('pending','approved','rejected','inactive'));
