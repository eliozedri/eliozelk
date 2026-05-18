# QA / Coordination Anomaly Detection — Fabrication Layer

**Date:** 2026-05-18  
**Status:** Approved for implementation

## Business Principle

Human department users perform the real work. The fabrication user clicks "ready" → system records it. The fabrication user clicks "completed" → system records it. QA/Coordination monitors the recorded state, detects anomalies, and surfaces alerts. The Operations Manager is escalated only when a real decision or unresolved exception is required — not as a routine approver.

## Scope (this spec)

- `fabrication-ready-not-closed`: fabrication marked ready but order not moving to `ready_installation`
- `fab-order-status-mismatch`: internal inconsistency between fabrication sub-lifecycle and parent order lifecycle
- False-positive protections for each rule
- Alert payload structured to support future manual "Create Problem" action

**Deferred:** auto OrderProblem creation, server-side scheduled scans, activity feed writes, new DB categories, warehouseReadyAt/graphicsReadyAt patterns.

## New Field: `fabricationReadyAt`

A human-action audit timestamp. Set precisely when the fabrication user clicks "סמן כמוכן" (mark ready). Never set by QA, agents, or automated processes.

- Source of truth for staleness: how long has this order been sitting in `fabricationStatus: "ready"` without the office closing it to `ready_installation`?
- Fallback to `updatedAt` when null (backward compat with orders that predate this field).

## Alert Types

### Rule 1: `fab-ready-not-closed`

**Trigger:** `fabricationRequired === true && fabricationStatus === "ready" && status === "production"`

This means the fabrication team finished their work, but the order is still stuck in production — the office hasn't moved it to `ready_installation`. The longer it sits, the higher the severity.

| Threshold | Severity |
|-----------|----------|
| ≥ 12h    | critical |
| ≥ 6h     | critical (urgent bucket — message says "דחוף") |
| ≥ 4h     | warn |
| ≥ 2h     | warn (urgent bucket) |

**Reference timestamp:** `fabricationReadyAt ?? updatedAt`

**False-positive protections:**
- Skip orders where `fabricationStatus !== "ready"` (already moved on)
- Skip `status !== "production"` (already closed by office or cancelled)
- Skip `fabricationRequired !== true`

### Rule 2: `fab-order-status-mismatch`

Detects five internal consistency violations:

| Case | Condition | Message |
|------|-----------|---------|
| A | fabricationStatus: completed, orderStatus: production | מסגרייה הושלמה — ההזמנה לא הועברה לשלב הבא |
| B | fabricationStatus: ready/completed, orderStatus: graphics_* | מצב מסגרייה מתקדם מדי ביחס לסטטוס ההזמנה |
| C | fabricationStatus: in_progress/ready/completed, orderStatus: draft | הזמנה בטיוטה עם מסגרייה בתהליך |
| D | fabricationStatus: acknowledged+, orderStatus: completed | מסגרייה פעילה על הזמנה סגורה |
| E | fabricationStatus: acknowledged+, orderStatus: cancelled | מסגרייה פעילה על הזמנה מבוטלת |

**False-positive protections:**
- Cases A/B/C/D only fire for `fabricationRequired === true`
- Case E fires regardless (cancelled with active fab is always wrong)
- Cases D/E skip if `fabricationStatus === "pending"` (never acknowledged — no real anomaly)

## Extended WorkflowAlert Interface

```ts
interface WorkflowAlert {
  // existing fields ...
  recommendedAction?: string;       // human-readable next step for QA
  escalationTarget?: "department" | "qa" | "operations_manager";
  affectedOrders?: AffectedOrderContext[];  // per-order data for future Create Problem
}

interface AffectedOrderContext {
  id: string;
  orderNumber: string;
  customer?: string;
  fabricationStatus?: FabricationStatus;
  orderStatus: WorkOrderStatus;
  hoursStuck: number;
  recommendedDepartmentAction: string;
}
```

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260528000000_fabrication_ready_at.sql` | ADD COLUMN fabrication_ready_at TIMESTAMPTZ |
| `src/types/workOrder.ts` | +`fabricationReadyAt?: string \| null` |
| `src/lib/workflowAlertTypes.ts` | NEW — shared types (AlertSeverity, AlertDepartment, AffectedOrderContext, WorkflowAlert, DEPT_LABELS) |
| `src/hooks/useWorkflowAlerts.ts` | Import from types file, merge `checkFabricationAnomalies()` results |
| `src/hooks/useOrders.ts` | +`fabricationReadyAt` in COLUMN_MAP, fromRow, toRow |
| `src/components/Fabrication/index.tsx` | Set `fabricationReadyAt: now` in `doAdvance()` when `next === "ready"` |
| `src/lib/fabricationAnomalyRules.ts` | NEW — pure `checkFabricationAnomalies(orders, nowMs)` |
