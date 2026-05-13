-- =====================================================================
-- Harden work_diaries: promote execution lifecycle fields to first-class
-- columns so the approval workflow, order linkage, and billing queries
-- are queryable and not buried in the JSONB blob.
--
-- All statements use ADD COLUMN IF NOT EXISTS — safe to re-run.
-- order_id is TEXT (not UUID) to match work_orders.id type.
-- =====================================================================

ALTER TABLE public.work_diaries
  ADD COLUMN IF NOT EXISTS order_id          text REFERENCES public.work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status   text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by       text,
  ADD COLUMN IF NOT EXISTS approved_at       timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason  text;

-- Backfill from existing JSONB blob (safe no-op if columns were empty)
UPDATE public.work_diaries
SET
  order_id         = NULLIF(TRIM(data->>'orderId'),        ''),
  approval_status  = COALESCE(NULLIF(TRIM(data->>'approvalStatus'), ''), 'pending'),
  approved_by      = NULLIF(TRIM(data->>'approvedBy'),     ''),
  approved_at      = CASE
    WHEN NULLIF(TRIM(data->>'approvedAt'), '') IS NOT NULL
    THEN (NULLIF(TRIM(data->>'approvedAt'), ''))::timestamptz
    ELSE NULL
  END,
  rejection_reason = NULLIF(TRIM(data->>'rejectionReason'), '')
WHERE TRUE;

-- Fix any approval_status values that slipped past the CHECK on old data
UPDATE public.work_diaries
SET approval_status = 'pending'
WHERE approval_status NOT IN ('pending', 'approved', 'rejected');

-- Fix FK: order_id values that don't match any work_orders.id become NULL
UPDATE public.work_diaries d
SET order_id = NULL
WHERE d.order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.work_orders wo WHERE wo.id = d.order_id
  );

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_work_diaries_order_id
  ON public.work_diaries(order_id) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_diaries_approval_pending
  ON public.work_diaries(submitted_at)
  WHERE status = 'submitted' AND approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_work_diaries_approved
  ON public.work_diaries(approved_at)
  WHERE approval_status = 'approved';

-- Add to realtime publication so approval changes propagate instantly
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'work_diaries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_diaries;
  END IF;
END $$;
