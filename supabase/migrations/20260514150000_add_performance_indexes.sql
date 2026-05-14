-- ── Performance indexes for common query patterns ────────────────────────────
-- Safe to re-apply: all use CREATE INDEX IF NOT EXISTS.
-- Supabase auto-creates indexes for PKs and FKs — these add the remaining
-- columns that the application filters and orders by most frequently.

-- work_orders: department views filter by status
CREATE INDEX IF NOT EXISTS idx_work_orders_status
  ON public.work_orders (status);

-- work_orders: scheduling/workmap filters by assigned_crew + scheduled_date
CREATE INDEX IF NOT EXISTS idx_work_orders_crew_schedule
  ON public.work_orders (assigned_crew_id, scheduled_date)
  WHERE assigned_crew_id IS NOT NULL;

-- work_orders: accounting view filters completed + pending billing
CREATE INDEX IF NOT EXISTS idx_work_orders_accounting
  ON public.work_orders (status, accounting_status);

-- work_orders: dashboard urgency filter
CREATE INDEX IF NOT EXISTS idx_work_orders_priority
  ON public.work_orders (priority)
  WHERE priority = 'urgent';

-- work_diaries: approval queue filters submitted + pending approval
CREATE INDEX IF NOT EXISTS idx_work_diaries_approval
  ON public.work_diaries (status, approval_status);

-- work_diaries: linking diaries back to orders
CREATE INDEX IF NOT EXISTS idx_work_diaries_order_id
  ON public.work_diaries (order_id)
  WHERE order_id IS NOT NULL;

-- order_activities: timeline queries fetch by order_id ordered by timestamp
CREATE INDEX IF NOT EXISTS idx_order_activities_order_ts
  ON public.order_activities (order_id, timestamp DESC);

-- order_problems: open-problem counts filter by order_id + status
CREATE INDEX IF NOT EXISTS idx_order_problems_order_status
  ON public.order_problems (order_id, status);
