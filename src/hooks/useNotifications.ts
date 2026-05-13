"use client";

import { useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { openProblemsCount } from "@/types/workOrder";

export interface NotificationCounts {
  // Raw dimensional counts (for department pages to use directly)
  graphicsPending: number;      // status = graphics_pending (unacknowledged)
  graphicsActive: number;       // status = graphics_active (in progress)
  fabricationActive: number;    // fabricationRequired + active fab lifecycle
  fabricationIssues: number;    // fabricationStatus = issue (blocked)
  accountingPending: number;    // completed + not yet invoiced
  diariesPending: number;       // submitted work diaries awaiting review
  schedulePending: number;      // ready_installation + no scheduledDate
  problemsOpen: number;         // open problems across all orders
  urgentActive: number;         // urgent priority + not finished

  // Sidebar-facing aggregated counts (one number per tab)
  graphics: number;     // graphicsPending — primary alert for the graphics team
  fabrication: number;  // fabricationActive + fabricationIssues
  accounting: number;   // accountingPending + diariesPending
  schedule: number;     // schedulePending
  orders: number;       // urgentActive
  dashboard: number;    // problemsOpen
}

export function useNotifications(): NotificationCounts {
  const { orders } = useOrdersContext();
  const { diaries } = useWorkDiaryContext();

  return useMemo(() => {
    const graphicsPending = orders.filter(o => o.status === "graphics_pending").length;
    const graphicsActive  = orders.filter(o => o.status === "graphics_active").length;

    const fabricationActive = orders.filter(o =>
      !!o.fabricationRequired &&
      ["pending", "acknowledged", "in_progress"].includes(o.fabricationStatus ?? "")
    ).length;
    const fabricationIssues = orders.filter(o =>
      !!o.fabricationRequired && o.fabricationStatus === "issue"
    ).length;

    // Pending billing: completed orders that haven't been invoiced yet.
    // accountingStatus defaults to "pending" when absent (backward compat).
    const accountingPending = orders.filter(o =>
      o.status === "completed" &&
      (!o.accountingStatus || o.accountingStatus === "pending") &&
      !o.invoicedAt
    ).length;

    const diariesPending = diaries.filter(d => d.status === "submitted").length;

    const schedulePending = orders.filter(o =>
      o.status === "ready_installation" && !o.scheduledDate
    ).length;

    const problemsOpen  = orders.reduce((sum, o) => sum + openProblemsCount(o), 0);
    const urgentActive  = orders.filter(o =>
      o.priority === "urgent" &&
      o.status !== "completed" &&
      o.status !== "cancelled"
    ).length;

    return {
      graphicsPending,
      graphicsActive,
      fabricationActive,
      fabricationIssues,
      accountingPending,
      diariesPending,
      schedulePending,
      problemsOpen,
      urgentActive,
      graphics:    graphicsPending,
      fabrication: fabricationActive + fabricationIssues,
      accounting:  accountingPending + diariesPending,
      schedule:    schedulePending,
      orders:      urgentActive,
      dashboard:   problemsOpen,
    };
  }, [orders, diaries]);
}
