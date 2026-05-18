-- Human-action audit timestamps for warehouse department.
-- Set only when the warehouse worker clicks the corresponding UI button.
-- Never set by automated processes or QA agents.

-- warehouseReadyAt: set when warehouse worker clicks "סמן כמוכן" (mark ready)
ALTER TABLE work_orders ADD COLUMN warehouse_ready_at TIMESTAMPTZ;

-- warehouseReleasedAt: set when warehouse worker clicks "שחרר לביצוע שטח" (release)
ALTER TABLE work_orders ADD COLUMN warehouse_released_at TIMESTAMPTZ;
