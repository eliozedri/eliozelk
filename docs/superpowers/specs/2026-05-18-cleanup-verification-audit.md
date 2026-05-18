# Cleanup Verification Audit Spec
**Date:** 2026-05-18  
**Goal:** Prove the entire app is free of pilot/test operational data and define a repeatable cleanup process.

---

## 1. Full App Data-Source Map by Screen

| Screen | File | Hook / Context | Supabase Table(s) | Notes |
|--------|------|----------------|-------------------|-------|
| Orders `/orders` | `src/components/OrdersTable/` | `useOrdersContext` | `work_orders` | |
| Accounting `/accounting` | `src/components/Accounting/index.tsx` | `useOrdersContext`, `useWorkDiaryContext`, `useOperationalKPIs` | `work_orders`, `work_diaries` | Also direct query to `inventory_consumptions` for reconciliation flag only (no rows rendered) |
| Customers `/customers` | `src/components/Customers/` | `useCustomersContext` | `customers` | |
| Weekly Schedule `/schedule` | `src/components/WeeklySchedule/` | `useOrdersContext`, `useCrewsContext` | `work_orders`, `crews` | No separate schedule table. Schedule = orders with `scheduledDate` set |
| Work Diaries `/work-diary` | `src/components/WorkDiary/` | `useWorkDiaryContext` | `work_diaries` | |
| Warehouse `/warehouse` | `src/components/Warehouse/` | `useOrdersContext` | `work_orders` | |
| Graphics `/graphics` | `src/components/Graphics/` | `useOrdersContext` | `work_orders` | |
| Fabrication `/fabrication` | `src/components/Fabrication/` | `useOrdersContext` | `work_orders` | |
| Field Ops / Crews `/crews` | `src/components/Crews/` | `useCrewsContext` | `crews` | |
| Catalog `/catalog` | `src/components/Catalog/` | `useCatalogContext` | `catalog_items` | Master data |
| Digital Command Center `/agents` | `src/components/AgentCommandCenter/` | `useAgents` | `agents`, `agent_tasks`, `agent_exceptions`, `agent_approvals`, `agent_activity_feed` | |
| Dashboard `/` | `src/components/Dashboard/` | `useOrdersContext`, `useCrewsContext`, `useWorkflowAlerts`, `useForecast`, `useOperationalKPIs` | `work_orders`, `work_diaries`, `crews`, `cost_rates` | All KPIs derived in-memory |
| Profitability `/profitability` | `src/components/Profitability/` | `useOrdersContext`, `useCatalogContext` | `work_orders`, `profitability_snapshots`, `catalog_items` | Snapshots generated per order on completion |
| Workflow Alerts | `src/hooks/useWorkflowAlerts.ts` | Orders + Diaries context | None (derived) | Computed in-memory from `orders` + `diaries` state |
| Agent Chat | `src/components/AgentChat/` | `useAgentChat` | `communication_threads`, `communication_messages` | |

**No hardcoded/mock data found in any component.** No separate invoice archive, billing records, or accounting history table. Every Accounting tab (orders / billing / invoiced / archive / diary-archive) is derived from `work_orders` + `work_diaries`.

---

## 2. Stale Data Sources Found and Classification

| Source | Type | Status |
|--------|------|--------|
| `elkayam_orders` localStorage key | Old operational data — **now ignored** | Fixed: `loadLocal()` removed from `useOrders.ts` |
| `elkayam_customers` localStorage key | Old operational data — **now ignored** | Fixed: `readCache()` removed from `CustomersContext.tsx` |
| `elkayam_work_diaries` localStorage key | Old operational data — **now ignored** | Fixed: `loadLocal()` removed from `useWorkDiaries.ts` |
| `elkayam_crews` localStorage key | Old operational data — **now ignored** | Fixed: `loadLocal()` removed from `useCrews.ts` |
| `elkayam_catalog` localStorage key | Old operational data — **now ignored** | Fixed: `loadLocal()` removed from `useCatalog.ts` |
| `elkayam_order_draft` localStorage key | Unsaved form draft — **safe** | Keep: cleared on submit (`localStorage.removeItem` at submit) |
| `elkayam_cost_rates` localStorage key | Read-only config fallback — **safe** | Keep: never writes to Supabase |
| `scripts/verify-phase36.ts` direct DB inserts | Verification test data left in DB | Fixed: added `try/finally` cleanup guard |
| `scripts/verify-phase34.ts` direct DB inserts | Verification test data (catalog only) | Fixed: added `try/finally` cleanup guard |
| `scripts/verify-phase33.ts` direct DB inserts | Already had `try/finally` | No change needed |
| `scripts/verify-consumption.ts` direct DB inserts | Already had `try/finally` | No change needed |

---

## 3. Tables Inspected and Row Counts After Final Cleanup

### Operational Tables (must be 0 for clean start)

| Table | Rows After Cleanup | Classification |
|-------|-------------------|----------------|
| work_orders | 0 ✓ | Operational |
| customers | 0 ✓ | Operational |
| work_diaries | 0 ✓ | Operational |
| crews | 0 ✓ | Pilot (user confirmed: delete) |
| order_problems | 0 ✓ | Operational (child of work_orders) |
| order_activities | 0 ✓ | Operational (child of work_orders) |
| profitability_snapshots | 0 ✓ | Operational (generated per completed order) |
| inventory_movements | 0 ✓ | Operational |
| inventory_consumptions | 0 ✓ | Operational |
| inventory_reservations | 0 ✓ | Operational |
| delivery_notes | 0 ✓ | Operational |
| delivery_note_items | 0 ✓ | Operational (child of delivery_notes) |
| purchase_recommendations | 0 ✓ | Operational |
| agent_tasks | 0 ✓ | Operational |
| agent_exceptions | 0 ✓ | Operational |
| agent_approvals | 0 ✓ | Operational |
| agent_activity_feed | 0 ✓ | Operational |
| agent_decisions | 0 ✓ | Operational |
| agent_action_logs | 0 ✓ | Operational |
| whatsapp_messages | 0 ✓ | Operational |
| communication_messages | 0 ✓ | Operational |
| communication_threads | 0 ✓ | Operational |
| suppliers | 0 ✓ | Operational |

### Master Data Tables (must be preserved)

| Table | Rows | Classification |
|-------|------|----------------|
| agents | 12 ✓ | Master — 8 core agents + 4 seeded in phase2 |
| equipment | 19 ✓ | Master — real company fleet (seeded 2026-05-18) |
| catalog_items | 37 ✓ | Master — real safety equipment catalog |
| cost_rates | 1 ✓ | Master — cost rate config (id=1) |
| profiles | 4 ✓ | Master — user accounts |
| counters | order=0, diary=0 ✓ | Reset — next order = #1 |

---

## 4. Root Cause: Why Cleanup Appeared Successful While Old Data Still Appeared

Two independent root causes combined:

### Root Cause A: localStorage Re-Seeding Loop (now fixed)
The app had a "migration" pattern: if Supabase returns empty + localStorage has data → upsert localStorage data to Supabase. After cleanup deletes Supabase data to 0, any browser with `elkayam_orders` / `elkayam_customers` etc. in localStorage would immediately re-populate Supabase on the next page load.

**Fix:** Removed all localStorage reads, writes, and seeding from all 5 operational modules (`useOrders.ts`, `CustomersContext.tsx`, `useWorkDiaries.ts`, `useCrews.ts`, `useCatalog.ts`). Committed `4095626`.

### Root Cause B: Verification Scripts Without Guaranteed Cleanup
`scripts/verify-phase36.ts` was run twice against production Supabase. Its cleanup function was not guarded with `try/finally`, so if any test or DB call threw an unexpected error, cleanup was skipped. Records (`P36-MAPPED-*`, `P36-NOINV-*`, `P36-UNMAPPED-*`, `P36-DIARY-*`) were left permanently in `work_orders` and `work_diaries`.

These records subsequently entered localStorage via `saveLocal()` (now removed) and survived later cleanups via re-seeding.

**Fix:** Added `try/finally` around test execution in `verify-phase36.ts` and `verify-phase34.ts`.

### Why the Previous Audit Missed This
The audit verified DB counts at a single point in time (0 after deletion) but did not verify that counts stayed at 0 **after the app was opened in a browser**. The re-seeding fired on the next page load, after the audit check.

---

## 5. Fixes Applied

1. **Removed localStorage seeding from 5 operational modules** — `4095626` — prevents any browser from restoring deleted data to Supabase
2. **Added `try/finally` cleanup guards** to `verify-phase36.ts` and `verify-phase34.ts` — prevents future test runs from leaving records in production DB
3. **Deleted all 22 operational tables to 0** — including the previously-missed `work_diaries` (25 rows) and the re-seeded `work_orders` (14 rows) and `crews` (2 rows)

---

## 6. What Browser Storage Remains and Why It Is Safe

After the fix, browser localStorage may still contain keys:
- `elkayam_orders` — exists but **never read** by the new code
- `elkayam_customers` — exists but **never read** by the new code
- `elkayam_work_diaries` — exists but **never read** by the new code
- `elkayam_crews` — exists but **never read** by the new code
- `elkayam_catalog` — exists but **never read** by the new code
- `elkayam_order_draft` — safe: unsaved form draft, always cleared on submit
- `elkayam_cost_rates` — safe: read-only config fallback, never written to Supabase

**Proof:** `grep -rn "elkayam_orders\|elkayam_customers\|elkayam_work_diaries\|elkayam_crews\|elkayam_catalog" src/` returns zero results from active code. The keys exist in browser storage but no code path reads them.

---

## 7. Repeatable Cleanup Process (Authoritative Checklist)

### Pre-conditions
- [ ] New no-seeding code deployed to production
- [ ] User browser does a hard refresh (Cmd+Shift+R) after deployment

### Step 1: Delete all operational tables
```sql
-- Run in order (child tables first where FK constraints exist)
DELETE FROM order_problems;
DELETE FROM order_activities;
DELETE FROM work_orders;
DELETE FROM work_diaries;
DELETE FROM customers;
DELETE FROM crews;
DELETE FROM inventory_consumptions;
DELETE FROM inventory_movements;
DELETE FROM inventory_reservations;
DELETE FROM delivery_note_items;
DELETE FROM delivery_notes;
DELETE FROM purchase_recommendations;
DELETE FROM profitability_snapshots;
DELETE FROM agent_tasks;
DELETE FROM agent_exceptions;
DELETE FROM agent_approvals;
DELETE FROM agent_activity_feed;
DELETE FROM agent_decisions;
DELETE FROM agent_action_logs;
DELETE FROM whatsapp_messages;
DELETE FROM communication_messages;
DELETE FROM communication_threads;
DELETE FROM suppliers;
```

### Step 2: Reset counters
```sql
UPDATE counters SET value = 0 WHERE key IN ('order', 'diary');
```

### Step 3: Verify immediately after deletion (before any browser load)
Run row counts on all tables above — all must be 0.

### Step 4: Load the app in a browser (hard refresh)
Open the app and navigate through all major screens.

### Step 5: Re-verify row counts after page load
Run the same row counts again — all must STILL be 0.

This post-load check is mandatory. Without it, a re-seeding loop would be invisible.

### Step 6: UI verification checklist
- [ ] Orders screen shows empty state
- [ ] Customers screen shows empty state
- [ ] Weekly Schedule shows empty state
- [ ] Work Diaries screen shows empty state
- [ ] Warehouse screen shows empty state
- [ ] Graphics queue shows empty state
- [ ] Fabrication queue shows empty state
- [ ] Accounting: all 6 tabs show 0 records
- [ ] Dashboard: KPI counters all show 0
- [ ] Agent Command Center: no exceptions, no tasks
- [ ] No workflow alerts (no orders to trigger them)
- [ ] Profitability: empty state

### Master data to verify preserved
- [ ] Catalog: 37 items present
- [ ] Equipment: 19 items present
- [ ] Agents: 12 present
- [ ] Profiles: user accounts intact
- [ ] Cost rates: 1 row present
- [ ] Counters: order=0, diary=0

---

## 8. Browser Verification Instructions for User

After confirming DB counts are 0, open the app and verify each screen:

1. **Do a hard refresh first** — Cmd+Shift+R (Mac) to clear cached JS bundles
2. Check `/orders` — should show "אין הזמנות" or empty table
3. Check `/accounting` — all 6 tabs (orders, work-diaries, billing, invoiced, archive, diary-archive) should show 0 records
4. Check `/customers` — should show empty state
5. Check `/schedule` (weekly schedule) — should show empty with no order cards
6. Check `/work-diary` — should show empty state
7. Check `/` (dashboard) — KPI numbers should all be 0
8. Check `/agents` — agent exceptions/tasks panels should be empty
9. Check `/graphics`, `/fabrication`, `/warehouse` — all should show empty queues

If any screen shows data after a hard refresh + confirmed 0 DB counts, the source is NOT localStorage (since new code ignores it) and MUST be traced to a DB table not included in the cleanup.
