# Proposal — link work_orders to customers by id (NOT APPLIED)

> ⚠️ Proposal only, in `docs/` (not `supabase/migrations/`) so it can't be
> `db push`-applied by accident. It changes the schema and backfills data — needs
> explicit approval + a staging test. Audit: 2026-05-30 (found by the 50-order simulation).

## The gap (proven)
`work_orders.customer` is a **free-text string**, with **no FK** to `customers`.
SQL on the simulation: **0 of 40** distinct order-customers exist in the `customers`
table. Consequence: orders show on the Orders page, but the **Customers page can only
match orders to a customer by name string** (`CustomerDetailPage.tsx:166-167` —
`o.customer.toLowerCase() === customer.name.toLowerCase()`). Name drift (typos,
"בע״מ", spacing, the `🧪[SIM]` prefix) silently breaks the link, and there's no
referential integrity.

## Current mitigation (already in code, safe)
`CustomerDetailPage` joins orders to a customer by **normalized name match**. This
works for clean data and is what powers the customer's order list / billing-ready /
profitability today. It is a temporary match, documented here as the limitation.

## Proposed migration (when approved)
```sql
-- 1. add nullable FK (no behavior change yet)
alter table public.work_orders
  add column if not exists customer_id text references public.customers(id) on delete set null;
create index if not exists idx_work_orders_customer_id on public.work_orders(customer_id);

-- 2. backfill by exact normalized name (safe; only sets where unambiguous)
update public.work_orders w
set customer_id = c.id
from public.customers c
where w.customer_id is null
  and lower(btrim(w.customer)) = lower(btrim(c.name))
  -- guard against ambiguous duplicate customer names:
  and (select count(*) from public.customers c2 where lower(btrim(c2.name)) = lower(btrim(c.name))) = 1;
```
- **No data deleted/mutated** beyond setting the new nullable column. Existing
  `customer` text stays as-is (display + fallback).
- Orders whose customer isn't in `customers` (e.g. ad-hoc/bot) keep `customer_id = null`
  and the name string — nothing breaks.

## Code changes after the migration (separate, reviewed)
1. New-order / promote flows set `customer_id` when a known customer is chosen.
2. `CustomerDetailPage` prefers `customer_id` match, falls back to name match for legacy rows.
3. Optionally a one-time UI to reconcile unmatched order-customers into `customers`.

## Rollback
`alter table public.work_orders drop column customer_id;` (drops the index too).
Pure additive column — reversible with no data loss to existing fields.

## Recommendation
Apply after approval; until then the name-match mitigation is in place and the
Customers detail view works for clean names.
