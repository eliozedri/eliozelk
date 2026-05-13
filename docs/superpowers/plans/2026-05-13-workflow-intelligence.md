# Sections 4–5: Workflow Intelligence & Manager Visibility

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the order lifecycle state machine, detect stuck/overdue orders across all pipeline stages, surface SLA-aware alerts to managers in real time, and prevent invalid workflow transitions.

**Architecture:** A pure-function `workflowEngine.ts` defines the business rules (transition map, per-stage SLA thresholds, stage entry time resolution, fabrication prerequisite guard). A `useWorkflowAlerts` hook computes structured alerts from live order state. The Dashboard gains a Stage Health panel (bottleneck radar) and replaces its thin inline alerts. `useNotifications` gains critical-count fields for sidebar badges. `updateOrderStatus` is guarded by the transition map. The OrdersTable gains an age-in-stage SLA indicator per row and a fabrication-check guard on the `production → ready_installation` button.

**Tech Stack:** TypeScript, React hooks, Tailwind CSS — no new dependencies.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/workflowEngine.ts` | **CREATE** | Valid transitions, SLA thresholds, stage entry time, canTransition guard, canMarkReadyForInstallation |
| `src/hooks/useWorkflowAlerts.ts` | **CREATE** | Computes structured `WorkflowAlert[]` from live orders across all pipeline stages |
| `src/hooks/useOrders.ts` | **MODIFY** | Guard `updateOrderStatus` with `canTransition` + fabrication prerequisite check |
| `src/hooks/useNotifications.ts` | **MODIFY** | Add `criticalAlerts` (red-SLA orders) and `stuckOrders` (warn+ threshold) counts |
| `src/components/Dashboard/index.tsx` | **MODIFY** | Use `useWorkflowAlerts`, update `AlertsSection` for new type, add Stage Health panel |
| `src/components/OrdersTable/index.tsx` | **MODIFY** | Age-in-stage SLA dot in status cell, fabrication guard on ready_installation button |

---

## Task 1: Workflow Engine — pure business rules

**Files:**
- Create: `src/lib/workflowEngine.ts`

This module has **no React dependency** — pure functions only. Everything downstream imports from here.

- [ ] **Step 1: Create `src/lib/workflowEngine.ts`**

```typescript
import type { WorkOrder, WorkOrderStatus } from "@/types/workOrder";

// ── Valid status transitions ──────────────────────────────────────────────
// Finite state machine for the order lifecycle.
// updateOrderStatus enforces this — no jump can skip a stage.
export const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  graphics_pending:   ["graphics_active", "cancelled"],
  graphics_active:    ["graphics_done",   "cancelled"],
  graphics_done:      ["production",      "cancelled"],
  production:         ["ready_installation", "cancelled"],
  ready_installation: ["completed",       "cancelled"],
  completed:          [],
  cancelled:          [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

// Business rule: production → ready_installation requires fabrication complete.
export function canMarkReadyForInstallation(
  order: WorkOrder
): { ok: boolean; reason?: string } {
  if (!order.fabricationRequired) return { ok: true };
  if (order.fabricationStatus === "completed") return { ok: true };
  const label =
    order.fabricationStatus === "issue" ? "בעיה בייצור" :
    order.fabricationStatus === "in_progress" ? "בייצור עדיין פעיל" :
    order.fabricationStatus === "ready" ? "מוכן — המתן לאישור הושלמה" :
    order.fabricationStatus === "acknowledged" ? "אישור קבלה — טרם הושלם" :
    "טרם הושלם";
  return { ok: false, reason: `ייצור מסגרייה: ${label}` };
}

// ── Stage entry timestamps ────────────────────────────────────────────────
// Returns the best available timestamp for when the order entered its current
// status. Stages with dedicated columns use them; others fall back to updatedAt
// which is set by the DB trigger on every status change.
export function stageEntryTime(order: WorkOrder): string {
  switch (order.status) {
    case "graphics_pending":   return order.graphicsSentAt ?? order.createdAt;
    case "graphics_active":    return order.graphicsAcknowledgedAt ?? order.updatedAt;
    case "graphics_done":      return order.graphicsCompletedAt ?? order.updatedAt;
    case "production":         return order.updatedAt;
    case "ready_installation": return order.readyForExecutionAt ?? order.updatedAt;
    default:                   return order.updatedAt;
  }
}

export function hoursInCurrentStage(order: WorkOrder, nowMs = Date.now()): number {
  return (nowMs - new Date(stageEntryTime(order)).getTime()) / 3_600_000;
}

// ── Per-stage SLA thresholds ──────────────────────────────────────────────
// warnH: hours before yellow warning; criticalH: hours before red critical.
// Urgent orders use half the threshold (factor 0.5 applied in getStageSlaColor).
export interface SlaThreshold {
  warnH: number;
  criticalH: number;
  dept: "graphics" | "fabrication" | "office" | "schedule" | "accounting";
}

export const STAGE_SLA: Partial<Record<WorkOrderStatus, SlaThreshold>> = {
  graphics_pending:   { warnH: 24,  criticalH: 48,  dept: "graphics"     },
  graphics_active:    { warnH: 48,  criticalH: 72,  dept: "graphics"     },
  graphics_done:      { warnH: 24,  criticalH: 48,  dept: "office"       },
  production:         { warnH: 72,  criticalH: 120, dept: "fabrication"  },
  ready_installation: { warnH: 24,  criticalH: 72,  dept: "schedule"     },
};

export type StageSlaColor = "green" | "yellow" | "red" | "gray";

export function getStageSlaColor(
  order: WorkOrder,
  nowMs = Date.now()
): StageSlaColor {
  const sla = STAGE_SLA[order.status];
  if (!sla) return "gray";
  const hours = hoursInCurrentStage(order, nowMs);
  const factor = order.priority === "urgent" ? 0.5 : 1;
  if (hours >= sla.criticalH * factor) return "red";
  if (hours >= sla.warnH   * factor)   return "yellow";
  return "green";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/workflowEngine.ts
git commit -m "feat(workflow): add workflowEngine — transition map, SLA thresholds, stage entry time"
```

---

## Task 2: Workflow Alerts Hook

**Files:**
- Create: `src/hooks/useWorkflowAlerts.ts`

Replaces the hardcoded 3-alert `useMemo` in `Dashboard/index.tsx` with a comprehensive, type-safe alert set covering all pipeline stages.

- [ ] **Step 1: Create `src/hooks/useWorkflowAlerts.ts`**

```typescript
"use client";

import { useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { stageEntryTime, getStageSlaColor } from "@/lib/workflowEngine";

export type AlertSeverity = "warn" | "critical";
export type AlertDepartment = "graphics" | "fabrication" | "office" | "schedule" | "accounting";

export interface WorkflowAlert {
  id: string;
  severity: AlertSeverity;
  department: AlertDepartment;
  message: string;
  count: number;
  href: string;
  orderNumbers?: string[];
}

const DEPT_LABELS: Record<AlertDepartment, string> = {
  graphics:    "גרפיקה",
  fabrication: "מסגרייה",
  office:      "משרד",
  schedule:    "תיאום",
  accounting:  "הנה״ח",
};

export { DEPT_LABELS };

export function useWorkflowAlerts(): WorkflowAlert[] {
  const { orders } = useOrdersContext();

  return useMemo(() => {
    const now = Date.now();
    const alerts: WorkflowAlert[] = [];

    function hoursElapsed(ts: string): number {
      return (now - new Date(ts).getTime()) / 3_600_000;
    }

    // ── Graphics: unacknowledged orders ─────────────────────────────────
    const pendingCritical = orders.filter(
      o => o.status === "graphics_pending" && hoursElapsed(stageEntryTime(o)) >= 48
    );
    const pendingWarn = orders.filter(
      o => o.status === "graphics_pending" &&
           hoursElapsed(stageEntryTime(o)) >= 24 &&
           hoursElapsed(stageEntryTime(o)) < 48
    );
    if (pendingCritical.length > 0) {
      alerts.push({
        id: "graphics-pending-critical",
        severity: "critical",
        department: "graphics",
        message: `${pendingCritical.length} הזמנות ממתינות לאישור קבלה בגרפיקה מעל 48 שעות`,
        count: pendingCritical.length,
        href: "/graphics",
        orderNumbers: pendingCritical.map(o => o.orderNumber),
      });
    } else if (pendingWarn.length > 0) {
      alerts.push({
        id: "graphics-pending-warn",
        severity: "warn",
        department: "graphics",
        message: `${pendingWarn.length} הזמנות ממתינות לאישור קבלה (מעל 24 שעות)`,
        count: pendingWarn.length,
        href: "/graphics",
        orderNumbers: pendingWarn.map(o => o.orderNumber),
      });
    }

    // ── Graphics: in-progress too long ──────────────────────────────────
    const activeCritical = orders.filter(
      o => o.status === "graphics_active" && hoursElapsed(stageEntryTime(o)) >= 72
    );
    const activeWarn = orders.filter(
      o => o.status === "graphics_active" &&
           hoursElapsed(stageEntryTime(o)) >= 48 &&
           hoursElapsed(stageEntryTime(o)) < 72
    );
    if (activeCritical.length > 0) {
      alerts.push({
        id: "graphics-active-critical",
        severity: "critical",
        department: "graphics",
        message: `${activeCritical.length} הזמנות בטיפול גרפיקה מעל 72 שעות`,
        count: activeCritical.length,
        href: "/graphics",
        orderNumbers: activeCritical.map(o => o.orderNumber),
      });
    } else if (activeWarn.length > 0) {
      alerts.push({
        id: "graphics-active-warn",
        severity: "warn",
        department: "graphics",
        message: `${activeWarn.length} הזמנות בטיפול גרפיקה מעל 48 שעות`,
        count: activeWarn.length,
        href: "/graphics",
      });
    }

    // ── Graphics done: not moved to production ───────────────────────────
    const graphicsDoneAll = orders.filter(
      o => o.status === "graphics_done" && o.graphicsCompletedAt
    );
    const gdCritical = graphicsDoneAll.filter(
      o => hoursElapsed(o.graphicsCompletedAt!) >= 48
    );
    const gdWarn = graphicsDoneAll.filter(
      o => hoursElapsed(o.graphicsCompletedAt!) >= 24 &&
           hoursElapsed(o.graphicsCompletedAt!) < 48
    );
    if (gdCritical.length > 0) {
      alerts.push({
        id: "graphics-done-critical",
        severity: "critical",
        department: "office",
        message: `${gdCritical.length} הזמנות הושלמו בגרפיקה ולא הועברו לייצור (מעל 48 שעות)`,
        count: gdCritical.length,
        href: "/orders",
        orderNumbers: gdCritical.map(o => o.orderNumber),
      });
    } else if (gdWarn.length > 0) {
      alerts.push({
        id: "graphics-done-warn",
        severity: "warn",
        department: "office",
        message: `${gdWarn.length} הזמנות הושלמו בגרפיקה ממתינות להעברה לייצור`,
        count: gdWarn.length,
        href: "/orders",
        orderNumbers: gdWarn.map(o => o.orderNumber),
      });
    }

    // ── Production: stuck ────────────────────────────────────────────────
    const prodCritical = orders.filter(
      o => o.status === "production" && hoursElapsed(stageEntryTime(o)) >= 120
    );
    const prodWarn = orders.filter(
      o => o.status === "production" &&
           hoursElapsed(stageEntryTime(o)) >= 72 &&
           hoursElapsed(stageEntryTime(o)) < 120
    );
    if (prodCritical.length > 0) {
      alerts.push({
        id: "production-critical",
        severity: "critical",
        department: "fabrication",
        message: `${prodCritical.length} הזמנות בייצור מעל 5 ימים`,
        count: prodCritical.length,
        href: "/orders",
      });
    } else if (prodWarn.length > 0) {
      alerts.push({
        id: "production-warn",
        severity: "warn",
        department: "fabrication",
        message: `${prodWarn.length} הזמנות בייצור מעל 3 ימים`,
        count: prodWarn.length,
        href: "/orders",
      });
    }

    // ── Fabrication: issue status (blocked) ──────────────────────────────
    const fabIssues = orders.filter(
      o => o.fabricationRequired && o.fabricationStatus === "issue"
    );
    if (fabIssues.length > 0) {
      alerts.push({
        id: "fabrication-issue",
        severity: "critical",
        department: "fabrication",
        message: `${fabIssues.length} הזמנות עם בעיה בייצור מסגרייה — דרוש טיפול`,
        count: fabIssues.length,
        href: "/fabrication",
        orderNumbers: fabIssues.map(o => o.orderNumber),
      });
    }

    // ── Schedule: ready but unscheduled ─────────────────────────────────
    const unscheduledAll = orders.filter(
      o => o.status === "ready_installation" && !o.scheduledDate
    );
    const unsCritical = unscheduledAll.filter(
      o => hoursElapsed(stageEntryTime(o)) >= 72
    );
    const unsWarn = unscheduledAll.filter(
      o => hoursElapsed(stageEntryTime(o)) >= 24 &&
           hoursElapsed(stageEntryTime(o)) < 72
    );
    if (unsCritical.length > 0) {
      alerts.push({
        id: "unscheduled-critical",
        severity: "critical",
        department: "schedule",
        message: `${unsCritical.length} הזמנות מוכנות להתקנה ללא תיאום מעל 3 ימים`,
        count: unsCritical.length,
        href: "/schedule",
        orderNumbers: unsCritical.map(o => o.orderNumber),
      });
    } else if (unsWarn.length > 0) {
      alerts.push({
        id: "unscheduled-warn",
        severity: "warn",
        department: "schedule",
        message: `${unsWarn.length} הזמנות מוכנות להתקנה ממתינות לתיאום`,
        count: unsWarn.length,
        href: "/schedule",
      });
    }

    // ── Accounting: completed but uninvoiced ────────────────────────────
    const uninvoiced = orders.filter(
      o => o.status === "completed" &&
           (!o.accountingStatus || o.accountingStatus === "pending") &&
           !o.invoicedAt
    );
    const accCritical = uninvoiced.filter(
      o => hoursElapsed(o.updatedAt) >= 168  // 7 days
    );
    const accWarn = uninvoiced.filter(
      o => hoursElapsed(o.updatedAt) >= 72 && hoursElapsed(o.updatedAt) < 168
    );
    if (accCritical.length > 0) {
      alerts.push({
        id: "accounting-critical",
        severity: "critical",
        department: "accounting",
        message: `${accCritical.length} הזמנות ממתינות לחיוב מעל שבוע`,
        count: accCritical.length,
        href: "/accounting",
      });
    } else if (accWarn.length > 0) {
      alerts.push({
        id: "accounting-warn",
        severity: "warn",
        department: "accounting",
        message: `${accWarn.length} הזמנות ממתינות לחיוב מעל 3 ימים`,
        count: accWarn.length,
        href: "/accounting",
      });
    }

    // ── Open problems ────────────────────────────────────────────────────
    const ordersWithProblems = orders.filter(
      o => (o.problems ?? []).some(p => p.status !== "resolved" && p.status !== "cancelled")
    );
    if (ordersWithProblems.length > 0) {
      const total = ordersWithProblems.reduce(
        (s, o) =>
          s + (o.problems ?? []).filter(p => p.status !== "resolved" && p.status !== "cancelled").length,
        0
      );
      alerts.push({
        id: "open-problems",
        severity: total >= 3 ? "critical" : "warn",
        department: "office",
        message: `${total} בעיות פתוחות ב-${ordersWithProblems.length} הזמנות`,
        count: total,
        href: "/orders",
        orderNumbers: ordersWithProblems.map(o => o.orderNumber),
      });
    }

    // ── Urgent: active over 24h ──────────────────────────────────────────
    const urgentStuck = orders.filter(
      o => o.priority === "urgent" &&
           o.status !== "completed" &&
           o.status !== "cancelled" &&
           hoursElapsed(o.createdAt) >= 24
    );
    if (urgentStuck.length > 0) {
      alerts.push({
        id: "urgent-stuck",
        severity: "critical",
        department: "office",
        message: `${urgentStuck.length} הזמנות דחופות פעילות מעל 24 שעות`,
        count: urgentStuck.length,
        href: "/orders",
        orderNumbers: urgentStuck.map(o => o.orderNumber),
      });
    }

    // Sort: critical first
    return alerts.sort((a, b) =>
      (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1)
    );
  }, [orders]);
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useWorkflowAlerts.ts
git commit -m "feat(workflow): add useWorkflowAlerts — comprehensive per-stage SLA breach detection"
```

---

## Task 3: Guard `updateOrderStatus` in `useOrders.ts`

**Files:**
- Modify: `src/hooks/useOrders.ts` (lines ~517–526 — `updateOrderStatus` callback)

Add two guards:
1. `canTransition(original.status, status)` — silently blocks invalid transitions with a console warning
2. `canMarkReadyForInstallation(original)` — blocks `production → ready_installation` if fabrication is required but not complete

- [ ] **Step 1: Add import at top of `useOrders.ts`**

Find the existing import block near the top of the file (after the `"use client"` directive) and add:

```typescript
import { canTransition, canMarkReadyForInstallation } from "@/lib/workflowEngine";
```

- [ ] **Step 2: Replace the `updateOrderStatus` callback**

Find this block (around line 517):

```typescript
  // ── updateOrderStatus ──────────────────────────────────────────────────
  const updateOrderStatus = useCallback((id: string, status: WorkOrderStatus) => {
    const extra: Partial<WorkOrder> = {};
    if (status === "ready_installation") {
      const original = ref.current.find(o => o.id === id);
      if (original && !original.readyForExecutionAt) {
        extra.readyForExecutionAt = new Date().toISOString();
      }
    }
    _patchOrder(id, { status, ...extra });
  }, [_patchOrder]);
```

Replace it with:

```typescript
  // ── updateOrderStatus ──────────────────────────────────────────────────
  const updateOrderStatus = useCallback((id: string, status: WorkOrderStatus) => {
    const original = ref.current.find(o => o.id === id);
    if (!original) return;

    if (!canTransition(original.status, status)) {
      console.warn(
        `[orders] blocked invalid transition: ${original.status} → ${status} on order ${id}`
      );
      return;
    }

    if (status === "ready_installation") {
      const fabCheck = canMarkReadyForInstallation(original);
      if (!fabCheck.ok) {
        console.warn(
          `[orders] blocked production → ready_installation: ${fabCheck.reason} on order ${id}`
        );
        return;
      }
    }

    const extra: Partial<WorkOrder> = {};
    if (status === "ready_installation" && !original.readyForExecutionAt) {
      extra.readyForExecutionAt = new Date().toISOString();
    }
    _patchOrder(id, { status, ...extra });
  }, [_patchOrder]);
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useOrders.ts
git commit -m "feat(workflow): guard updateOrderStatus — transition map + fabrication prerequisite check"
```

---

## Task 4: Extend `useNotifications` with critical/stuck counts

**Files:**
- Modify: `src/hooks/useNotifications.ts`

Add `criticalAlerts` (orders in red SLA or fabrication-issue) and `stuckOrders` (orders past warn threshold in any active stage) to the existing `NotificationCounts` interface.

- [ ] **Step 1: Add import**

At the top of `src/hooks/useNotifications.ts`, add:

```typescript
import { getStageSlaColor } from "@/lib/workflowEngine";
```

- [ ] **Step 2: Extend `NotificationCounts` interface**

Find the `export interface NotificationCounts {` block and add two fields to it:

```typescript
  stuckOrders: number;      // orders past warn threshold in any active stage
  criticalAlerts: number;   // orders in critical SLA breach or fabrication issue
```

- [ ] **Step 3: Add computations inside `useMemo`**

In the `return useMemo(() => {` block, after the existing `urgentActive` computation, add:

```typescript
    const activeStatuses = new Set([
      "graphics_pending", "graphics_active", "graphics_done",
      "production", "ready_installation",
    ] as const);

    const stuckOrders = orders.filter(o => {
      if (!activeStatuses.has(o.status as typeof activeStatuses extends Set<infer T> ? T : never)) return false;
      const color = getStageSlaColor(o);
      return color === "yellow" || color === "red";
    }).length;

    const criticalAlerts = orders.filter(o => {
      if (o.status === "completed" || o.status === "cancelled") return false;
      return getStageSlaColor(o) === "red" ||
             (o.fabricationRequired && o.fabricationStatus === "issue");
    }).length;
```

- [ ] **Step 4: Add fields to the return object**

In the `return { ... }` at the end of the `useMemo`, add:

```typescript
      stuckOrders,
      criticalAlerts,
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useNotifications.ts
git commit -m "feat(notifications): add criticalAlerts + stuckOrders SLA counts"
```

---

## Task 5: Dashboard — Stage Health Panel + use `useWorkflowAlerts`

**Files:**
- Modify: `src/components/Dashboard/index.tsx`

Three changes:
1. Replace the inline `alerts` useMemo with `useWorkflowAlerts()`
2. Update `AlertsSection` to handle the new `WorkflowAlert` type (severity + department badge + affected order numbers)
3. Add a `StageHealthPanel` (bottleneck radar) below the pipeline section

- [ ] **Step 1: Update imports at top of `Dashboard/index.tsx`**

Replace:

```typescript
import { STATUS_LABELS } from "@/types/workOrder";
import type { WorkOrder } from "@/types/workOrder";
```

With:

```typescript
import { STATUS_LABELS } from "@/types/workOrder";
import type { WorkOrder, WorkOrderStatus } from "@/types/workOrder";
import { useWorkflowAlerts, DEPT_LABELS } from "@/hooks/useWorkflowAlerts";
import type { WorkflowAlert } from "@/hooks/useWorkflowAlerts";
import { getStageSlaColor, hoursInCurrentStage } from "@/lib/workflowEngine";
```

- [ ] **Step 2: Remove the `Alert` local interface and the `alerts` useMemo**

Delete these two blocks from `DashboardPage`:

```typescript
interface Alert {
  id: string;
  message: string;
  level: "warn" | "error";
  href: string;
}
```

And the entire:

```typescript
  const alerts = useMemo((): Alert[] => {
    // ... the whole useMemo block ...
  }, [orders]);
```

- [ ] **Step 3: Add `useWorkflowAlerts()` call inside `DashboardPage`**

Inside `DashboardPage`, replace references to `alerts` with:

```typescript
  const alerts = useWorkflowAlerts();
```

(No dependency array — the hook handles its own memoization.)

- [ ] **Step 4: Replace `AlertsSection` component**

Find the entire `function AlertsSection` component and replace it with:

```typescript
// ─── Alerts Section ────────────────────────────────────────────────────────

const SEVERITY_STYLE = {
  critical: { icon: "text-red-500",   bg: "bg-red-50",   badge: "bg-red-100 text-red-700"   },
  warn:     { icon: "text-amber-500", bg: "bg-amber-50", badge: "bg-amber-100 text-amber-700" },
};

function AlertsSection({ alerts }: { alerts: WorkflowAlert[] }) {
  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy-900">התראות לטיפול</h2>
        <div className="flex items-center gap-1.5">
          {criticalCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {criticalCount} קריטי
            </span>
          )}
          {alerts.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {alerts.length}
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {alerts.length === 0 ? (
          <div className="px-5 py-5 text-center">
            <div className="text-2xl mb-1">✓</div>
            <p className="text-xs text-gray-400">אין התראות — הכל תקין</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const style = SEVERITY_STYLE[alert.severity];
            return (
              <Link
                key={alert.id}
                href={alert.href}
                className={`flex items-start gap-3 px-4 py-3 hover:${style.bg} transition-colors`}
              >
                <span className={`${style.icon} mt-0.5 shrink-0`}>
                  <AlertIcon />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 leading-relaxed">{alert.message}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badge}`}>
                      {DEPT_LABELS[alert.department]}
                    </span>
                    {alert.orderNumbers && alert.orderNumbers.length > 0 && (
                      <span className="text-[10px] text-gray-400">
                        {alert.orderNumbers.slice(0, 3).join(", ")}
                        {alert.orderNumbers.length > 3 && ` +${alert.orderNumbers.length - 3}`}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add `StageHealthPanel` component**

Insert this new component into `Dashboard/index.tsx` between `AlertsSection` and `ActivitySection`:

```typescript
// ─── Stage Health Panel ────────────────────────────────────────────────────

interface StageSpec {
  status: WorkOrderStatus;
  label: string;
  deptLabel: string;
}

const STAGE_SPECS: StageSpec[] = [
  { status: "graphics_pending",   label: "ממתינה לגרפיקה", deptLabel: "גרפיקה"   },
  { status: "graphics_active",    label: "בטיפול גרפיקה",  deptLabel: "גרפיקה"   },
  { status: "graphics_done",      label: "גרפיקה הושלמה",  deptLabel: "משרד"     },
  { status: "production",         label: "ייצור",           deptLabel: "מסגרייה"  },
  { status: "ready_installation", label: "מוכן להתקנה",    deptLabel: "תיאום"    },
];

function StageHealthPanel({ orders }: { orders: WorkOrder[] }) {
  const now = Date.now();

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-bold text-navy-900">בריאות צנרת הזמנות</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">זמן בשלב · ירוק = תקין · צהוב = מתעכב · אדום = קריטי</p>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {STAGE_SPECS.map(spec => {
            const stageOrders = orders.filter(o => o.status === spec.status);
            const colors = stageOrders.map(o => getStageSlaColor(o, now));
            const green  = colors.filter(c => c === "green").length;
            const yellow = colors.filter(c => c === "yellow").length;
            const red    = colors.filter(c => c === "red").length;
            const worst  = red > 0 ? "red" : yellow > 0 ? "yellow" : stageOrders.length > 0 ? "green" : "gray";

            const containerCls =
              worst === "red"    ? "bg-red-50 border-red-200" :
              worst === "yellow" ? "bg-amber-50 border-amber-200" :
              worst === "green"  ? "bg-green-50 border-green-100" :
                                   "bg-gray-50 border-gray-100";
            const countCls =
              worst === "red"    ? "text-red-600" :
              worst === "yellow" ? "text-amber-600" :
              worst === "green"  ? "text-green-700" :
                                   "text-gray-300";

            return (
              <div key={spec.status} className={`rounded-xl border p-3 flex flex-col gap-2 ${containerCls}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider truncate">
                    {spec.deptLabel}
                  </span>
                  <span className={`text-2xl font-black leading-none ${countCls}`}>
                    {stageOrders.length}
                  </span>
                </div>
                <div className="text-xs font-medium text-gray-700 leading-tight">{spec.label}</div>
                {stageOrders.length > 0 ? (
                  <div className="flex items-center gap-1 flex-wrap">
                    {red > 0 && (
                      <span className="text-[9px] font-bold text-red-600 bg-red-100 rounded px-1.5 py-0.5">
                        {red} קריטי
                      </span>
                    )}
                    {yellow > 0 && (
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-100 rounded px-1.5 py-0.5">
                        {yellow} מאחר
                      </span>
                    )}
                    {green > 0 && (
                      <span className="text-[9px] font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5">
                        {green} תקין
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-gray-300">ריק</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add `StageHealthPanel` to the Dashboard JSX**

In the `return (...)` of `DashboardPage`, add `<StageHealthPanel orders={orders} />` between `<PipelineSection .../>` and the `<div className="grid grid-cols-1 lg:grid-cols-5 ...">` (the departments + alerts section):

```tsx
        {/* Pipeline */}
        <PipelineSection stages={pipelineStages} />

        {/* Stage Health (bottleneck radar) */}
        <StageHealthPanel orders={orders} />

        {/* Departments + Alerts/Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          ...
        </div>
```

- [ ] **Step 7: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/components/Dashboard/index.tsx
git commit -m "feat(dashboard): Stage Health panel + useWorkflowAlerts — bottleneck radar and comprehensive SLA alerts"
```

---

## Task 6: OrdersTable — Age-in-Stage Indicator + Fabrication Guard

**Files:**
- Modify: `src/components/OrdersTable/index.tsx`

Two changes to `OrderRow`:
1. Add a colored SLA dot next to the status badge (not a new column — added to the existing Status cell) showing how long the order has been in its current stage
2. Disable the `production → ready_installation` button and show a tooltip if fabrication is required but not complete

- [ ] **Step 1: Add imports to `OrdersTable/index.tsx`**

Add to the existing import block at the top:

```typescript
import { getStageSlaColor, hoursInCurrentStage, canMarkReadyForInstallation } from "@/lib/workflowEngine";
```

- [ ] **Step 2: Add `formatStageAge` helper in the Helpers section**

After the existing `relativeTime` function, add:

```typescript
function formatStageAge(hours: number): string {
  if (hours < 1)  return "< 1 שע׳";
  if (hours < 24) return `${Math.round(hours)} שע׳`;
  const days = Math.floor(hours / 24);
  const rem  = Math.round(hours % 24);
  return rem > 0 ? `${days}י ${rem}ש׳` : `${days} ימים`;
}
```

- [ ] **Step 3: Compute SLA data inside `OrderRow`**

In `function OrderRow`, after the existing `const isTerminal = ...` line, add:

```typescript
  const slaColor = !isTerminal ? getStageSlaColor(order) : "gray";
  const stageHours = !isTerminal ? hoursInCurrentStage(order) : 0;
  const fabCheck = order.status === "production"
    ? canMarkReadyForInstallation(order)
    : { ok: true, reason: undefined };
```

- [ ] **Step 4: Update the Status cell in `OrderRow` to include the SLA dot**

Find the Status cell:

```tsx
      {/* Status */}
      <td className="px-3 py-3.5">
        <StatusBadge status={order.status} />
      </td>
```

Replace with:

```tsx
      {/* Status */}
      <td className="px-3 py-3.5">
        <div className="flex flex-col gap-1">
          <StatusBadge status={order.status} />
          {!isTerminal && (
            <div
              className="flex items-center gap-1"
              title={`${formatStageAge(stageHours)} בשלב הנוכחי`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                slaColor === "red"    ? "bg-red-500 animate-pulse" :
                slaColor === "yellow" ? "bg-amber-400" :
                                        "bg-green-500"
              }`} />
              <span className={`text-[10px] font-medium ${
                slaColor === "red"    ? "text-red-500" :
                slaColor === "yellow" ? "text-amber-500" :
                                        "text-green-600"
              }`}>
                {formatStageAge(stageHours)}
              </span>
            </div>
          )}
        </div>
      </td>
```

- [ ] **Step 5: Update the `production → ready_installation` action button**

Find:

```tsx
          {order.status === "production" && (
            <button
              onClick={() => onUpdateStatus(order.id, "ready_installation")}
              className="px-2 py-1 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors whitespace-nowrap"
            >
              מוכן להתקנה
            </button>
          )}
```

Replace with:

```tsx
          {order.status === "production" && (
            <button
              onClick={() => { if (fabCheck.ok) onUpdateStatus(order.id, "ready_installation"); }}
              disabled={!fabCheck.ok}
              title={!fabCheck.ok ? fabCheck.reason : undefined}
              className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                fabCheck.ok
                  ? "text-teal-700 bg-teal-50 hover:bg-teal-100 border-teal-200"
                  : "text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed opacity-60"
              }`}
            >
              מוכן להתקנה
            </button>
          )}
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/components/OrdersTable/index.tsx
git commit -m "feat(orders-table): SLA age indicator per row + fabrication prerequisite guard on ready_installation"
```

---

## Task 7: Final integration check and GitHub push

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 2: Verify no console errors in dev**

```bash
npm run dev 2>&1 | head -30
```

Expected: `✓ Ready` with no TypeScript/module errors.

- [ ] **Step 3: Manual smoke test checklist**

Run the dev server and verify these visually:

- [ ] Dashboard shows Stage Health panel with colored boxes for each active stage
- [ ] Dashboard alerts section shows department badge (e.g., "גרפיקה", "מסגרייה") on each alert
- [ ] Orders table rows show a colored dot + age next to the status badge (e.g., "2 שע׳" in green)
- [ ] An order with `fabricationRequired=true` and `fabricationStatus !== "completed"` has the "מוכן להתקנה" button disabled (grayed + tooltip)
- [ ] Attempting `updateOrderStatus` with an invalid transition logs a `[orders] blocked invalid transition` console warning and does NOT update the order

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| Detect orders stuck in graphics/workshop/accounting/execution | Task 2 (all stages covered) |
| Surface overdue actions visually | Task 5 (AlertsSection) + Task 6 (SLA dot) |
| Expose operational bottlenecks | Task 5 (StageHealthPanel) |
| Manager visibility into company flow | Task 5 (Dashboard) |
| Status transitions deterministic | Task 3 (canTransition guard) |
| Prevent invalid workflow jumps | Task 3 (hard block on invalid transitions) |
| Approval lifecycle consistency | Task 3 (fabrication prerequisite) |
| Blocked/stuck workflow detection | Task 2 (fabrication-issue alert) |
| Overdue operational alerts | Task 2 (per-stage SLA alerts) |
| SLA-aware workflow timing | Task 1 (STAGE_SLA) + Task 6 (row indicator) |
| Department bottleneck visibility | Task 5 (StageHealthPanel per dept) |
| Realtime consistency | Preserved — all changes derive from existing `orders` state |
| Future extensibility | Task 1: add a new status to `VALID_TRANSITIONS` + `STAGE_SLA` — no other files change |
