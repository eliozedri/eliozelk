-- =====================================================================
-- Work Orders — Group 2 Additive Columns
-- All additions are nullable with no default (or an explicit safe default).
-- No existing columns altered. No data loss possible.
--
-- Columns added:
--   design_approval_status  — Track 1: design proof approval (graphics → client)
--                             Distinct from customer_approval_status (Track 2:
--                             execution scheduling approval).
--                             Values: not_required | pending_send | sent |
--                                     approved | rejected | revision_requested
--                             NULL = not yet evaluated for this order.
--
--   design_sent_at          — Timestamp when the design proof was sent to the
--                             client. Companion to design_approval_status = 'sent'.
--
--   design_approved_at      — Timestamp when the client approved the design proof.
--                             Companion to design_approval_status = 'approved'.
--
--   billing_ready_at        — Timestamp when the order was marked ready for
--                             billing (e.g., after field work diary approval).
--                             Enables billing agent to detect orders awaiting
--                             billing without relying on status transitions alone.
--
--   billing_approved_at     — Timestamp when internal billing approval was
--                             granted (accounting_status = 'approved').
--                             Redundant with accounting_status for query convenience.
--
--   required_date           — Customer's required completion / delivery date.
--                             Used for SLA monitoring and scheduling priority.
-- =====================================================================

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS design_approval_status  text,
  ADD COLUMN IF NOT EXISTS design_sent_at          timestamptz,
  ADD COLUMN IF NOT EXISTS design_approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS billing_ready_at        timestamptz,
  ADD COLUMN IF NOT EXISTS billing_approved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS required_date           date;

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Supports graphics-production-agent scan: filter by design approval state
CREATE INDEX IF NOT EXISTS idx_work_orders_design_approval_status
  ON public.work_orders (design_approval_status)
  WHERE design_approval_status IS NOT NULL;

-- Supports billing-collections-agent scan: find orders ready for billing
CREATE INDEX IF NOT EXISTS idx_work_orders_billing_ready_at
  ON public.work_orders (billing_ready_at)
  WHERE billing_ready_at IS NOT NULL;

-- Supports scheduling queries: orders with a required delivery date
CREATE INDEX IF NOT EXISTS idx_work_orders_required_date
  ON public.work_orders (required_date)
  WHERE required_date IS NOT NULL;
