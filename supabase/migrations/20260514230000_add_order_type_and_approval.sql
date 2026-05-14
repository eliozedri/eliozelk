-- order_type: classifies what kind of order this is and determines workflow routing
-- 'field_work'       → field execution job; enters weekly schedule after approval
-- 'pickup'           → customer comes to collect; never enters weekly schedule
-- 'equipment_supply' → product supply; routing depends on fulfillment_method
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'field_work';

-- fulfillment_method: relevant only for equipment_supply orders
-- 'self_pickup' → customer collects; does not enter weekly schedule
-- 'delivery'    → Elkayam delivers; enters weekly schedule for logistics
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS fulfillment_method text;

-- customer_approval_status: blocks field_work orders from entering weekly schedule
-- until the office confirms the customer approved the execution date.
-- Default 'approved' keeps ALL EXISTING ORDERS unblocked — backward-compatible.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS customer_approval_status text NOT NULL DEFAULT 'approved';
