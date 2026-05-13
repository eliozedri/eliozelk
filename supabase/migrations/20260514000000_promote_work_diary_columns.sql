-- Promote execution lifecycle fields from work_diaries JSONB blob to first-class columns.
-- Enables: order linkage FK, approval workflow queries, index-backed lookups.

ALTER TABLE work_diaries
  ADD COLUMN IF NOT EXISTS order_id        UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by     TEXT,
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Backfill from existing JSONB blob (only meaningful for submitted diaries)
UPDATE work_diaries
SET
  order_id = CASE
    WHEN (data->>'orderId') IS NOT NULL AND (data->>'orderId') != ''
    THEN (
      SELECT id FROM work_orders WHERE id = (data->>'orderId')::UUID LIMIT 1
    )
    ELSE NULL
  END,
  approval_status  = COALESCE(NULLIF(data->>'approvalStatus', ''), 'pending'),
  approved_by      = NULLIF(data->>'approvedBy', ''),
  approved_at      = CASE
    WHEN (data->>'approvedAt') IS NOT NULL AND (data->>'approvedAt') != ''
    THEN (data->>'approvedAt')::TIMESTAMPTZ
    ELSE NULL
  END,
  rejection_reason = NULLIF(data->>'rejectionReason', '')
WHERE status = 'submitted';

-- Indexes for common operational queries
CREATE INDEX IF NOT EXISTS idx_work_diaries_order_id
  ON work_diaries(order_id) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_diaries_approval_pending
  ON work_diaries(submitted_at) WHERE status = 'submitted' AND approval_status = 'pending';
