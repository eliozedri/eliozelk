-- order.created → production-intake reconciliation.
-- Already applied to PRODUCTION on 2026-05-24 (via MCP execute_sql); recorded here
-- for DB<->repo parity. Idempotent: re-running sets the same fixed values and touches
-- only the order.created rule.
--
-- Phase-1 decision (owner-approved): order.created is a STRONG, acknowledged production-
-- intake notification, but NON-blocking for now (hard-block + true per-department routing
-- deferred). See docs/superpowers/specs/2026-05-23-critical-notification-foundation-design.md §6.2.

update public.notification_rules
set requires_ack = true,       -- require receipt-acknowledgement (view-before-ack via related work_order)
    blocking     = false,      -- hard-block deferred for Phase 1
    severity     = 'warning',  -- strong operational warning (not critical full-lock)
    play_sound   = true,
    updated_at   = now()
where event_type = 'order.created';
