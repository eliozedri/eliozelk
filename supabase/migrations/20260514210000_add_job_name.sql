-- Add job_name to work_orders.
-- Operational name for the job as shown in the weekly schedule and field teams.
-- Distinct from order_number (reference ID) and location (where the work is done).
-- Examples: "סימון חניון עיריית אשקלון", "התקנת תמרורים רחוב הרצל".

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS job_name text;
