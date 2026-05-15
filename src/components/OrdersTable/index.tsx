"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useOrdersContext } from "@/context/OrdersContext";
import { useCustomersContext } from "@/context/CustomersContext";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  LIFECYCLE_STAGES,
  getProgressState,
  hasOpenProblems,
  openProblemsCount,
  ORDER_TYPE_LABELS,
  ORDER_TYPE_COLORS,
  FULFILLMENT_LABELS,
} from "@/types/workOrder";
import type { WorkOrder, WorkOrderStatus } from "@/types/workOrder";
import { getStageSlaColor, hoursInCurrentStage, canMarkReadyForInstallation } from "@/lib/workflowEngine";
import { useOrderRiskScores } from "@/hooks/useOrderRiskScores";
import type { OrderRiskScore } from "@/hooks/useOrderRiskScores";
import { openWorkOrderPDF, exportWorkOrderCSV } from "@/lib/pdfExport";

// ─── Constants ─────────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 10;

const ALL_STATUSES: WorkOrderStatus[] = [
  "graphics_pending",
  "graphics_active",
  "graphics_done",
  "production",
  "ready_installation",
  "completed",
  "cancelled",
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function getLastUpdated(order: WorkOrder): string {
  return order.updatedAt ?? order.graphicsCompletedAt ?? order.graphicsAcknowledgedAt ?? order.createdAt;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function formatShortDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) + ", " + d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(iso: string): string | null {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  const hours = diff / 3600000;
  if (minutes < 2) return "עכשיו";
  if (hours < 1) return `לפני ${minutes} דקות`;
  if (hours < 24) return `לפני ${Math.round(hours)} שעות`;
  if (hours < 48) return "אתמול";
  return null;
}

function formatStageAge(hours: number): string {
  if (hours < 1)  return "< 1 שע׳";
  if (hours < 24) return `${Math.round(hours)} שע׳`;
  const days = Math.floor(hours / 24);
  const rem  = Math.round(hours % 24);
  return rem > 0 ? `${days}י ${rem}ש׳` : `${days} ימים`;
}

// ─── Order-type icons ──────────────────────────────────────────────────────

function OrderTypeIcon({ type }: { type: string }) {
  if (type === "pickup") {
    return (
      <span title="הזמנה לאיסוף">
        <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </span>
    );
  }
  if (type === "equipment_supply") {
    return (
      <span title="אספקת ציוד">
        <svg className="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" rx="1" />
          <path d="M16 8h4l3 3v5h-7V8z" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      </span>
    );
  }
  // field_work (default)
  return (
    <span title="ביצוע עבודה">
      <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16" />
      </svg>
    </span>
  );
}

// ─── SVG Icons ─────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function XSmallIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.58 3.37 2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.68a16 16 0 0 0 6 6l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg className="w-3 h-3 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  );
}

// Status-specific icons for badges
function StatusIcon({ status }: { status: WorkOrderStatus }) {
  const cls = "w-3 h-3 shrink-0";
  switch (status) {
    case "graphics_pending":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case "graphics_active":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>;
    case "graphics_done":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
    case "production":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /></svg>;
    case "ready_installation":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>;
    case "completed":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
    case "cancelled":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>;
    default:
      return null;
  }
}

// KPI card icons
function KpiIcon({ type }: { type: "total" | "completed" | "fabrication" | "active" | "problems" }) {
  const cls = "w-5 h-5";
  switch (type) {
    case "total":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
    case "completed":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
    case "fabrication":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>;
    case "active":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" /><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.25 1 3 .98 1.66 0 3-1.34 3-3.01 0-1.67-1.34-3.01-3-3.01z" /></svg>;
    case "problems":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
    default:
      return null;
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  iconBg: string;
  value: number;
  label: string;
  onFilter?: () => void;
}

function KpiCard({ icon, iconBg, value, label, onFilter }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold text-gray-900 leading-none mb-1">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
      {onFilter && (
        <button
          onClick={onFilter}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors mt-auto"
        >
          <span>צפה</span>
          <ChevronRight />
        </button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: WorkOrderStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_COLORS[status]}`}>
      <StatusIcon status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}

function ProgressTracker({ order }: { order: WorkOrder }) {
  const { status } = order;
  const { completedSteps, activeStep, isPending } = getProgressState(status);
  const n = LIFECYCLE_STAGES.length;

  if (status === "cancelled") {
    return (
      <span className="text-xs text-red-400 font-medium">בוטל</span>
    );
  }

  const warehouseStatus = order.warehouseStatus;
  const fabStatus = order.fabricationStatus;
  const showWarehouse = order.warehouseRequired;
  const showFab = order.fabricationRequired;

  return (
    <div className="flex flex-col items-center gap-1 min-w-[100px]">
      <div className="flex items-center">
        {LIFECYCLE_STAGES.map((stage, i) => {
          const isDone = i < completedSteps;
          const isActive = i === activeStep;

          let dotCls = "w-2.5 h-2.5 rounded-full border flex-shrink-0 ";
          if (isDone) dotCls += "bg-blue-500 border-blue-500";
          else if (isActive && isPending) dotCls += "bg-white border-blue-400 ring-2 ring-blue-200 ring-offset-0 animate-pulse";
          else if (isActive) dotCls += "bg-white border-blue-500 ring-2 ring-blue-300 ring-offset-0";
          else dotCls += "bg-gray-200 border-gray-200";

          return (
            <div key={stage.key} className="flex items-center">
              <div className={dotCls} title={stage.label} />
              {i < n - 1 && (
                <div className={`h-px w-5 flex-shrink-0 ${isDone ? "bg-blue-400" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>
      {/* Stage labels */}
      <div className="flex items-center gap-0">
        {LIFECYCLE_STAGES.map((stage, i) => {
          const isActive = i === activeStep;
          const isDone = i < completedSteps;
          return (
            <div key={stage.key} className="flex items-center">
              <span
                className={`text-[9px] leading-none w-2.5 text-center overflow-hidden whitespace-nowrap ${
                  isActive ? "text-blue-600 font-semibold" : isDone ? "text-blue-400" : "text-gray-300"
                }`}
                style={{ fontSize: "8px" }}
              >
                {stage.label[0]}
              </span>
              {i < LIFECYCLE_STAGES.length - 1 && <div className="w-5" />}
            </div>
          );
        })}
      </div>
      {/* Department sub-indicators */}
      {(showWarehouse || showFab) && (
        <div className="flex items-center gap-1.5 mt-0.5">
          {showWarehouse && (
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                warehouseStatus === "ready"      ? "bg-green-100 text-green-700" :
                warehouseStatus === "processing" ? "bg-blue-100 text-blue-700" :
                                                   "bg-gray-100 text-gray-500"
              }`}
              title="מחסן"
            >
              {warehouseStatus === "ready" ? "✓ מחסן" : warehouseStatus === "processing" ? "מחסן" : "מחסן ⏳"}
            </span>
          )}
          {showFab && (
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                fabStatus === "completed" || fabStatus === "ready" ? "bg-green-100 text-green-700" :
                fabStatus === "in_progress"                        ? "bg-purple-100 text-purple-700" :
                fabStatus === "acknowledged"                       ? "bg-blue-100 text-blue-700" :
                                                                     "bg-gray-100 text-gray-500"
              }`}
              title="מסגרייה"
            >
              {fabStatus === "completed" || fabStatus === "ready" ? "✓ מסגר" : fabStatus === "in_progress" ? "מסגר" : "מסגר ⏳"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const RISK_BADGE: Record<
  "medium" | "high" | "critical",
  { label: string; cls: string }
> = {
  medium:   { label: "סיכון בינוני",  cls: "bg-amber-100 text-amber-700"  },
  high:     { label: "סיכון גבוה",    cls: "bg-orange-100 text-orange-700" },
  critical: { label: "סיכון קריטי",   cls: "bg-red-100 text-red-700"       },
};

interface OrderRowProps {
  order: WorkOrder;
  index: number;
  phoneMap: Map<string, string>;
  riskScore: OrderRiskScore | undefined;
  onUpdateStatus: (id: string, status: WorkOrderStatus) => void;
  onApproveCustomer: (id: string) => void;
}

function OrderRow({ order, index, phoneMap, riskScore, onUpdateStatus, onApproveCustomer }: OrderRowProps) {
  const phone = phoneMap.get(order.customer.trim().toLowerCase());
  const lastUpdated = getLastUpdated(order);
  const relative = relativeTime(lastUpdated);
  const signCount = order.signRows.filter((r) => r.signNumber).length;
  const miscCount = order.miscRows.filter((r) => r.description).length;

  const isTerminal = order.status === "completed" || order.status === "cancelled";
  const slaColor   = !isTerminal ? getStageSlaColor(order) : "gray";
  const stageHours = !isTerminal ? hoursInCurrentStage(order) : 0;
  const fabCheck   = order.status === "production"
    ? canMarkReadyForInstallation(order)
    : { ok: true, reason: undefined };

  return (
    <tr
      className={`transition-colors hover:bg-gray-50/80 ${
        order.priority === "urgent" ? "border-r-2 border-red-400" : ""
      }`}
    >
      {/* # */}
      <td className="px-3 py-3.5 text-gray-400 text-xs w-8 text-center">{index}</td>

      {/* Order type icon */}
      <td className="px-2 py-3.5 text-center w-8">
        <OrderTypeIcon type={order.orderType ?? "field_work"} />
      </td>

      {/* Order number + job name */}
      <td className="px-3 py-3.5">
        <div className="flex flex-col gap-0.5">
          {order.jobName && (
            <span className="text-sm font-semibold text-gray-800 truncate max-w-[160px]" title={order.jobName}>
              {order.jobName}
            </span>
          )}
          <span className="font-mono text-xs font-bold text-gray-500 tracking-tight">{order.orderNumber}</span>
          {order.priority === "urgent" && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 w-fit">דחוף</span>
          )}
          {openProblemsCount(order) > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 w-fit">
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              {openProblemsCount(order)} בעיות
            </span>
          )}
          {riskScore && riskScore.level !== "low" && (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold w-fit ${RISK_BADGE[riskScore.level].cls}`}
              title={riskScore.factors.map(f => f.label).join(" · ")}
            >
              {RISK_BADGE[riskScore.level].label}
            </span>
          )}
          {signCount + miscCount > 0 && (
            <span className="text-[10px] text-gray-400">
              {[signCount > 0 && `${signCount} תמרורים`, miscCount > 0 && `${miscCount} שונות`].filter(Boolean).join(" + ")}
            </span>
          )}
          {order.orderType && order.orderType !== "field_work" && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold w-fit ${ORDER_TYPE_COLORS[order.orderType]}`}>
              {ORDER_TYPE_LABELS[order.orderType]}
              {order.orderType === "equipment_supply" && order.fulfillmentMethod && (
                <span className="mr-1 opacity-75">· {FULFILLMENT_LABELS[order.fulfillmentMethod]}</span>
              )}
            </span>
          )}
        </div>
      </td>

      {/* Customer */}
      <td className="px-3 py-3.5 max-w-[140px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-800 truncate">{order.customer || "—"}</span>
          {phone && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <PhoneIcon />
              {phone}
            </span>
          )}
        </div>
      </td>

      {/* Location */}
      <td className="px-3 py-3.5 max-w-[120px]">
        {order.location ? (
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <MapPinIcon />
            <span className="truncate">{order.location}</span>
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>

      {/* Date */}
      <td className="px-3 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-gray-700">{formatDate(order.createdAt)}</span>
          <span className="text-xs text-gray-400">{formatTime(order.createdAt)}</span>
        </div>
      </td>

      {/* Status */}
      <td className="px-3 py-3.5">
        <div className="flex flex-col gap-1">
          <StatusBadge status={order.status} />
          {order.orderType === "field_work" && order.customerApprovalStatus === "pending" && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 w-fit">
              ממתין לאישור לקוח
            </span>
          )}
          {(order.orderType === "pickup" || (order.orderType === "equipment_supply" && order.fulfillmentMethod === "self_pickup")) && order.status === "ready_installation" && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 w-fit">
              מוכן לאיסוף
            </span>
          )}
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

      {/* Progress */}
      <td className="px-3 py-3.5">
        <ProgressTracker order={order} />
      </td>

      {/* Last update */}
      <td className="px-3 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-600">{formatShortDateTime(lastUpdated)}</span>
          {relative && <span className="text-[10px] text-gray-400">{relative}</span>}
        </div>
      </td>

      {/* Actions */}
      <td className="px-3 py-3.5">
        <div className="flex items-center gap-1.5">
          {order.status === "graphics_done" && (
            <button
              onClick={() => onUpdateStatus(order.id, "production")}
              className="px-2 py-1 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors whitespace-nowrap"
            >
              העבר לייצור
            </button>
          )}
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
          {order.orderType === "field_work" && order.customerApprovalStatus === "pending" && (
            <button
              onClick={() => onApproveCustomer(order.id)}
              className="px-2 py-1 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors whitespace-nowrap"
            >
              ✓ אישור לקוח התקבל
            </button>
          )}
          {order.status === "ready_installation" && (
            <button
              onClick={() => onUpdateStatus(order.id, "completed")}
              className="px-2 py-1 rounded-lg text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 transition-colors whitespace-nowrap"
            >
              סמן כהושלם
            </button>
          )}
          {!isTerminal && (
            <button
              onClick={() => onUpdateStatus(order.id, "cancelled")}
              title="ביטול הזמנה"
              className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <XSmallIcon />
            </button>
          )}
          <button
            onClick={() => openWorkOrderPDF(order)}
            title="ייצוא PDF"
            className="px-1.5 py-1 rounded text-[10px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
          >
            PDF
          </button>
          <button
            onClick={() => exportWorkOrderCSV(order)}
            title="ייצוא Excel"
            className="px-1.5 py-1 rounded text-[10px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 transition-colors"
          >
            XLS
          </button>
        </div>
      </td>
    </tr>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  if (hasFilters) {
    return (
      <div className="py-16 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-gray-600 font-medium mb-1">לא נמצאו הזמנות התואמות לחיפוש</p>
        <p className="text-sm text-gray-400 mb-4">נסה לשנות את הסינון או החיפוש</p>
        <button
          onClick={onClear}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium underline"
        >
          נקה סינונים
        </button>
      </div>
    );
  }
  return (
    <div className="py-16 text-center">
      <div className="text-4xl mb-3">📋</div>
      <p className="text-gray-600 font-medium mb-1">לא נמצאו הזמנות במערכת</p>
      <p className="text-sm text-gray-400 mb-4">צור את ההזמנה הראשונה שלך</p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
      >
        <PlusIcon />
        פתח הזמנה חדשה
      </Link>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function OrdersTable() {
  const { orders, updateOrderStatus, approveCustomerOrder } = useOrdersContext();
  const { customers } = useCustomersContext();
  const riskScores = useOrderRiskScores();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "normal" | "urgent">("all");
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  // Build phone lookup map from customers
  const phoneMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) {
      if (c.name && c.phone) map.set(c.name.trim().toLowerCase(), c.phone);
    }
    return map;
  }, [customers]);

  // Derived counts for KPI cards
  const counts = useMemo(() => ({
    total: orders.length,
    completed: orders.filter((o) => o.status === "completed").length,
    graphicsPending: orders.filter((o) => o.status === "graphics_pending").length,
    graphicsActive: orders.filter((o) => o.status === "graphics_active").length,
    fabricationActive: orders.filter((o) => o.fabricationRequired && o.fabricationStatus !== "completed").length,
    withProblems: orders.filter((o) => hasOpenProblems(o)).length,
    urgent: orders.filter((o) => o.priority === "urgent").length,
  }), [orders]);

  const hasFilters = search !== "" || statusFilter !== "all" || priorityFilter !== "all" || showProblemsOnly;

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setShowProblemsOnly(false);
    setCurrentPage(0);
  }, []);

  const applyFilter = useCallback((status: WorkOrderStatus) => {
    setStatusFilter(status);
    setCurrentPage(0);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((o) => {
      const matchesSearch =
        !q ||
        o.customer.toLowerCase().includes(q) ||
        (o.location ?? "").toLowerCase().includes(q) ||
        o.orderNumber.toLowerCase().includes(q) ||
        (o.reference ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || o.priority === priorityFilter;
      const matchesProblems = !showProblemsOnly || hasOpenProblems(o);
      return matchesSearch && matchesStatus && matchesPriority && matchesProblems;
    });
  }, [orders, search, statusFilter, priorityFilter, showProblemsOnly]);

  // Reset page when filters change
  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const safePage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const paginated = filtered.slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE);

  const handleUpdateStatus = useCallback(
    (id: string, status: WorkOrderStatus) => {
      updateOrderStatus(id, status);
    },
    [updateOrderStatus]
  );

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <TableIcon />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">טבלת הזמנות</h1>
              <p className="text-sm text-gray-500">מרכז מעקב לכל ההזמנות במערכת</p>
            </div>
          </div>

          {/* Quick status chips */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              <span className="font-bold">{counts.total}</span> סה״כ
            </span>
            {counts.graphicsPending > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                <span className="font-bold">{counts.graphicsPending}</span> ממתינות לגרפיקה
              </span>
            )}
            {counts.graphicsActive > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                <span className="font-bold">{counts.graphicsActive}</span> בטיפול גרפיקה
              </span>
            )}
            {counts.urgent > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                {counts.urgent} דחופות
              </span>
            )}
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            icon={<KpiIcon type="total" />}
            iconBg="bg-blue-50 text-blue-600"
            value={counts.total}
            label="סה״כ הזמנות"
          />
          <KpiCard
            icon={<KpiIcon type="completed" />}
            iconBg="bg-green-50 text-green-600"
            value={counts.completed}
            label="הושלמו"
            onFilter={() => applyFilter("completed")}
          />
          <KpiCard
            icon={<KpiIcon type="fabrication" />}
            iconBg="bg-orange-50 text-orange-600"
            value={counts.fabricationActive}
            label="בטיפול מסגרייה"
            onFilter={() => { setStatusFilter("all"); setShowProblemsOnly(false); setCurrentPage(0); }}
          />
          <KpiCard
            icon={<KpiIcon type="active" />}
            iconBg="bg-blue-50 text-blue-600"
            value={counts.graphicsActive}
            label="בטיפול גרפיקה"
            onFilter={() => applyFilter("graphics_active")}
          />
          <KpiCard
            icon={<KpiIcon type="problems" />}
            iconBg="bg-red-50 text-red-600"
            value={counts.withProblems}
            label="בעיות בהזמנות"
            onFilter={() => { setShowProblemsOnly(true); setStatusFilter("all"); setCurrentPage(0); }}
          />
        </div>

        {/* ── Filter Bar ── */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-52 border border-gray-200 rounded-lg px-3 py-2">
            <SearchIcon />
            <input
              type="text"
              placeholder="חיפוש לפי לקוח, מיקום, מספר הזמנה..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(0); }}
              className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
              dir="rtl"
            />
            {search && (
              <button onClick={() => { setSearch(""); setCurrentPage(0); }} className="text-gray-400 hover:text-gray-600">
                <XSmallIcon />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 whitespace-nowrap font-medium">סטטוס:</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as WorkOrderStatus | "all"); setCurrentPage(0); }}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="all">הכל</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Priority filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 whitespace-nowrap font-medium">עדיפות:</label>
            <select
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value as "all" | "normal" | "urgent"); setCurrentPage(0); }}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="all">הכל</option>
              <option value="normal">רגיל</option>
              <option value="urgent">דחוף</option>
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium underline whitespace-nowrap"
            >
              נקה סינונים
            </button>
          )}

          <div className="mr-auto">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
            >
              <PlusIcon />
              הזמנה חדשה
            </Link>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right" dir="rtl">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 w-8 text-center">#</th>
                      <th className="px-2 py-3 text-xs font-semibold text-gray-500 w-8 text-center whitespace-nowrap">אופי</th>
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">שם / מספר הזמנה</th>
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">לקוח</th>
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">מיקום</th>
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">תאריך יצירה</th>
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">סטטוס</th>
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">התקדמות</th>
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">עדכון אחרון</th>
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map((order, idx) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        index={filtered.length - (safePage * ROWS_PER_PAGE + idx)}
                        phoneMap={phoneMap}
                        riskScore={riskScores.get(order.id)}
                        onUpdateStatus={handleUpdateStatus}
                        onApproveCustomer={approveCustomerOrder}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Table Footer / Pagination ── */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                <span className="text-xs text-gray-500">
                  מוצג{" "}
                  <span className="font-semibold text-gray-700">
                    {safePage * ROWS_PER_PAGE + 1}–{Math.min((safePage + 1) * ROWS_PER_PAGE, filtered.length)}
                  </span>{" "}
                  מתוך{" "}
                  <span className="font-semibold text-gray-700">{filtered.length}</span>{" "}
                  הזמנות
                  {hasFilters && orders.length !== filtered.length && (
                    <span className="text-gray-400"> (מתוך {orders.length} סה״כ)</span>
                  )}
                </span>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                      disabled={safePage === 0}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                          i === safePage
                            ? "bg-blue-600 text-white"
                            : "border border-gray-200 text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={safePage >= totalPages - 1}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
