-- Link work_orders to customers by id (additive, non-destructive).
-- Applied to prod 2026-05-31 (customers=0 at apply time → 0 backfilled).
-- Existing free-text work_orders.customer stays as-is (display + fallback).
-- Rollback: alter table public.work_orders drop column customer_id; (drops index too).

alter table public.work_orders
  add column if not exists customer_id text references public.customers(id) on delete set null;

create index if not exists idx_work_orders_customer_id on public.work_orders(customer_id);

-- Safe backfill: only where the customer name matches exactly AND unambiguously.
-- Ambiguous/no-match stay null (name fallback + human-review).
update public.work_orders w
set customer_id = c.id
from public.customers c
where w.customer_id is null
  and lower(btrim(w.customer)) = lower(btrim(c.name))
  and (select count(*) from public.customers c2 where lower(btrim(c2.name)) = lower(btrim(c.name))) = 1;
