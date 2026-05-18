"use client";

import { useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { stageEntryTime } from "@/lib/workflowEngine";
import { getOrderDiaries } from "@/lib/executionUtils";
import { checkFabricationAnomalies } from "@/lib/fabricationAnomalyRules";
import type { WorkflowAlert } from "@/lib/workflowAlertTypes";

// Re-export shared types so existing consumers don't need to change their import path
export type { AlertSeverity, AlertDepartment, WorkflowAlert, AffectedOrderContext } from "@/lib/workflowAlertTypes";
export { DEPT_LABELS } from "@/lib/workflowAlertTypes";

export function useWorkflowAlerts(): WorkflowAlert[] {
  const { orders } = useOrdersContext();
  const { diaries } = useWorkDiaryContext();

  return useMemo(() => {
    const now = Date.now(); // eslint-disable-line react-hooks/purity
    const alerts: WorkflowAlert[] = [];

    function h(ts: string): number {
      return (now - new Date(ts).getTime()) / 3_600_000;
    }

    // ── Graphics: unacknowledged ─────────────────────────────────────────
    const pendingCritical = orders.filter(
      o => o.status === "graphics_pending" && h(stageEntryTime(o)) >= 48
    );
    const pendingWarn = orders.filter(
      o => o.status === "graphics_pending" &&
           h(stageEntryTime(o)) >= 24 && h(stageEntryTime(o)) < 48
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

    // ── Graphics: in-progress too long ───────────────────────────────────
    const activeCritical = orders.filter(
      o => o.status === "graphics_active" && h(stageEntryTime(o)) >= 72
    );
    const activeWarn = orders.filter(
      o => o.status === "graphics_active" &&
           h(stageEntryTime(o)) >= 48 && h(stageEntryTime(o)) < 72
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
    const gdCritical = orders.filter(
      o => o.status === "graphics_done" && o.graphicsCompletedAt &&
           h(o.graphicsCompletedAt) >= 48
    );
    const gdWarn = orders.filter(
      o => o.status === "graphics_done" && o.graphicsCompletedAt &&
           h(o.graphicsCompletedAt) >= 24 && h(o.graphicsCompletedAt) < 48
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
      o => o.status === "production" && h(stageEntryTime(o)) >= 120
    );
    const prodWarn = orders.filter(
      o => o.status === "production" &&
           h(stageEntryTime(o)) >= 72 && h(stageEntryTime(o)) < 120
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
      o => o.fabricationRequired && o.fabricationStatus === "issue" &&
           o.status !== "completed" && o.status !== "cancelled"
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
    const unsCritical = orders.filter(
      o => o.status === "ready_installation" && !o.scheduledDate &&
           h(stageEntryTime(o)) >= 72
    );
    const unsWarn = orders.filter(
      o => o.status === "ready_installation" && !o.scheduledDate &&
           h(stageEntryTime(o)) >= 24 && h(stageEntryTime(o)) < 72
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
           (!o.accountingStatus || o.accountingStatus === "pending" || o.accountingStatus === "verified") &&
           !o.invoicedAt
    );
    const accCritical = uninvoiced.filter(o => h(o.updatedAt) >= 168);
    const accWarn     = uninvoiced.filter(o => h(o.updatedAt) >= 72 && h(o.updatedAt) < 168);
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

    // ── Open problems — only on active operational orders ────────────────
    const ordersWithProblems = orders.filter(
      o => o.status !== "completed" && o.status !== "cancelled" &&
           (o.problems ?? []).some(p => p.status !== "resolved" && p.status !== "cancelled")
    );
    if (ordersWithProblems.length > 0) {
      const total = ordersWithProblems.reduce(
        (s, o) =>
          s + (o.problems ?? []).filter(
            p => p.status !== "resolved" && p.status !== "cancelled"
          ).length,
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

    // ── Urgent: active over 24 hours ─────────────────────────────────────
    const urgentStuck = orders.filter(
      o => o.priority === "urgent" &&
           o.status !== "completed" &&
           o.status !== "cancelled" &&
           h(o.createdAt) >= 24
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

    // ── Diary: submitted awaiting approval too long ──────────────────────
    const pendingApprovalDiaries = diaries.filter(
      d => d.status === "submitted" && (!d.approvalStatus || d.approvalStatus === "pending") && d.submittedAt
    );
    const approvalCritical = pendingApprovalDiaries.filter(d => h(d.submittedAt!) >= 72);
    const approvalWarn     = pendingApprovalDiaries.filter(d => h(d.submittedAt!) >= 48 && h(d.submittedAt!) < 72);
    if (approvalCritical.length > 0) {
      alerts.push({
        id: "diary-approval-critical",
        severity: "critical",
        department: "office",
        message: `${approvalCritical.length} יומני עבודה ממתינים לאישור מעל 72 שעות`,
        count: approvalCritical.length,
        href: "/work-diary",
      });
    } else if (approvalWarn.length > 0) {
      alerts.push({
        id: "diary-approval-warn",
        severity: "warn",
        department: "office",
        message: `${approvalWarn.length} יומני עבודה ממתינים לאישור מעל 48 שעות`,
        count: approvalWarn.length,
        href: "/work-diary",
      });
    }

    // ── Diary: scheduled job past execution date — no diary submitted ────
    // Only fires for ready_installation (still active). Completed orders
    // have left the active workflow so the diary requirement is no longer
    // an operational alert (may become an accounting note if needed later).
    const todayStr = new Date().toISOString().slice(0, 10);
    const missingDiary = orders.filter(o => {
      if (o.status !== "ready_installation") return false;
      if (!o.scheduledDate || o.scheduledDate >= todayStr) return false;
      const linked = getOrderDiaries(diaries, o.id);
      return !linked.some(d => d.status === "submitted");
    });
    if (missingDiary.length > 0) {
      alerts.push({
        id: "diary-missing",
        severity: missingDiary.length >= 3 ? "critical" : "warn",
        department: "office",
        message: `${missingDiary.length} עבודות שבוצעו ללא יומן שטח מוגש`,
        count: missingDiary.length,
        href: "/work-diary",
        orderNumbers: missingDiary.map(o => o.orderNumber),
      });
    }

    // ── Fabrication QA anomalies ─────────────────────────────────────────
    alerts.push(...checkFabricationAnomalies(orders, now));

    return alerts.sort(
      (a, b) => (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1)
    );
  }, [orders, diaries]);
}
