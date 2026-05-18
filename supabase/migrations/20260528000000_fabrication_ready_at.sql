-- Add fabrication_ready_at: human-action audit timestamp
-- Set precisely when the fabrication user clicks "mark ready" (סמן כמוכן).
-- Never set by automated processes or QA agents.
ALTER TABLE work_orders ADD COLUMN fabrication_ready_at TIMESTAMPTZ;
