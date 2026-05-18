# Architecture Optimization Audit — 2026-05-19

## Scope
Safe Category A improvements only. No business logic changes, no DB schema changes, no memoization rewrites, no pagination decisions.

## Category A — Implement Now

### 1. Dead File Deletions (confirmed no importers)
- `src/components/Dashboard/DepartmentLoad.tsx` — never imported, replaced by DepartmentLoadPanel
- `src/hooks/useCustomers.ts` — 6-line migration stub, zero callers remain
- `src/components/OrdersProvider.tsx` — single-line pass-through wrapper
- `src/components/CatalogProvider.tsx` — single-line pass-through wrapper
- `src/components/CostRatesProvider.tsx` — single-line pass-through wrapper
- `src/components/CrewsProvider.tsx` — single-line pass-through wrapper
- `src/components/CustomersProvider.tsx` — single-line pass-through wrapper
- `src/components/WorkDiaryProvider.tsx` — single-line pass-through wrapper
- `src/app/layout.tsx` updated to import providers directly from `src/context/`

### 2. macOS Copy Artifacts (zero code references)
- 311 `* 2.png` files in `public/signs/`
- 5 `* 2.*` files in `public/` root (file 2.svg, globe 2.svg, next 2.svg, vercel 2.svg, window 2.svg)
- 2 `* 2` directories in `public/` (catalog/safety 2, fonts 2)
- 6 empty `* 2` directories in `src/` (app 2, components 2, context 2, data 2, hooks 2, lib 2, types 2)

### 3. Bug Fixes
- `FABRICATION_STATUS_LABELS` in `OrdersTable/index.tsx` — removes local redefinition with wrong `"בביצוע"`, imports canonical from `types/workOrder.ts` (`"בעבודה"`)
- `STATUS_COLORS` in `Accounting/index.tsx` — removes local duplicate, imports from `types/workOrder.ts`

### 4. Supabase Efficiency
- `api/agents/chat/messages/route.ts:26` — narrows `select("*")` to exclude unused `external_message_id, structured_payload`

### 5. dateFormatting utility
- Create `src/lib/dateFormatting.ts` with canonical `formatDate(iso: string): string`
- Consolidate 4 identical UI component versions: Fabrication, Graphics, Warehouse, OrdersTable
- Leave PDF components, Accounting/index.tsx string-split, and accountingExport.ts alone

## Category B — Documented, Not Implemented
- `useWorkflowAlerts` memoization (150+ line useMemo, risk of subtle computation bugs)
- `useOperationalKPIs` dependency chain memoization
- `useOrders.ts` pagination / status filtering (business decision needed)
- Realtime channel unique naming (theoretical risk only, currently safe)
- `Accounting/index.tsx` formatDate string-split migration (affects billing export accuracy)

## Category C — Do Not Touch
- Working orders/billing/diary/inventory flows
- DB schema
- Status type definitions
- Agent scan architecture
- PDF document generators
