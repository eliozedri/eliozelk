# Warehouse QA Anomaly Detection — Timestamp + Rules

**Date:** 2026-05-18  
**Status:** Approved for implementation

## Human-Action Timestamps

Two new fields on `work_orders`, set only by human warehouse user clicks:

| Field | Set when | Who sets it |
|-------|----------|------------|
| `warehouseReadyAt` | Warehouse worker clicks "סמן כמוכן" (mark ready) | `advance()` in Warehouse/index.tsx when `warehouseStatus → "ready"` |
| `warehouseReleasedAt` | Warehouse worker clicks "שחרר לביצוע שטח" (release) | `releaseWarehouseOrder()` in useOrders.ts |

Never set by: QA rules, agent scans, automated processes.

## QA Rules

### Rule W1: warehouse-ready-not-released

Condition: `warehouseRequired && warehouseStatus === "ready"` AND `status NOT IN ["production", "ready_installation", "completed", "cancelled"]`

The `production + warehouseStatus=ready` case is EXCLUDED — it is a legitimate state where the warehouse worker released, but fabrication is still blocking advancement to `ready_installation`. That state resolves naturally when fabrication completes.

The rule targets orders where warehouse marked ready but the release button was never clicked.

Reference timestamp: `warehouseReadyAt ?? updatedAt`

| Threshold | Severity | escalationTarget |
|-----------|----------|-----------------|
| ≥ 12h | critical | operations_manager |
| ≥ 6h | critical (urgent) | qa |
| ≥ 4h | warn | department |
| ≥ 2h | warn (early) | department |

### Rule W2: warehouse/order status mismatch (4 cases)

| Case | Condition | Severity |
|------|-----------|----------|
| A | warehouseStatus=ready, status in graphics_* | warn — warehouse ready before order entered production |
| B | warehouseStatus in [processing,ready], status=completed | warn — order closed but warehouse tracking not finalized |
| C | warehouseStatus in [processing,ready], status=cancelled | critical — active warehouse work on cancelled order |
| D | warehouseRequired && warehouseStatus=pending/null && status=ready_installation | critical — at installation stage but warehouse never prepared |

## design_approval_status Verification

Column EXISTS in DB (migration 20260527000000_work_orders_group2_columns.sql) but is NOT in the `WorkOrder` TypeScript type or `useOrders.ts` mappers. Used only by the graphics-production-agent scan route which reads directly from Supabase (bypasses the TypeScript type). Current runtime risk: LOW. All existing orders have `null` for this field. No UI reads or writes it. Deferred to Phase 2 graphics refactor.

## Files Changed

| File | Type | Change |
|------|------|--------|
| `supabase/migrations/20260528100000_warehouse_action_timestamps.sql` | new | ADD COLUMN warehouse_ready_at, warehouse_released_at |
| `src/types/workOrder.ts` | modified | +warehouseReadyAt, +warehouseReleasedAt |
| `src/hooks/useOrders.ts` | modified | COLUMN_MAP, fromRow, toRow + releaseWarehouseOrder sets warehouseReleasedAt |
| `src/components/Warehouse/index.tsx` | modified | advance() sets warehouseReadyAt when status → "ready" |
| `src/lib/warehouseAnomalyRules.ts` | new | pure checkWarehouseAnomalies(orders, nowMs) |
| `src/hooks/useWorkflowAlerts.ts` | modified | merge warehouse anomaly results |
