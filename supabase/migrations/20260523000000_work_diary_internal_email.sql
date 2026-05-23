-- Add audit columns for the automatic archive email sent on diary submission.
-- internal_emailed_at: set on successful send to elkayam.yomanim@gmail.com.
-- internal_email_error: set on failure (cleared on success).
-- Partial index supports a manager view of submitted-but-not-archived diaries.

ALTER TABLE work_diaries
  ADD COLUMN IF NOT EXISTS internal_emailed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS internal_email_error TEXT;

CREATE INDEX IF NOT EXISTS idx_work_diaries_unarchived
  ON work_diaries(submitted_at)
  WHERE status = 'submitted' AND internal_emailed_at IS NULL;
