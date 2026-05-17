"use client";

import { useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { useCrewsContext } from "@/context/CrewsContext";
import { useWorkflowAlerts } from "@/hooks/useWorkflowAlerts";
import { useNotifications } from "@/hooks/useNotifications";
import { useForecast } from "@/hooks/useForecast";
import { getStageSlaColor, hoursInCurrentStage } from "@/lib/workflowEngine";
import { getOrderDiaries } from "@/lib/executionUtils";
import type { WorkOrderStatus } from "@/types/workOrder";
import type { WorkflowAlert } from "@/hooks/useWorkflowAlerts";
import type { NotificationCounts } from "@/hooks/useNotifications";

export interface PipelineStageKPI {
  status: WorkOrderStatus;
  label: string;
  count: number;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  maxAgeDays: number;
}

export interface DashboardKPIs {
  openOrders: number;
  urgentOpen: number;
  criticalAlerts: number;
  stuckOrders: number;
  accountingPending: number;
  diariesPending: number;
  todayFieldDiaries: number;

  pipelineStages: PipelineStageKPI[];
  bottleneckStage: string | null;

  uninvoicedCompleted: number;
  oldestUninvoicedDays: number;
  verifiedOrders: number;
  invoicedOrders: number;

  submittedDiariesCount: number;
  draftDiariesCount: number;
  missingDiaryJobs: number;

  activeCrews: number;
  totalCapacityHoursPerWeek: number;
  scheduledHoursThisWeek: number;
  capacityUtilizationPct: number;

  notifications: NotificationCounts;
  alerts: WorkflowAlert[];
}

const ACTIVE_STAGE_SPECS: Array<{ status: WorkOrderStatus; label: string }> = [
  { status: "graphics_pending",   label: "ממתינות לגרפיקה" },
  { status: "graphics_active",    label: "בטיפול גרפיקה"   },
  { status: "graphics_done",      label: "גרפיקה הושלמה"   },
  { status: "production",         label: "בייצור"           },
  { status: "ready_installation", label: "מוכן להתקנה"     },
];

export function useDashboardKPIs(): DashboardKPIs {
  const { orders } = useOrdersContext();
  const { diaries } = useWorkDiaryContext();
  const { crews } = useCrewsContext();
  const notifications = useNotifications();
  const alerts = useWorkflowAlerts();
  const forecast = useForecast();

  return useMemo(() => {
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);

    // ── Command strip metrics ────────────────────────────────────────────────
    const openOrders = orders.filter(
      o => o.status !== "completed" && o.status !== "cancelled"
    ).length;
    const urgentOpen = orders.filter(
      o => o.priority === "urgent" &&
           o.status !== "completed" && o.status !== "cancelled"
    ).length;

    const todayFieldDiaries = diaries.filter(
      d => d.executionDate === todayStr
    ).length;

    // ── Pipeline SLA breakdown ───────────────────────────────────────────────
    const pipelineStages: PipelineStageKPI[] = ACTIVE_STAGE_SPECS.map(spec => {
      const stageOrders = orders.filter(o => o.status === spec.status);
      const colors = stageOrders.map(o => getStageSlaColor(o, now));
      const redCount    = colors.filter(c => c === "red").length;
      const yellowCount = colors.filter(c => c === "yellow").length;
      const greenCount  = colors.filter(c => c === "green").length;
      const maxAgeHours = stageOrders.length
        ? Math.max(...stageOrders.map(o => hoursInCurrentStage(o, now)))
        : 0;
      return {
        status: spec.status,
        label: spec.label,
        count: stageOrders.length,
        redCount,
        yellowCount,
        greenCount,
        maxAgeDays: Math.round(maxAgeHours / 24),
      };
    });

    // Bottleneck = stage with highest red count, then highest total
    const bottleneckStage = pipelineStages.reduce<PipelineStageKPI | null>((best, s) => {
      if (!best) return s.redCount > 0 || s.yellowCount > 0 ? s : null;
      const sBad = s.redCount * 2 + s.yellowCount;
      const bBad = best.redCount * 2 + best.yellowCount;
      return sBad > bBad ? s : best;
    }, null)?.label ?? null;

    // ── Financial visibility ─────────────────────────────────────────────────
    const uninvoicedOrders = orders.filter(o =>
      o.status === "completed" &&
      !o.invoicedAt &&
      (!o.accountingStatus || o.accountingStatus === "pending" || o.accountingStatus === "verified")
    );
    const uninvoicedCompleted = uninvoicedOrders.length;
    const oldestUninvoicedDays = uninvoicedOrders.length > 0
      ? Math.round(Math.max(...uninvoicedOrders.map(o =>
          (now - new Date(o.updatedAt ?? o.createdAt).getTime()) / 86_400_000
        )))
      : 0;
    const verifiedOrders = orders.filter(o => o.accountingStatus === "verified").length;
    const invoicedOrders = orders.filter(o =>
      o.accountingStatus === "invoiced" || o.accountingStatus === "approved"
    ).length;

    // ── Field execution ──────────────────────────────────────────────────────
    const submittedDiariesCount = diaries.filter(d => d.status === "submitted").length;
    const draftDiariesCount = diaries.filter(d => d.status === "draft").length;

    const missingDiaryJobs = orders.filter(o => {
      if (o.status !== "ready_installation") return false;
      if (!o.scheduledDate || o.scheduledDate >= todayStr) return false;
      const linked = getOrderDiaries(diaries, o.id);
      return !linked.some(d => d.status === "submitted");
    }).length;

    // ── Crew capacity ─────────────────────────────────────────────────────────
    const activeCrews = crews.filter(c => c.active).length;
    const totalCapacityHoursPerWeek = crews
      .filter(c => c.active)
      .reduce((sum, c) => sum + c.dailyCapacityHours * 5, 0);
    const scheduledHoursThisWeek = Math.round(forecast.crewCapacity.scheduledHours);
    const capacityUtilizationPct = Math.round(forecast.crewCapacity.utilizationPct);

    return {
      openOrders,
      urgentOpen,
      criticalAlerts: notifications.criticalAlerts,
      stuckOrders: notifications.stuckOrders,
      accountingPending: notifications.accountingPending,
      diariesPending: notifications.diariesPending,
      todayFieldDiaries,
      pipelineStages,
      bottleneckStage,
      uninvoicedCompleted,
      oldestUninvoicedDays,
      verifiedOrders,
      invoicedOrders,
      submittedDiariesCount,
      draftDiariesCount,
      missingDiaryJobs,
      activeCrews,
      totalCapacityHoursPerWeek,
      scheduledHoursThisWeek,
      capacityUtilizationPct,
      notifications,
      alerts,
    };
  }, [orders, diaries, crews, notifications, alerts, forecast]);
}
