-- WhatsApp inbound drafts fire the SAME light review notification as the Telegram bot
-- and the external web form (additive + idempotent). Master + office review role only;
-- info severity; no ack, no blocking, no sound, no Web Push, no department routing.
-- Department order.created still runs ONLY when staff promote the draft into a work_order.
insert into public.notification_rules
  (event_type, enabled, title, message, severity, source_module,
   requires_ack, blocking, play_sound, show_in_center, exclude_actor,
   in_app_notification_enabled, require_open_before_ack, web_push_enabled)
values
  ('whatsapp.order_request', true,
   'בקשת הזמנה מוואטסאפ',
   'התקבלה פנייה חדשה בוואטסאפ — ממתינה לבדיקת צוות',
   'info', 'orders',
   false, false, false, true, true,
   true, false, false)
on conflict (event_type) do nothing;

insert into public.notification_rule_recipients (rule_id, recipient_type, recipient_value)
select r.id, 'role', 'office_manager'
from public.notification_rules r
where r.event_type = 'whatsapp.order_request'
on conflict (rule_id, recipient_type, recipient_value) do nothing;
