import type { WorkOrder, WorkOrderStatus } from "@/types/workOrder";

// Returns true if this order should appear in the weekly schedule candidate list.
// Only ready orders that genuinely require field execution or delivery get scheduled.
export function isSchedulingCandidate(order: WorkOrder): boolean {
  if (order.status !== "ready_installation") return false;
  if (order.orderType === "pickup") return false;
  // equipment_supply always means delivery now; only block legacy self_pickup data
  if (order.orderType === "equipment_supply" && order.fulfillmentMethod === "self_pickup") return false;
  if (order.orderType === "field_work" && order.customerApprovalStatus === "pending") return false;
  return true;
}

// ── Valid status transitions ──────────────────────────────────────────────
// Finite state machine for the order lifecycle.
// graphics_done → ready_installation is allowed for orders without fabrication
// (skip the production stage when no manufacturing work is needed).
export const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  graphics_pending:   ["graphics_active", "cancelled"],
  graphics_active:    ["graphics_done",   "cancelled"],
  graphics_done:      ["production", "ready_installation", "cancelled"],
  production:         ["ready_installation", "cancelled"],
  ready_installation: ["completed",       "cancelled"],
  completed:          [],
  cancelled:          [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

// Business rule: production → ready_installation requires ALL active department gates closed.
// "ready" is an internal department state; only "completed" closes the workflow gate.
// This is the single source of truth for BOTH manual and auto transitions.
export function canMarkReadyForInstallation(
  order: WorkOrder
): { ok: boolean; reason?: string } {
  // Fabrication gate: "completed" required — "ready" is internal, gate stays open
  if (order.fabricationRequired && order.fabricationStatus !== "completed") {
    const label =
      order.fabricationStatus === "issue"        ? "בעיה בייצור" :
      order.fabricationStatus === "in_progress"  ? "בייצור עדיין פעיל" :
      order.fabricationStatus === "ready"        ? "מוכן — ממתין לסגירת שער (הושלמה)" :
      order.fabricationStatus === "acknowledged" ? "אישור קבלה — טרם הושלם" :
                                                   "טרם הושלם";
    return { ok: false, reason: `ייצור מסגרייה: ${label}` };
  }
  // Warehouse gate: "ready" closes the warehouse gate
  if (order.warehouseRequired && order.warehouseStatus !== "ready") {
    const label =
      order.warehouseStatus === "processing" ? "בהכנה — טרם מוכן" :
                                               "טרם הותחל";
    return { ok: false, reason: `מחסן: ${label}` };
  }
  return { ok: true };
}

// Business rule: ready_installation → completed requires all active departments to be done.
// Checks fabrication (if required) and warehouse (if required).
// Returns the first blocker found, or {ok:true}.
export function canMarkOperationallyComplete(
  order: WorkOrder
): { ok: boolean; reason?: string } {
  if (order.fabricationRequired && order.fabricationStatus !== "completed") {
    const label =
      order.fabricationStatus === "issue"        ? "בעיה בייצור" :
      order.fabricationStatus === "in_progress"  ? "בייצור עדיין פעיל" :
      order.fabricationStatus === "ready"        ? "מוכן — ממתין לסיום רשמי" :
      order.fabricationStatus === "acknowledged" ? "אישור קבלה — טרם הושלם" :
                                                   "טרם הושלם";
    return { ok: false, reason: `מסגרייה: ${label}` };
  }
  if (order.warehouseRequired && order.warehouseStatus !== "ready") {
    const label =
      order.warehouseStatus === "processing" ? "בהכנה" :
                                               "טרם מוכן";
    return { ok: false, reason: `מחסן: ${label}` };
  }
  return { ok: true };
}

// ── Stage entry timestamps ────────────────────────────────────────────────
// Returns the most authoritative timestamp for when the order entered its
// current status. Stages without dedicated columns fall back to updatedAt,
// which the DB trigger sets on every status change.
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
// Urgent orders use half the threshold (applied in getStageSlaColor).
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
  if (hours >= sla.warnH    * factor)  return "yellow";
  return "green";
}
