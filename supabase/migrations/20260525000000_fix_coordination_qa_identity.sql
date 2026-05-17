-- =====================================================================
-- Fix: Coordination & QA Manager — identity normalization
--
-- Corrects two source-of-truth drifts introduced by 20260524000000:
--   1. Name was changed to "מחלקת תיאומים ו-QA" (department form).
--      The intended identity is "מנהלת תיאומים ו-QA" (role-holder, feminine).
--   2. allowed_read_scopes was seeded as ['work_orders'] only.
--      The role requires cross-department readiness visibility:
--      work_orders, work_diaries, catalog_items, crews, customers.
-- =====================================================================

UPDATE public.agents
SET
  name                 = 'מנהלת תיאומים ו-QA',
  allowed_read_scopes  = ARRAY['work_orders', 'work_diaries', 'catalog_items', 'crews', 'customers'],
  updated_at           = now()
WHERE id = 'coordination-qa-agent';
