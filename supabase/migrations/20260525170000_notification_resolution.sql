-- Report-a-problem support for notifications.
-- Additive, idempotent, non-destructive: adds ONE nullable column recording HOW a
-- recipient resolved a notification, distinguishing a plain receipt acknowledgement
-- from a "problem reported" outcome. No constraint/trigger/RLS/data change; the
-- status lifecycle (CHECK) is untouched.
--
-- Applied to PRODUCTION (gtevmcnasvrahzfdqrqk) on 2026-05-25 via MCP.
-- Rollback: alter table public.notification_recipients drop column if exists resolution;

alter table public.notification_recipients
  add column if not exists resolution text;   -- null | 'acknowledged' | 'problem_reported'
