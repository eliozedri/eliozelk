-- External (customer-facing) order-request intake. Additive + idempotent.
-- An external web form (hosted by JARVIS) forwards submissions to the Elkayam
-- receiver, which lands them as PENDING team-bot-style drafts for staff review.
-- It never creates a work_order; only staff promotion does (firing order.created).

-- ── 1. Let drafts originate from non-Telegram channels ───────────────────
alter table public.team_bot_order_drafts
  alter column telegram_user_id drop not null;
alter table public.team_bot_order_drafts
  add column if not exists customer_phone text;
alter table public.team_bot_order_drafts
  add column if not exists external_ref text;
-- Idempotency: the JARVIS forwarder may retry; one draft per external reference.
create unique index if not exists uniq_team_bot_drafts_external_ref
  on public.team_bot_order_drafts (external_ref)
  where external_ref is not null;

-- ── 2. Light review notification (master + office review role ONLY) ──────
-- Deliberately NOT department routing: no graphics/warehouse/fabrication, no ack,
-- no blocking, no push. Department order.created runs only after staff promote.
insert into public.notification_rules
  (event_type, enabled, title, message, severity, source_module,
   requires_ack, blocking, play_sound, show_in_center, exclude_actor,
   in_app_notification_enabled, require_open_before_ack, web_push_enabled)
values
  ('external.order_request', true,
   'בקשת הזמנה מטופס חיצוני',
   'התקבלה בקשת הזמנה חדשה מהטופס החיצוני — ממתינה לאישור צוות',
   'info', 'orders',
   false, false, false, true, true,
   true, false, false)
on conflict (event_type) do nothing;

-- office_manager = the review role; master is auto-added by fn_emit_notification.
insert into public.notification_rule_recipients (rule_id, recipient_type, recipient_value)
select r.id, 'role', 'office_manager'
from public.notification_rules r
where r.event_type = 'external.order_request'
on conflict (rule_id, recipient_type, recipient_value) do nothing;
