-- warehouse_required: auto-set at order creation when accessory rows exist.
-- Marks that the Warehouse department needs to prepare physical stock for this order.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS warehouse_required boolean NOT NULL DEFAULT false;

-- warehouse_status: tracks warehouse prep independently of the main status machine,
-- same pattern as fabrication_status.
-- NULL  = not applicable (warehouse_required = false)
-- 'pending'    = waiting for warehouse to acknowledge
-- 'processing' = warehouse is picking/preparing
-- 'ready'      = items packed and ready for delivery/handoff
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS warehouse_status text;
