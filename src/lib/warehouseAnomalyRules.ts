import type { WorkOrder } from "@/types/workOrder";
import type { WorkflowAlert, AffectedOrderContext } from "./workflowAlertTypes";

// Pure function — no React, no hooks. Safe to import from server-side scan routes.

function hoursAgo(isoTs: string, nowMs: number): number {
  return (nowMs - new Date(isoTs).getTime()) / 3_600_000;
}

// ── Rule W1: warehouse-ready-not-released ────────────────────────────────────
// Warehouse marked "ready" but the release button was never clicked.
// Excludes the legitimate production+ready state (warehouse done, fab still in progress).
// Uses warehouseReadyAt as the staleness reference; falls back to updatedAt.

function checkWarehouseReadyNotReleased(
  orders: WorkOrder[],
  nowMs: number,
): WorkflowAlert[] {
  // Exclude: production (legitimate waiting-for-fab), ready_installation, completed, cancelled
  const candidates = orders.filter(
    (o) =>
      o.warehouseRequired &&
      o.warehouseStatus === "ready" &&
      o.status !== "production" &&
      o.status !== "ready_installation" &&
      o.status !== "completed" &&
      o.status !== "cancelled",
  );
  if (candidates.length === 0) return [];

  function refTs(o: WorkOrder): string {
    return o.warehouseReadyAt ?? o.updatedAt;
  }

  const critical      = candidates.filter((o) => hoursAgo(refTs(o), nowMs) >= 12);
  const criticalUrgent = candidates.filter(
    (o) => hoursAgo(refTs(o), nowMs) >= 6 && hoursAgo(refTs(o), nowMs) < 12,
  );
  const warn          = candidates.filter(
    (o) => hoursAgo(refTs(o), nowMs) >= 4 && hoursAgo(refTs(o), nowMs) < 6,
  );
  const warnUrgent    = candidates.filter(
    (o) => hoursAgo(refTs(o), nowMs) >= 2 && hoursAgo(refTs(o), nowMs) < 4,
  );

  function toContext(o: WorkOrder, action: string): AffectedOrderContext {
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customer: o.customer,
      orderStatus: o.status,
      hoursStuck: Math.round(hoursAgo(refTs(o), nowMs) * 10) / 10,
      recommendedDepartmentAction: action,
    };
  }

  const alerts: WorkflowAlert[] = [];

  if (critical.length > 0) {
    alerts.push({
      id: "warehouse-ready-not-released-critical",
      severity: "critical",
      department: "fabrication", // warehouse alerts surface under same department area
      message: `${critical.length} הזמנות מוכנות במחסן מעל 12 שעות — לא שוחררו לשלב הבא`,
      count: critical.length,
      href: "/warehouse",
      orderNumbers: critical.map((o) => o.orderNumber),
      recommendedAction: "לחץ שחרר — שחרר את ההזמנה לביצוע שטח",
      escalationTarget: "operations_manager",
      affectedOrders: critical.map((o) => toContext(o, "לחץ שחרר לביצוע שטח")),
    });
  } else if (criticalUrgent.length > 0) {
    alerts.push({
      id: "warehouse-ready-not-released-critical-urgent",
      severity: "critical",
      department: "fabrication",
      message: `${criticalUrgent.length} הזמנות מוכנות במחסן מעל 6 שעות — דחוף: יש לשחרר`,
      count: criticalUrgent.length,
      href: "/warehouse",
      orderNumbers: criticalUrgent.map((o) => o.orderNumber),
      recommendedAction: "בדוק ושחרר ידנית",
      escalationTarget: "qa",
      affectedOrders: criticalUrgent.map((o) => toContext(o, "שחרור ידני נדרש")),
    });
  } else if (warn.length > 0) {
    alerts.push({
      id: "warehouse-ready-not-released-warn",
      severity: "warn",
      department: "fabrication",
      message: `${warn.length} הזמנות מוכנות במחסן מעל 4 שעות — ממתינות לשחרור`,
      count: warn.length,
      href: "/warehouse",
      orderNumbers: warn.map((o) => o.orderNumber),
      recommendedAction: "שחרר את ההזמנה לשלב הבא",
      escalationTarget: "department",
      affectedOrders: warn.map((o) => toContext(o, "שחרור להמשך תהליך")),
    });
  } else if (warnUrgent.length > 0) {
    alerts.push({
      id: "warehouse-ready-not-released-warn-early",
      severity: "warn",
      department: "fabrication",
      message: `${warnUrgent.length} הזמנות מוכנות במחסן מעל 2 שעות`,
      count: warnUrgent.length,
      href: "/warehouse",
      orderNumbers: warnUrgent.map((o) => o.orderNumber),
      recommendedAction: "מעקב — יש לשחרר בהקדם",
      escalationTarget: "department",
      affectedOrders: warnUrgent.map((o) => toContext(o, "מעקב ושחרור")),
    });
  }

  return alerts;
}

// ── Rule W2: warehouse/order status mismatch ─────────────────────────────────

function checkWarehouseOrderStatusMismatch(
  orders: WorkOrder[],
  nowMs: number,
): WorkflowAlert[] {
  const alerts: WorkflowAlert[] = [];

  // Case A: warehouse=ready but order is still in graphics stages (before production)
  const caseA = orders.filter(
    (o) =>
      o.warehouseRequired &&
      o.warehouseStatus === "ready" &&
      (o.status === "graphics_pending" ||
        o.status === "graphics_active" ||
        o.status === "graphics_done"),
  );
  if (caseA.length > 0) {
    alerts.push({
      id: "warehouse-mismatch-ready-before-production",
      severity: "warn",
      department: "fabrication",
      message: `${caseA.length} הזמנות עם מחסן מוכן בשלב גרפיקה — מוקדם מדי`,
      count: caseA.length,
      href: "/warehouse",
      orderNumbers: caseA.map((o) => o.orderNumber),
      recommendedAction: "בדוק את רצף התהליך — גרפיקה עדיין פעילה",
      escalationTarget: "qa",
      affectedOrders: caseA.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer,
        orderStatus: o.status,
        hoursStuck: Math.round(hoursAgo(o.updatedAt, nowMs) * 10) / 10,
        recommendedDepartmentAction: "בדיקת תיאום בין מחלקות",
      })),
    });
  }

  // Case B: warehouse active (processing/ready) but order already completed
  const caseB = orders.filter(
    (o) =>
      o.warehouseRequired &&
      (o.warehouseStatus === "processing" || o.warehouseStatus === "ready") &&
      o.status === "completed",
  );
  if (caseB.length > 0) {
    alerts.push({
      id: "warehouse-mismatch-active-on-completed",
      severity: "warn",
      department: "fabrication",
      message: `${caseB.length} הזמנות סגורות עם פעילות מחסן שטרם הסתיימה`,
      count: caseB.length,
      href: "/warehouse",
      orderNumbers: caseB.map((o) => o.orderNumber),
      recommendedAction: "עדכן סטטוס מחסן לסופי",
      escalationTarget: "qa",
      affectedOrders: caseB.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer,
        orderStatus: o.status,
        hoursStuck: Math.round(hoursAgo(o.updatedAt, nowMs) * 10) / 10,
        recommendedDepartmentAction: "סגור סטטוס מחסן",
      })),
    });
  }

  // Case C: warehouse active on cancelled order (always wrong)
  const caseC = orders.filter(
    (o) =>
      (o.warehouseStatus === "processing" || o.warehouseStatus === "ready") &&
      o.status === "cancelled",
  );
  if (caseC.length > 0) {
    alerts.push({
      id: "warehouse-mismatch-active-on-cancelled",
      severity: "critical",
      department: "fabrication",
      message: `${caseC.length} הזמנות מבוטלות עם פעילות מחסן פעילה — יש לטפל`,
      count: caseC.length,
      href: "/warehouse",
      orderNumbers: caseC.map((o) => o.orderNumber),
      recommendedAction: "עדכן מחסן וסגור פעילות",
      escalationTarget: "operations_manager",
      affectedOrders: caseC.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer,
        orderStatus: o.status,
        hoursStuck: Math.round(hoursAgo(o.updatedAt, nowMs) * 10) / 10,
        recommendedDepartmentAction: "סיום פעילות מחסן על הזמנה מבוטלת",
      })),
    });
  }

  // Case D: warehouseRequired but warehouse never started — and order at ready_installation
  const caseD = orders.filter(
    (o) =>
      o.warehouseRequired &&
      (!o.warehouseStatus || o.warehouseStatus === "pending") &&
      o.status === "ready_installation",
  );
  if (caseD.length > 0) {
    alerts.push({
      id: "warehouse-mismatch-required-not-prepared",
      severity: "critical",
      department: "fabrication",
      message: `${caseD.length} הזמנות מוכנות להתקנה עם מחסן שלא הוכן — נדרשת בדיקה`,
      count: caseD.length,
      href: "/warehouse",
      orderNumbers: caseD.map((o) => o.orderNumber),
      recommendedAction: "בדוק אם הציוד הוכן בפועל — עדכן סטטוס מחסן",
      escalationTarget: "operations_manager",
      affectedOrders: caseD.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer,
        orderStatus: o.status,
        hoursStuck: Math.round(hoursAgo(o.updatedAt, nowMs) * 10) / 10,
        recommendedDepartmentAction: "עדכן סטטוס הכנת מחסן",
      })),
    });
  }

  return alerts;
}

// ── Public entry point ───────────────────────────────────────────────────────

export function checkWarehouseAnomalies(
  orders: WorkOrder[],
  nowMs: number = Date.now(),
): WorkflowAlert[] {
  return [
    ...checkWarehouseReadyNotReleased(orders, nowMs),
    ...checkWarehouseOrderStatusMismatch(orders, nowMs),
  ];
}
