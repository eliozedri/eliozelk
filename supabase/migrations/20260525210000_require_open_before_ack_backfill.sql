-- Behavior-preserving backfill for the require_open_before_ack policy flag.
-- Until now the ack path always required viewing the related item whenever a related
-- entity existed. Now that the ack route honors the per-rule flag, set it true for every
-- rule that requires acknowledgement so behavior is byte-identical; admins can relax it
-- per rule afterward. Data-only, additive, idempotent.
update public.notification_rules
   set require_open_before_ack = true
 where requires_ack = true
   and require_open_before_ack = false;
