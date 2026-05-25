-- =====================================================================
-- Finance notification rules — wires the existing notification foundation
-- to financial-document events so the finance manager gets real in-app
-- alerts (notification bell / center), not only screen queues.
--
-- Additive & idempotent: seeds rules + role recipients only. Emission is
-- done from the service-role upload route via fn_emit_notification(...).
-- master is auto-added by the resolver, so it is not listed here.
-- =====================================================================

INSERT INTO public.notification_rules
  (event_type, enabled, title, message, severity, source_module, requires_ack, blocking, play_sound, show_in_center, exclude_actor)
VALUES
  ('finance.document_new',         true, 'מסמך כספי חדש',      'התקבל מסמך כספי חדש לבדיקה וסיווג',                'info',    'finance', false, false, false, true, true),
  ('finance.duplicate_suspected',  true, 'חשד לכפילות חשבונית', 'זוהה חשד שמסמך כספי כבר קיים במערכת — דורש בדיקה', 'warning', 'finance', false, false, true,  true, true),
  ('finance.needs_classification', true, 'מסמך כספי דורש סיווג', 'התקבל מסמך כספי שלא סווג אוטומטית — דורש סיווג ידני', 'info',    'finance', false, false, false, true, true)
ON CONFLICT (event_type) DO NOTHING;

INSERT INTO public.notification_rule_recipients (rule_id, recipient_type, recipient_value)
SELECT r.id, 'role', v.role
FROM public.notification_rules r
JOIN (VALUES
  ('finance.document_new','finance_manager'),
  ('finance.duplicate_suspected','finance_manager'),
  ('finance.needs_classification','finance_manager')
) AS v(event_type, role) ON v.event_type = r.event_type
ON CONFLICT (rule_id, recipient_type, recipient_value) DO NOTHING;
