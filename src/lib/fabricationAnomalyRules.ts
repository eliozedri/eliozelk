import type { WorkOrder } from "@/types/workOrder";
import type { WorkflowAlert, AffectedOrderContext } from "./workflowAlertTypes";

// Pure function — no React, no hooks. Safe to import from server-side scan routes.

function hoursAgo(isoTs: string, nowMs: number): number {
  return (nowMs - new Date(isoTs).getTime()) / 3_600_000;
}

// ── Rule 1: fab-ready-not-closed ─────────────────────────────────────────────
// Fabrication marked "ready" but the office hasn't moved the order to
// ready_installation. Uses fabricationReadyAt as the staleness reference;
// falls back to updatedAt for orders that predate the new field.

function checkFabReadyNotClosed(
  orders: WorkOrder[],
  nowMs: number,
): WorkflowAlert[] {
  const candidates = orders.filter(
    (o) =>
      o.fabricationRequired === true &&
      o.fabricationStatus === "ready" &&
      o.status === "production",
  );
  if (candidates.length === 0) return [];

  function refTs(o: WorkOrder): string {
    return o.fabricationReadyAt ?? o.updatedAt;
  }

  const critical = candidates.filter((o) => hoursAgo(refTs(o), nowMs) >= 12);
  const criticalUrgent = candidates.filter(
    (o) => hoursAgo(refTs(o), nowMs) >= 6 && hoursAgo(refTs(o), nowMs) < 12,
  );
  const warn = candidates.filter(
    (o) => hoursAgo(refTs(o), nowMs) >= 4 && hoursAgo(refTs(o), nowMs) < 6,
  );
  const warnUrgent = candidates.filter(
    (o) => hoursAgo(refTs(o), nowMs) >= 2 && hoursAgo(refTs(o), nowMs) < 4,
  );

  const alerts: WorkflowAlert[] = [];

  function toContext(o: WorkOrder, action: string): AffectedOrderContext {
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customer: o.customer,
      fabricationStatus: o.fabricationStatus,
      orderStatus: o.status,
      hoursStuck: Math.round(hoursAgo(refTs(o), nowMs) * 10) / 10,
      recommendedDepartmentAction: action,
    };
  }

  if (critical.length > 0) {
    alerts.push({
      id: "fab-ready-not-closed-critical",
      severity: "critical",
      department: "fabrication",
      message: `${critical.length} הזמנות מוכנות במסגרייה מעל 12 שעות — ההזמנה לא הועברה להתקנה`,
      count: critical.length,
      href: "/fabrication",
      orderNumbers: critical.map((o) => o.orderNumber),
      recommendedAction: "העבר את ההזמנה לסטטוס מוכן להתקנה",
      escalationTarget: "operations_manager",
      affectedOrders: critical.map((o) =>
        toContext(o, "העברה מיידית לסטטוס מוכן להתקנה"),
      ),
    });
  } else if (criticalUrgent.length > 0) {
    alerts.push({
      id: "fab-ready-not-closed-critical-urgent",
      severity: "critical",
      department: "fabrication",
      message: `${criticalUrgent.length} הזמנות מוכנות במסגרייה מעל 6 שעות — דחוף: יש להעביר להתקנה`,
      count: criticalUrgent.length,
      href: "/fabrication",
      orderNumbers: criticalUrgent.map((o) => o.orderNumber),
      recommendedAction: "בדוק ועדכן סטטוס ההזמנה",
      escalationTarget: "qa",
      affectedOrders: criticalUrgent.map((o) =>
        toContext(o, "העברה להתקנה — מוכן במסגרייה"),
      ),
    });
  } else if (warn.length > 0) {
    alerts.push({
      id: "fab-ready-not-closed-warn",
      severity: "warn",
      department: "fabrication",
      message: `${warn.length} הזמנות מוכנות במסגרייה מעל 4 שעות — ממתינות לסגירה`,
      count: warn.length,
      href: "/fabrication",
      orderNumbers: warn.map((o) => o.orderNumber),
      recommendedAction: "עדכן סטטוס ההזמנה למוכן להתקנה",
      escalationTarget: "department",
      affectedOrders: warn.map((o) => toContext(o, "עדכון סטטוס להמשך תהליך")),
    });
  } else if (warnUrgent.length > 0) {
    alerts.push({
      id: "fab-ready-not-closed-warn-early",
      severity: "warn",
      department: "fabrication",
      message: `${warnUrgent.length} הזמנות מוכנות במסגרייה מעל 2 שעות`,
      count: warnUrgent.length,
      href: "/fabrication",
      orderNumbers: warnUrgent.map((o) => o.orderNumber),
      recommendedAction: "מעקב — יש להעביר בהקדם",
      escalationTarget: "department",
      affectedOrders: warnUrgent.map((o) =>
        toContext(o, "מעקב ועדכון סטטוס"),
      ),
    });
  }

  return alerts;
}

// ── Rule 2: fab-order-status-mismatch ───────────────────────────────────────
// Detects five cases of internal inconsistency between the fabrication
// sub-lifecycle and the parent order lifecycle.

function checkFabOrderStatusMismatch(
  orders: WorkOrder[],
  nowMs: number,
): WorkflowAlert[] {
  const alerts: WorkflowAlert[] = [];

  // Case A: fab completed but order still in production
  const caseA = orders.filter(
    (o) =>
      o.fabricationRequired === true &&
      o.fabricationStatus === "completed" &&
      o.status === "production",
  );
  if (caseA.length > 0) {
    alerts.push({
      id: "fab-mismatch-completed-in-production",
      severity: "critical",
      department: "fabrication",
      message: `${caseA.length} הזמנות שמסגרייה הושלמה בהן — ההזמנה לא הועברה לשלב הבא`,
      count: caseA.length,
      href: "/fabrication",
      orderNumbers: caseA.map((o) => o.orderNumber),
      recommendedAction: "בדוק ועדכן סטטוס ההזמנה",
      escalationTarget: "qa",
      affectedOrders: caseA.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer,
        fabricationStatus: o.fabricationStatus,
        orderStatus: o.status,
        hoursStuck: Math.round(hoursAgo(o.updatedAt, nowMs) * 10) / 10,
        recommendedDepartmentAction: "העבר ידנית לשלב הבא",
      })),
    });
  }

  // Case B: fab ready/completed while order is still in graphics
  const caseB = orders.filter(
    (o) =>
      o.fabricationRequired === true &&
      (o.fabricationStatus === "ready" || o.fabricationStatus === "completed") &&
      (o.status === "graphics_pending" ||
        o.status === "graphics_active" ||
        o.status === "graphics_done"),
  );
  if (caseB.length > 0) {
    alerts.push({
      id: "fab-mismatch-fab-ahead-of-graphics",
      severity: "warn",
      department: "fabrication",
      message: `${caseB.length} הזמנות עם מסגרייה מתקדמת ביחס לסטטוס גרפיקה`,
      count: caseB.length,
      href: "/fabrication",
      orderNumbers: caseB.map((o) => o.orderNumber),
      recommendedAction: "בדוק את רצף התהליך — גרפיקה עדיין פעילה",
      escalationTarget: "qa",
      affectedOrders: caseB.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer,
        fabricationStatus: o.fabricationStatus,
        orderStatus: o.status,
        hoursStuck: Math.round(hoursAgo(o.updatedAt, nowMs) * 10) / 10,
        recommendedDepartmentAction: "בדיקת תיאום בין מחלקות",
      })),
    });
  }

  // Case C: fab in progress while order is still a draft
  const caseC = orders.filter(
    (o) =>
      o.fabricationRequired === true &&
      (o.fabricationStatus === "in_progress" ||
        o.fabricationStatus === "ready" ||
        o.fabricationStatus === "completed") &&
      o.status === "draft",
  );
  if (caseC.length > 0) {
    alerts.push({
      id: "fab-mismatch-fab-on-draft",
      severity: "critical",
      department: "fabrication",
      message: `${caseC.length} הזמנות בטיוטה עם מסגרייה בתהליך — חריגה בנתונים`,
      count: caseC.length,
      href: "/fabrication",
      orderNumbers: caseC.map((o) => o.orderNumber),
      recommendedAction: "בדוק ותקן מצב ההזמנה",
      escalationTarget: "operations_manager",
      affectedOrders: caseC.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer,
        fabricationStatus: o.fabricationStatus,
        orderStatus: o.status,
        hoursStuck: Math.round(hoursAgo(o.updatedAt, nowMs) * 10) / 10,
        recommendedDepartmentAction: "בדיקת שלמות נתונים",
      })),
    });
  }

  // Case D: fab still active on a completed order
  const caseD = orders.filter(
    (o) =>
      o.fabricationRequired === true &&
      o.fabricationStatus !== null &&
      o.fabricationStatus !== undefined &&
      o.fabricationStatus !== "pending" &&
      o.fabricationStatus !== "completed" &&
      o.status === "completed",
  );
  if (caseD.length > 0) {
    alerts.push({
      id: "fab-mismatch-active-on-completed",
      severity: "warn",
      department: "fabrication",
      message: `${caseD.length} הזמנות סגורות עם מסגרייה שטרם הושלמה`,
      count: caseD.length,
      href: "/fabrication",
      orderNumbers: caseD.map((o) => o.orderNumber),
      recommendedAction: "עדכן סטטוס מסגרייה למצב סופי",
      escalationTarget: "qa",
      affectedOrders: caseD.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer,
        fabricationStatus: o.fabricationStatus,
        orderStatus: o.status,
        hoursStuck: Math.round(hoursAgo(o.updatedAt, nowMs) * 10) / 10,
        recommendedDepartmentAction: "סגור סטטוס מסגרייה",
      })),
    });
  }

  // Case E: fab active on a cancelled order (always wrong — regardless of fabricationRequired)
  const caseE = orders.filter(
    (o) =>
      o.fabricationStatus !== null &&
      o.fabricationStatus !== undefined &&
      o.fabricationStatus !== "pending" &&
      o.status === "cancelled",
  );
  if (caseE.length > 0) {
    alerts.push({
      id: "fab-mismatch-active-on-cancelled",
      severity: "critical",
      department: "fabrication",
      message: `${caseE.length} הזמנות מבוטלות עם מסגרייה פעילה — יש לטפל`,
      count: caseE.length,
      href: "/fabrication",
      orderNumbers: caseE.map((o) => o.orderNumber),
      recommendedAction: "עדכן סטטוס מסגרייה לביטול",
      escalationTarget: "operations_manager",
      affectedOrders: caseE.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer,
        fabricationStatus: o.fabricationStatus,
        orderStatus: o.status,
        hoursStuck: Math.round(hoursAgo(o.updatedAt, nowMs) * 10) / 10,
        recommendedDepartmentAction: "בטל פעילות מסגרייה",
      })),
    });
  }

  return alerts;
}

// ── Public entry point ───────────────────────────────────────────────────────

export function checkFabricationAnomalies(
  orders: WorkOrder[],
  nowMs: number = Date.now(),
): WorkflowAlert[] {
  return [
    ...checkFabReadyNotClosed(orders, nowMs),
    ...checkFabOrderStatusMismatch(orders, nowMs),
  ];
}
