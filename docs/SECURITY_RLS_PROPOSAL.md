# Proposal — Role-aware RLS for operational tables (NOT APPLIED)

> ⚠️ **This is a proposal, intentionally placed in `docs/` (not `supabase/migrations/`)
> so it cannot be applied by `supabase db push` by accident.** It changes production
> permissions and **will break direct browser writes** unless rolled out with the
> client/route changes described here. Do not apply without explicit approval +
> staging tests. Audit: 2026-05-29.

## The gap
These tables have RLS = `auth.role() = 'authenticated'` for `ALL` (any logged-in
user has full read/write via PostgREST with the public anon key):

`work_orders`, `work_diaries`, `crews`, `catalog_items`, `equipment`,
`agent_tasks`, `agent_exceptions`, `agent_approvals`, `agent_activity_feed`,
plus `suppliers` (`USING(true)`) and `inventory_movements` (INSERT `WITH CHECK(true)`).

Consequence: the granular role model (`profiles.allowed_tabs` /
`action_permissions`) is enforced only in the **UI/API**, not the DB. A logged-in
user could, with direct REST calls, exceed their granted permissions — e.g. edit
orders/catalog/equipment, **or flip `agent_approvals.approval_status`** to bypass an
agent approval gate.

The browser **does** write several of these directly today (`useOrders`,
`useWorkDiaries`, `useCrews`, `useCatalog`, `useCatalog`→`inventory_movements`), so a
naive tightening would break the app.

## What is already correct (do not change)
Finance + intake + agent-command queues are **service-role-write-only** (RLS on, no
authenticated policy): `expense_records`, `supplier_documents`,
`team_bot_order_drafts`, `jarvis_ceo_agent_commands`, `jarvis_capability_requests`,
`jarvis_dev_tasks`, `jarvis_documents`. These are the model to follow.

## Two rollout options

### Option A — Role-aware RLS via a SQL helper (keeps client writes)
Add a `SECURITY DEFINER` helper that reads the caller's permissions, then gate each
policy on it. Example:
```sql
create or replace function public.auth_has_action(p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active
      and ('*' = any(action_permissions) or p_action = any(action_permissions))
  );
$$;
revoke execute on function public.auth_has_action(text) from anon;

-- e.g. catalog_items
drop policy auth_all_catalog on public.catalog_items;
create policy catalog_read   on public.catalog_items for select to authenticated using (true);
create policy catalog_write  on public.catalog_items for all to authenticated
  using (public.auth_has_action('manage_catalog'))
  with check (public.auth_has_action('manage_catalog'));
```
Per-table action mapping to define and test:
| table | read | write action |
|-------|------|--------------|
| work_orders | authenticated | `manage_orders` |
| work_diaries | authenticated | `manage_diary` |
| crews | authenticated | `manage_crews` |
| catalog_items | authenticated | `manage_catalog` |
| equipment | authenticated | `manage_equipment` |
| inventory_movements | authenticated | `manage_inventory` |
| suppliers | authenticated | `manage_suppliers` (or service-role only) |
| agent_tasks / agent_exceptions / agent_activity_feed | authenticated | service-role only (writes happen in scan routes) |
| agent_approvals | authenticated | service-role only (approve/reject via an API route) |

**Risk:** every client mutation must map to an action the acting role actually has,
or it breaks. Requires testing each hook (`useOrders` etc.) per role.

### Option B — Move mutations server-side (most robust, larger)
Make these tables service-role-write-only (like finance) and route all client
mutations through `requireAction`-gated API routes. Highest assurance, biggest code
change (rewrite the write paths in `useOrders`/`useWorkDiaries`/`useCrews`/`useCatalog`).

## Recommendation
- **Now (safe, no breakage):** apply the already-drafted
  `supabase/migrations/20260611000000_security_hardening_advisors.sql` (revokes anon
  RPC EXECUTE, tightens `suppliers` to read-only, pins search_path).
- **Next, smallest high-value win:** make `agent_approvals` + `agent_exceptions` +
  `agent_tasks` + `inventory_movements` writes **service-role-only** and add the
  thin API routes for the few client writes (approvals are the real integrity risk).
- **Then:** Option A for the remaining operational tables, tested per role on staging.

Until then, the mitigating facts: all users are authenticated staff; finance and the
CEO/Jarvis command queues are already locked; the gap is privilege-escalation
*between staff roles*, not anonymous access.
