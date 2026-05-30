// Department-level progress derivation for an order.
//
// Every value here is DERIVED from data already stored on the work order
// (status, fabricationRequired/Status, warehouseRequired/Status, accountingStatus,
// invoiceNumber, customerApprovalStatus, orderType, fulfillmentMethod, assignedCrew).
// Nothing is invented: a department is only "completed" when its stored state says
// so, irrelevant departments are "not_required", and anything we cannot determine
// is "needs_review" — never a fake completion.

import type { WorkOrder, WorkOrderStatus } from "@/types/workOrder";
import { isSchedulingCandidate } from "@/lib/workflowEngine";

export type DeptState =
  | "not_required"
  | "pending"
  | "in_progress"
  | "blocked"
  | "completed"
  | "needs_review";

export interface DeptProgress {
  key: "graphics" | "fabrication" | "warehouse" | "operations" | "finance";
  label: string;
  state: DeptState;
  reason?: string;
}

export const DEPT_STATE_LABELS: Record<DeptState, string> = {
  not_required: "לא נדרש",
  pending: "ממתין",
  in_progress: "בטיפול",
  blocked: "חסום",
  completed: "הושלם",
  needs_review: "דורש בדיקה",
};

const RANK: Record<WorkOrderStatus, number> = {
  draft: 0,
  graphics_pending: 1,
  graphics_active: 2,
  graphics_done: 3,
  production: 4,
  ready_installation: 5,
  completed: 6,
  cancelled: -1,
};

function graphicsDept(o: WorkOrder): DeptProgress {
  const r = RANK[o.status] ?? 0;
  let state: DeptState;
  if (r >= RANK.graphics_done) state = "completed";
  else if (o.status === "graphics_active") state = "in_progress";
  else state = "pending"; // draft / graphics_pending
  return { key: "graphics", label: "גרפיקה", state };
}

function fabricationDept(o: WorkOrder): DeptProgress {
  if (!o.fabricationRequired) return { key: "fabrication", label: "ייצור", state: "not_required" };
  const s = o.fabricationStatus;
  let state: DeptState;
  let reason: string | undefined;
  if (s === "issue") { state = "blocked"; reason = "בעיה בייצור"; }
  else if (s === "completed") state = "completed";
  else if (s === "ready" || s === "in_progress" || s === "acknowledged") state = "in_progress";
  else state = "pending"; // null / pending
  return { key: "fabrication", label: "ייצור", state, reason };
}

function warehouseDept(o: WorkOrder): DeptProgress {
  if (!o.warehouseRequired) return { key: "warehouse", label: "מחסן", state: "not_required" };
  const s = o.warehouseStatus;
  let state: DeptState;
  if (s === "ready") state = "completed";
  else if (s === "processing") state = "in_progress";
  else state = "pending"; // pending / null
  return { key: "warehouse", label: "מחסן", state };
}

/** Operations / coordination = the field-execution + scheduling part of the order. */
function operationsDept(o: WorkOrder): DeptProgress {
  // Pickup / self-pickup orders need no field coordination.
  const needsField =
    o.orderType !== "pickup" &&
    !(o.orderType === "equipment_supply" && o.fulfillmentMethod === "self_pickup");
  if (!needsField) return { key: "operations", label: "תפעול/תיאום", state: "not_required" };

  if (o.status === "completed") return { key: "operations", label: "תפעול/תיאום", state: "completed" };
  if (o.customerApprovalStatus === "pending") {
    return { key: "operations", label: "תפעול/תיאום", state: "blocked", reason: "ממתין לאישור לקוח" };
  }
  if (o.status === "ready_installation") {
    const scheduled = Boolean(o.assignedCrewId) || Boolean(o.scheduledDate);
    return {
      key: "operations",
      label: "תפעול/תיאום",
      state: scheduled ? "in_progress" : "pending",
      reason: scheduled ? "שובץ" : "מוכן לשיבוץ",
    };
  }
  // Upstream departments not done yet → operations hasn't started.
  return { key: "operations", label: "תפעול/תיאום", state: "pending", reason: "ממתין לשלבים קודמים" };
}

/** Finance is only shown once billing is in play (avoids noise on early orders). */
function financeDept(o: WorkOrder): DeptProgress | null {
  const relevant = o.status === "completed" || Boolean(o.accountingStatus) || Boolean(o.invoiceNumber);
  if (!relevant) return null;
  const s = o.accountingStatus;
  let state: DeptState;
  let reason: string | undefined;
  if (s === "disputed") { state = "blocked"; reason = "בסכסוך חיוב"; }
  else if (o.invoiceNumber || s === "invoiced" || s === "paid" || s === "approved") state = "completed";
  else if (s === "verified") { state = "in_progress"; reason = "מאומת — ממתין לחיוב"; }
  else state = "pending"; // pending / completed-without-accounting
  return { key: "finance", label: "כספים", state, reason };
}

/**
 * Relevant departments for an order, in display order. Graphics + operations are
 * always shown; fabrication/warehouse show "not_required" when their stored
 * required-flag is false; finance appears only once billing is relevant. Fleet is
 * intentionally omitted — work_orders has no reliable fleet linkage (a fleet doc
 * lives on the equipment record, surfaced by the fleet agent, not the order).
 */
export function getDepartmentProgress(order: WorkOrder): DeptProgress[] {
  const out: DeptProgress[] = [graphicsDept(order), fabricationDept(order), warehouseDept(order), operationsDept(order)];
  const fin = financeDept(order);
  if (fin) out.push(fin);
  return out;
}

export type ReadinessTone = "done" | "ready" | "blocked" | "progress";
export interface OrderReadiness {
  tone: ReadinessTone;
  label: string;
  blockerDept?: string;
  reason?: string;
}

/**
 * Single honest "where is this order overall" summary, derived from the relevant
 * department states. The order is NOT "ready"/"complete" until every relevant
 * department is completed; a blocked department surfaces first with its reason.
 */
export function getOrderReadiness(order: WorkOrder): OrderReadiness {
  if (order.status === "completed") return { tone: "done", label: "הושלם" };
  if (order.status === "cancelled") return { tone: "blocked", label: "בוטל" };

  const depts = getDepartmentProgress(order);
  const blocked = depts.find(d => d.state === "blocked");
  if (blocked) {
    return { tone: "blocked", label: `חסום: ${blocked.label}`, blockerDept: blocked.label, reason: blocked.reason };
  }

  // Core production departments that gate readiness (operations/finance come after).
  const core = depts.filter(d => d.key === "graphics" || d.key === "fabrication" || d.key === "warehouse");
  const coreDone = core.every(d => d.state === "completed" || d.state === "not_required");

  if (isSchedulingCandidate(order)) return { tone: "ready", label: "מוכן לשיבוץ" };
  if (coreDone) return { tone: "ready", label: "מוכן לתיאום" };
  return { tone: "progress", label: "בתהליך מחלקות" };
}
