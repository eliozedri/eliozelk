-- Add required_workers to work_orders.
-- Captures the per-assignment worker count decided at scheduling time.
-- Replaces the legacy fixed workerCount on the crews profile (which is now
-- hidden from the UI — worker headcount is an assignment decision, not a
-- fixed team property).

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS required_workers integer;

-- Index for schedule board queries filtered by crew + date
CREATE INDEX IF NOT EXISTS idx_work_orders_scheduled_date
  ON public.work_orders (scheduled_date)
  WHERE scheduled_date IS NOT NULL;
