"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
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
  FABRICATION_STATUS_LABELS,
} from "@/types/workOrder";
import type { WorkOrder, WorkOrderStatus } from "@/types/workOrder";
import { getStageSlaColor, hoursInCurrentStage, canMarkReadyForInstallation, canMarkOperationallyComplete } from "@/lib/workflowEngine";
import { useOrderRiskScores } from "@/hooks/useOrderRiskScores";
import type { OrderRiskScore } from "@/hooks/useOrderRiskScores";
import { openWorkOrderPDF, exportWorkOrderCSV } from "@/lib/pdfExport";
import { CancelOrderModal } from "@/components/Accounting";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDate } from "@/lib/dateFormatting";

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

// "all" filter shows only operational orders; completed/cancelled go to Accounting
const OPERATIONAL_STATUSES = new Set<WorkOrderStatus>([
  "graphics_pending",
  "graphics_active",
  "graphics_done",
  "production",
  "ready_installation",
]);

// ─── Helpers ───────────────────────────────────────────────────────────────

function getLastUpdated(order: WorkOrder): string {
  return order.updatedAt ?? order.graphicsCompletedAt ?? order.graphicsAcknowledgedAt ?? order.createdAt;
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
  if (type === "pickup") return <span title="הזמנה לאיסוף" className="text-lg leading-none select-none">📦</span>;
  if (type === "equipment_supply") return <span title="אספקת ציוד" className="text-lg leading-none select-none">🚚</span>;
  return <span title="ביצוע עבודה" className="text-lg leading-none select-none">🚧</span>;
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

// ─── Stage icons for the progress bar ─────────────────────────────────────

function StageIcon({ stageKey, active, done }: { stageKey: string; active: boolean; done: boolean }) {
  const cls = `w-2.5 h-2.5 flex-shrink-0 ${active ? "text-blue-600" : done ? "text-blue-400" : "text-gray-300"}`;
  switch (stageKey) {
    case "created":
      return (
        <svg className={cls} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1.5" y="0.5" width="7" height="9" rx="1"/>
          <line x1="3" y1="3.5" x2="7" y2="3.5"/>
          <line x1="3" y1="5.5" x2="6" y2="5.5"/>
        </svg>
      );
    case "graphics":
      return (
        <svg className={cls} viewBox="0 0 10 10" fill="currentColor">
          <path d="M7 1.5 9 3.5 4.5 8H2.5V6L7 1.5z"/>
        </svg>
      );
    case "production":
      return (
        <svg className={cls} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="5" cy="5" r="1.8"/>
          <line x1="5" y1="0.5" x2="5" y2="2.2"/>
          <line x1="5" y1="7.8" x2="5" y2="9.5"/>
          <line x1="0.5" y1="5" x2="2.2" y2="5"/>
          <line x1="7.8" y1="5" x2="9.5" y2="5"/>
        </svg>
      );
    case "installation":
      return (
        <svg className={cls} viewBox="0 0 10 10" fill="currentColor">
          <path d="M5 0.5a3 3 0 0 1 3 3c0 2.2-3 6-3 6S2 5.7 2 3.5a3 3 0 0 1 3-3zm0 1.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/>
        </svg>
      );
    case "completed":
      return (
        <svg className={cls} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1.5,5.5 4,8 8.5,2.5"/>
        </svg>
      );
    default:
      return <span className="w-2.5 h-2.5 flex-shrink-0"/>;
  }
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
      {/* Stage icons */}
      <div className="flex items-center gap-0">
        {LIFECYCLE_STAGES.map((stage, i) => {
          const isActive = i === activeStep;
          const isDone = i < completedSteps;
          return (
            <div key={stage.key} className="flex items-center">
              <StageIcon stageKey={stage.key} active={isActive} done={isDone} />
              {i < LIFECYCLE_STAGES.length - 1 && <div className="w-5" />}
            </div>
          );
        })}
      </div>
      {/* Department sub-indicators — icon + color, tooltip for detail */}
      {(showWarehouse || showFab) && (
        <div className="flex items-center gap-1 mt-0.5">
          {showWarehouse && (
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${
                warehouseStatus === "ready"      ? "bg-green-100 text-green-700" :
                warehouseStatus === "processing" ? "bg-blue-100 text-blue-700" :
                                                   "bg-gray-100 text-gray-500"
              }`}
              title={`מחסן: ${warehouseStatus === "ready" ? "מוכן" : warehouseStatus === "processing" ? "בהכנה" : "ממתין"}`}
            >
              {/* box / warehouse icon */}
              <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4L5 2l4 2v4.5H1V4z"/>
                <path d="M1 4l4 2 4-2"/>
                <line x1="5" y1="6" x2="5" y2="8.5"/>
              </svg>
            </span>
          )}
          {showFab && (
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${
                fabStatus === "completed"    ? "bg-green-100 text-green-700" :
                fabStatus === "ready"        ? "bg-teal-100 text-teal-700" :
                fabStatus === "in_progress"  ? "bg-purple-100 text-purple-700" :
                fabStatus === "acknowledged" ? "bg-blue-100 text-blue-700" :
                fabStatus === "issue"        ? "bg-red-100 text-red-700" :
                                               "bg-gray-100 text-gray-500"
              }`}
              title={`מסגרייה: ${
                fabStatus === "completed"    ? "הושלם" :
                fabStatus === "ready"        ? "מוכן (ממתין לסגירה)" :
                fabStatus === "in_progress"  ? "בביצוע" :
                fabStatus === "acknowledged" ? "התקבל" :
                fabStatus === "issue"        ? "בעיה" : "ממתין"
              }`}
            >
              {/* wrench / fabrication icon */}
              <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 10" fill="currentColor">
                <path d="M8 1.3a2.2 2.2 0 0 0-2.8 2.8L2 7.2a.8.8 0 1 0 1.1 1.1L6.3 5a2.2 2.2 0 0 0 2.8-2.8L7.5 3.7 6.5 2.8 8 1.3z"/>
              </svg>
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

interface PendingStatusChange {
  order: WorkOrder;
  nextStatus: WorkOrderStatus | null;
  action: "approveCustomer" | "updateStatus";
  title: string;
  body: string;
}

interface OrderRowProps {
  order: WorkOrder;
  index: number;
  phoneMap: Map<string, string>;
  riskScore: OrderRiskScore | undefined;
  onUpdateStatus: (id: string, status: WorkOrderStatus) => Promise<void>;
  onApproveCustomer: (id: string) => Promise<void>;
  onSelect: (order: WorkOrder) => void;
  onStartComplete: (order: WorkOrder) => void;
  onRequestCancel: (order: WorkOrder) => void;
  onRequestStatusChange: (change: PendingStatusChange) => void;
}

function OrderRow({ order, index, phoneMap, riskScore, onSelect, onStartComplete, onRequestCancel, onRequestStatusChange }: OrderRowProps) {
  const phone = phoneMap.get(order.customer.trim().toLowerCase());
  const lastUpdated = getLastUpdated(order);
  const relative = relativeTime(lastUpdated);
  const signCount = order.signRows.filter((r) => r.signNumber).length;
  const miscCount = order.miscRows.filter((r) => r.description).length;

  const isTerminal = order.status === "completed" || order.status === "cancelled";
  const slaColor   = !isTerminal ? getStageSlaColor(order) : "gray";
  const stageHours = !isTerminal ? hoursInCurrentStage(order) : 0;
  const fabCheck      = order.status === "production"
    ? canMarkReadyForInstallation(order)
    : { ok: true, reason: undefined };
  const completeCheck = order.status === "ready_installation"
    ? canMarkOperationallyComplete(order)
    : { ok: true, reason: undefined };

  return (
    <tr
      onClick={() => onSelect(order)}
      className={`transition-colors hover:bg-blue-50/50 cursor-pointer ${
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
          {(order.generalNotes || order.notes) && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 w-fit" title={order.generalNotes || order.notes || ""}>
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
              הערה
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
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
            מיקום חסר
          </span>
        )}
      </td>

      {/* Date */}
      <td className="px-3 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-gray-700">{formatDate(order.createdAt)}</span>
          <span className="text-xs text-gray-400">{formatTime(order.createdAt)}</span>
        </div>
      </td>

      {/* Progress */}
      <td className="px-3 py-3.5">
        <ProgressTracker order={order} />
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

      {/* Last update */}
      <td className="px-3 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-600">{formatShortDateTime(lastUpdated)}</span>
          {relative && <span className="text-[10px] text-gray-400">{relative}</span>}
        </div>
      </td>

      {/* Actions */}
      <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          {order.status === "graphics_done" && (order.fabricationRequired || order.warehouseRequired) && (
            <button
              onClick={() => onRequestStatusChange({
                order, nextStatus: "production", action: "updateStatus",
                title: "העברה לשלב ייצור",
                body: `הזמנה #${order.orderNumber} · ${order.customer} תועבר לשלב ייצור. הפעולה ניתנת לביטול בשלב זה.`,
              })}
              className="px-2 py-1 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors whitespace-nowrap"
            >
              שלח לייצור
            </button>
          )}
          {order.status === "graphics_done" && !order.fabricationRequired && !order.warehouseRequired && (
            <button
              onClick={() => onRequestStatusChange({
                order, nextStatus: "ready_installation", action: "updateStatus",
                title: "סימון כמוכן להתקנה",
                body: `הזמנה #${order.orderNumber} · ${order.customer} תסומן כמוכנה להתקנה וניתן יהיה לסגור אותה תפעולית.`,
              })}
              className="px-2 py-1 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors whitespace-nowrap"
            >
              מוכן להתקנה
            </button>
          )}
          {order.status === "production" && (
            <button
              onClick={() => {
                if (fabCheck.ok) onRequestStatusChange({
                  order, nextStatus: "ready_installation", action: "updateStatus",
                  title: "סימון כמוכן להתקנה",
                  body: `הזמנה #${order.orderNumber} · ${order.customer} תסומן כמוכנה להתקנה וניתן יהיה לסגור אותה תפעולית.`,
                });
              }}
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
              onClick={() => onRequestStatusChange({
                order, nextStatus: null, action: "approveCustomer",
                title: "אישור קבלת אישור לקוח",
                body: `הזמנה #${order.orderNumber} · ${order.customer} — מאשר שאישור לקוח התקבל. פעולה זו מסירה את דגל 'ממתין לאישור לקוח'.`,
              })}
              className="px-2 py-1 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors whitespace-nowrap"
            >
              ✓ אישור לקוח התקבל
            </button>
          )}
          {order.status === "ready_installation" && (
            <button
              onClick={() => { if (completeCheck.ok) onStartComplete(order); }}
              disabled={!completeCheck.ok}
              title={!completeCheck.ok ? completeCheck.reason : undefined}
              className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                completeCheck.ok
                  ? "text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                  : "text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed opacity-60"
              }`}
            >
              סמן כהושלם תפעולית
            </button>
          )}
          {!isTerminal && (
            <button
              onClick={() => onRequestCancel(order)}
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
            title="ייצוא CSV"
            className="px-1.5 py-1 rounded text-[10px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 transition-colors"
          >
            CSV
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Complete Order Confirmation Modal ────────────────────────────────────

function CompleteOrderModal({ order, onConfirm, onCancel }: {
  order: WorkOrder;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEscapeKey(onCancel, saveState !== "saving");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 z-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">סיום תפעולי</h2>
            <p className="text-xs text-gray-400">הושלם תפעולית — יועבר לאימות חיוב</p>
          </div>
        </div>

        {/* Order summary */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">מספר הזמנה</span>
            <span className="font-mono font-bold text-gray-900">{order.orderNumber}</span>
          </div>
          {order.jobName && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">שם עבודה</span>
              <span className="font-semibold text-gray-900 text-right max-w-[60%] truncate">{order.jobName}</span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">לקוח</span>
            <span className="font-semibold text-gray-900">{order.customer}</span>
          </div>
          {order.location && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">מיקום</span>
              <span className="text-gray-700 text-right max-w-[60%] truncate">{order.location}</span>
            </div>
          )}
        </div>

        {/* Explanation */}
        <div className="bg-blue-50 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs text-blue-700 leading-relaxed">
            לאחר האישור, ההזמנה תסומן כ<strong>הושלמה תפעולית</strong> ותופיע בהנהלת חשבונות לאימות מוכנות לחיוב.
            לא תישלח חשבונית אוטומטית.
          </p>
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer mb-5 select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          <span className="text-sm text-gray-700 leading-snug">
            אני מאשר/ת שהעבודה הושלמה תפעולית — מוכן לאימות חיוב
          </span>
        </label>

        {saveState === "error" && (
          <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            שגיאה: {errorMsg}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setSaveState("saving");
              setErrorMsg("");
              try {
                await onConfirm();
                onCancel();
              } catch (e) {
                setSaveState("error");
                setErrorMsg(e instanceof Error ? e.message : "שגיאה לא ידועה");
              }
            }}
            disabled={!checked || saveState === "saving"}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saveState === "saving" ? "שומר..." : saveState === "error" ? "נסה שוב" : "אשר סיום תפעולי"}
          </button>
          <button
            onClick={onCancel}
            disabled={saveState === "saving"}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Detail Slide-Over ───────────────────────────────────────────────

function OrderDetailPanel({
  order,
  onClose,
  onUpdateFields,
}: {
  order: WorkOrder;
  onClose: () => void;
  onUpdateFields: (id: string, fields: Partial<WorkOrder>) => Promise<void>;
}) {
  const [pdfExporting, setPdfExporting] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState(order.location ?? "");
  const [locationSaveState, setLocationSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [editingJobName, setEditingJobName] = useState(false);
  const [jobNameDraft, setJobNameDraft] = useState(order.jobName ?? "");
  const [jobNameSaveState, setJobNameSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(order.generalNotes ?? order.notes ?? "");
  const [notesSaveState, setNotesSaveState] = useState<"idle" | "saved" | "error">("idle");

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!editingLocation) setLocationDraft(order.location ?? ""); }, [order.location, editingLocation]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!editingJobName) setJobNameDraft(order.jobName ?? ""); }, [order.jobName, editingJobName]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!editingNotes) setNotesDraft(order.generalNotes ?? order.notes ?? ""); }, [order.generalNotes, order.notes, editingNotes]);

  useEscapeKey(onClose);

  const signCount = (order.signRows ?? []).filter(r => r.signNumber).length;
  const miscCount = (order.miscRows ?? []).filter(r => r.description).length;
  const accessoryCount = (order.accessoryRows ?? []).filter(r => r.description).length;

  async function handlePDF() {
    setPdfExporting(true);
    try { await openWorkOrderPDF(order); } finally { setPdfExporting(false); }
  }

  async function saveLocation() {
    setEditingLocation(false);
    try {
      await onUpdateFields(order.id, { location: locationDraft.trim() || undefined });
      setLocationSaveState("saved");
      setTimeout(() => setLocationSaveState("idle"), 2500);
    } catch {
      setLocationSaveState("error");
      setTimeout(() => setLocationSaveState("idle"), 3000);
    }
  }

  async function saveJobName() {
    setEditingJobName(false);
    try {
      await onUpdateFields(order.id, { jobName: jobNameDraft.trim() || null });
      setJobNameSaveState("saved");
      setTimeout(() => setJobNameSaveState("idle"), 2500);
    } catch {
      setJobNameSaveState("error");
      setTimeout(() => setJobNameSaveState("idle"), 3000);
    }
  }

  async function saveNotes() {
    setEditingNotes(false);
    try {
      await onUpdateFields(order.id, { generalNotes: notesDraft.trim() });
      setNotesSaveState("saved");
      setTimeout(() => setNotesSaveState("idle"), 2500);
    } catch {
      setNotesSaveState("error");
      setTimeout(() => setNotesSaveState("idle"), 3000);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed top-0 left-0 h-full w-full max-w-lg bg-white z-50 shadow-2xl overflow-y-auto"
        dir="rtl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="font-mono text-xs text-gray-400 font-bold">{order.orderNumber}</p>
            {order.jobName && (
              <p className="font-semibold text-gray-900 text-base leading-tight mt-0.5">{order.jobName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="סגור"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status + Priority */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
            {order.priority === "urgent" && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">דחוף</span>
            )}
            {order.orderType && order.orderType !== "field_work" && (
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${ORDER_TYPE_COLORS[order.orderType]}`}>
                {ORDER_TYPE_LABELS[order.orderType]}
              </span>
            )}
          </div>

          {/* Key details grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Job name — editable */}
            <div className="bg-gray-50 rounded-lg p-3 col-span-2">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-[10px] text-gray-400 font-medium">שם עבודה</p>
                <div className="flex items-center gap-2">
                  {jobNameSaveState === "saved" && <span className="text-[10px] text-green-600 font-medium">✓ נשמר</span>}
                  {jobNameSaveState === "error" && <span className="text-[10px] text-red-600 font-medium">שגיאה</span>}
                  <button onClick={() => { setJobNameDraft(order.jobName ?? ""); setEditingJobName(true); }} className="text-[10px] text-blue-500 hover:text-blue-700">עריכה</button>
                </div>
              </div>
              {editingJobName ? (
                <div className="flex gap-2 mt-1">
                  <input autoFocus value={jobNameDraft} onChange={e => setJobNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveJobName(); if (e.key === "Escape") setEditingJobName(false); }}
                    className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300" dir="rtl" />
                  <button onClick={saveJobName} className="text-xs px-2 py-1 rounded bg-blue-600 text-white">שמור</button>
                  <button onClick={() => setEditingJobName(false)} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500">ביטול</button>
                </div>
              ) : (
                <p className="text-sm font-semibold text-gray-800">{order.jobName || <span className="text-gray-300 font-normal">לא הוזן</span>}</p>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 font-medium mb-0.5">לקוח</p>
              <p className="text-sm font-semibold text-gray-800">{order.customer || "—"}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 font-medium mb-0.5">תאריך</p>
              <p className="text-sm font-semibold text-gray-800">{formatDate(order.date)}</p>
            </div>

            {/* Location — always shown, editable */}
            <div className={`rounded-lg p-3 col-span-2 ${order.location ? "bg-gray-50" : "bg-amber-50 border border-amber-200"}`}>
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-[10px] text-gray-400 font-medium">מיקום</p>
                <div className="flex items-center gap-2">
                  {locationSaveState === "saved" && <span className="text-[10px] text-green-600 font-medium">✓ נשמר</span>}
                  {locationSaveState === "error" && <span className="text-[10px] text-red-600 font-medium">שגיאה</span>}
                  <button onClick={() => { setLocationDraft(order.location ?? ""); setEditingLocation(true); }} className="text-[10px] text-blue-500 hover:text-blue-700">עריכה</button>
                </div>
              </div>
              {editingLocation ? (
                <div className="flex gap-2 mt-1">
                  <input autoFocus value={locationDraft} onChange={e => setLocationDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveLocation(); if (e.key === "Escape") setEditingLocation(false); }}
                    placeholder="הזן מיקום..."
                    className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300" dir="rtl" />
                  <button onClick={saveLocation} className="text-xs px-2 py-1 rounded bg-blue-600 text-white">שמור</button>
                  <button onClick={() => setEditingLocation(false)} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500">ביטול</button>
                </div>
              ) : (
                <p className="text-sm font-semibold text-gray-800">
                  {order.location || <span className="text-amber-600 font-semibold text-xs">מיקום חסר — לחץ עריכה להוספה</span>}
                </p>
              )}
            </div>

            {order.contactPerson && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[10px] text-gray-400 font-medium mb-0.5">איש קשר</p>
                <p className="text-sm font-semibold text-gray-800">{order.contactPerson}</p>
              </div>
            )}
            {order.orderedBy && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[10px] text-gray-400 font-medium mb-0.5">הוזמן ע״י</p>
                <p className="text-sm font-semibold text-gray-800">{order.orderedBy}</p>
              </div>
            )}
          </div>

          {/* Department statuses */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">שלבי עיבוד</p>
            <div className="space-y-1.5">
              {/* Graphics */}
              <div className="flex items-center justify-between py-1.5 px-3 bg-blue-50 rounded-lg">
                <span className="text-xs font-medium text-blue-700">גרפיקה</span>
                <span className="text-xs text-blue-600">
                  {order.graphicsCompletedAt ? "הושלמה" : order.graphicsAcknowledgedAt ? "בביצוע" : "ממתינה"}
                </span>
              </div>
              {/* Warehouse */}
              {order.warehouseRequired && (
                <div className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                  order.warehouseStatus === "ready" ? "bg-green-50" : "bg-amber-50"
                }`}>
                  <span className={`text-xs font-medium ${order.warehouseStatus === "ready" ? "text-green-700" : "text-amber-700"}`}>מחסן</span>
                  <span className={`text-xs ${order.warehouseStatus === "ready" ? "text-green-600" : "text-amber-600"}`}>
                    {order.warehouseStatus === "ready" ? "מוכן" : order.warehouseStatus === "processing" ? "בביצוע" : "ממתין"}
                  </span>
                </div>
              )}
              {/* Fabrication */}
              {order.fabricationRequired && (
                <div className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                  order.fabricationStatus === "completed" ? "bg-green-50" :
                  order.fabricationStatus === "issue" ? "bg-red-50" : "bg-orange-50"
                }`}>
                  <span className={`text-xs font-medium ${
                    order.fabricationStatus === "completed" ? "text-green-700" :
                    order.fabricationStatus === "issue" ? "text-red-700" : "text-orange-700"
                  }`}>מסגרייה</span>
                  <span className={`text-xs ${
                    order.fabricationStatus === "completed" ? "text-green-600" :
                    order.fabricationStatus === "issue" ? "text-red-600" : "text-orange-600"
                  }`}>
                    {order.fabricationStatus ? FABRICATION_STATUS_LABELS[order.fabricationStatus] ?? order.fabricationStatus : "ממתין"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Items summary */}
          {(signCount + miscCount + accessoryCount) > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">פריטים</p>
              <div className="flex gap-2 flex-wrap">
                {signCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">{signCount} תמרורים</span>
                )}
                {miscCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">{miscCount} שונות</span>
                )}
                {accessoryCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">{accessoryCount} אביזרים</span>
                )}
              </div>

              {/* Sign row details */}
              {(order.signRows ?? []).filter(r => r.signNumber).length > 0 && (
                <div className="mt-2 space-y-1">
                  {(order.signRows ?? []).filter(r => r.signNumber).map(r => (
                    <div key={r.id} className="flex items-center justify-between text-xs py-1 px-2 bg-gray-50 rounded">
                      <span className="font-mono text-gray-600">{r.signNumber}</span>
                      <div className="flex items-center gap-2 text-gray-500">
                        {r.size && <span>{r.size}</span>}
                        <span>×{r.quantity || 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Misc row details */}
              {(order.miscRows ?? []).filter(r => r.description).length > 0 && (
                <div className="mt-2 space-y-1">
                  {(order.miscRows ?? []).filter(r => r.description).map(r => (
                    <div key={r.id} className="flex items-center justify-between text-xs py-1 px-2 bg-gray-50 rounded">
                      <span className="text-gray-600">{r.description}</span>
                      <span className="text-gray-500">×{r.quantity || 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes — editable */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-500">הערות</p>
              <div className="flex items-center gap-2">
                {notesSaveState === "saved" && <span className="text-[10px] text-green-600 font-medium">✓ נשמר</span>}
                {notesSaveState === "error" && <span className="text-[10px] text-red-600 font-medium">שגיאה</span>}
                <button onClick={() => { setNotesDraft(order.generalNotes ?? order.notes ?? ""); setEditingNotes(true); }} className="text-[10px] text-blue-500 hover:text-blue-700">עריכה</button>
              </div>
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} rows={3}
                  className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 resize-none" dir="rtl" />
                <div className="flex gap-2">
                  <button onClick={saveNotes} className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white">שמור</button>
                  <button onClick={() => setEditingNotes(false)} className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-500">ביטול</button>
                </div>
              </div>
            ) : (order.generalNotes || order.notes) ? (
              <p className="text-sm text-gray-700 bg-amber-50 rounded-lg p-3">{order.generalNotes || order.notes}</p>
            ) : (
              <p className="text-xs text-gray-300 italic">אין הערות</p>
            )}
          </div>

          {/* Open problems */}
          {openProblemsCount(order) > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 mb-1">בעיות פתוחות ({openProblemsCount(order)})</p>
              <div className="space-y-1">
                {(order.problems ?? []).filter(p => p.status === "open").map(p => (
                  <div key={p.id} className="text-xs text-red-700 bg-red-50 rounded-lg p-2.5">{p.description}</div>
                ))}
              </div>
            </div>
          )}

          {/* Export actions */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2">ייצוא</p>
            <div className="flex gap-2">
              <button
                onClick={handlePDF}
                disabled={pdfExporting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {pdfExporting ? "..." : "PDF"}
              </button>
              <button
                onClick={() => exportWorkOrderCSV(order)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 text-sm font-semibold transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                CSV
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
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

// ─── Draft Orders Panel ────────────────────────────────────────────────────

function DraftOrdersPanel({ drafts, onDelete }: { drafts: WorkOrder[]; onDelete: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (drafts.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <span className="text-sm font-bold text-amber-800">טיוטות הזמנות ({drafts.length})</span>
          <span className="text-xs text-amber-600">— הזמנות שנשמרו כטיוטה</span>
        </div>
        <svg className={`w-4 h-4 text-amber-600 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="border-t border-amber-200 divide-y divide-amber-100">
          {drafts.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 bg-white/60 hover:bg-white/80 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {d.jobName && (
                    <span className="text-sm font-semibold text-gray-800 truncate">{d.jobName}</span>
                  )}
                  <span className="font-mono text-xs text-gray-400">{d.orderNumber}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {d.customer && <span className="text-xs text-gray-500">{d.customer}</span>}
                  {d.location && <span className="text-xs text-gray-400">{d.location}</span>}
                  <span className="text-xs text-gray-400">{new Date(d.createdAt).toLocaleDateString("he-IL")}</span>
                </div>
              </div>
              <Link
                href={`/new-order?edit=${d.id}`}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors whitespace-nowrap"
              >
                המשך עריכה
              </Link>
              <button
                type="button"
                disabled={deletingId === d.id}
                onClick={async () => {
                  setDeletingId(d.id);
                  try { await onDelete(d.id); } finally { setDeletingId(null); }
                }}
                className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                title="מחק טיוטה"
              >
                <XSmallIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function OrdersTable() {
  const { orders, updateOrderStatus, updateOrderFields, approveCustomerOrder, deleteOrder } = useOrdersContext();
  const { customers } = useCustomersContext();
  const riskScores = useOrderRiskScores();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "normal" | "urgent">("all");
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );
  const [completingOrder, setCompletingOrder] = useState<WorkOrder | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState<WorkOrder | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // Build phone lookup map from customers
  const phoneMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) {
      if (c.name && c.phone) map.set(c.name.trim().toLowerCase(), c.phone);
    }
    return map;
  }, [customers]);

  const draftOrders = useMemo(
    () => orders.filter(o => o.status === "draft").sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [orders]
  );

  // Derived counts for KPI cards — all scoped to operational (non-terminal) orders
  const counts = useMemo(() => {
    const operational = orders.filter((o) => OPERATIONAL_STATUSES.has(o.status));
    return {
      total: operational.length,
      completed: orders.filter((o) => o.status === "completed").length,
      readyInstallation: orders.filter((o) => o.status === "ready_installation").length,
      warehouseProcessing: orders.filter((o) =>
        o.warehouseRequired && o.warehouseStatus === "processing" &&
        o.status !== "completed" && o.status !== "cancelled"
      ).length,
      graphicsPending: operational.filter((o) => o.status === "graphics_pending").length,
      graphicsActive: operational.filter((o) => o.status === "graphics_active").length,
      fabricationActive: operational.filter((o) => o.fabricationRequired && o.fabricationStatus !== "completed").length,
      withProblems: operational.filter((o) => hasOpenProblems(o)).length,
      urgent: operational.filter((o) => o.priority === "urgent").length,
    };
  }, [orders]);

  const completedOrders = useMemo(
    () => showCompleted
      ? orders
          .filter(o => o.status === "completed")
          .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
          .slice(0, 30)
      : [],
    [orders, showCompleted]
  );

  const hasFilters = search !== "" || statusFilter !== "all" || priorityFilter !== "all" || showProblemsOnly || warehouseFilter;

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setShowProblemsOnly(false);
    setWarehouseFilter(false);
    setCurrentPage(0);
  }, []);

  const applyFilter = useCallback((status: WorkOrderStatus) => {
    setStatusFilter(status);
    setWarehouseFilter(false);
    setCurrentPage(0);
  }, []);

  const applyWarehouseFilter = useCallback(() => {
    setWarehouseFilter(true);
    setStatusFilter("all");
    setShowProblemsOnly(false);
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
      const matchesStatus = statusFilter === "all"
        ? OPERATIONAL_STATUSES.has(o.status)
        : o.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || o.priority === priorityFilter;
      const matchesProblems = !showProblemsOnly || hasOpenProblems(o);
      const matchesWarehouse = !warehouseFilter || (o.warehouseRequired && o.warehouseStatus === "processing");
      return matchesSearch && matchesStatus && matchesPriority && matchesProblems && matchesWarehouse;
    });
  }, [orders, search, statusFilter, priorityFilter, showProblemsOnly, warehouseFilter]);

  // Reset page when filters change
  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const safePage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const paginated = filtered.slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE);

  const handleUpdateStatus = useCallback(
    async (id: string, status: WorkOrderStatus): Promise<void> => {
      await updateOrderStatus(id, status);
    },
    [updateOrderStatus]
  );

  return (
    <div className="min-h-screen bg-surface py-6 px-4">
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
              <span className="font-bold">{counts.total}</span> פעילות
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

        {/* ── Draft Orders ── */}
        <DraftOrdersPanel drafts={draftOrders} onDelete={deleteOrder} />

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            icon={<KpiIcon type="total" />}
            iconBg="bg-blue-50 text-blue-600"
            value={counts.total}
            label="הזמנות פעילות"
          />
          <KpiCard
            icon={<KpiIcon type="completed" />}
            iconBg="bg-teal-50 text-teal-600"
            value={counts.readyInstallation}
            label="מוכנים לתיאום"
            onFilter={() => applyFilter("ready_installation")}
          />
          <KpiCard
            icon={<KpiIcon type="fabrication" />}
            iconBg="bg-cyan-50 text-cyan-600"
            value={counts.warehouseProcessing}
            label="בטיפול מחסן"
            onFilter={applyWarehouseFilter}
          />
          <KpiCard
            icon={<KpiIcon type="fabrication" />}
            iconBg="bg-orange-50 text-orange-600"
            value={counts.fabricationActive}
            label="בטיפול מסגרייה"
            onFilter={() => { setStatusFilter("all"); setWarehouseFilter(false); setShowProblemsOnly(false); setCurrentPage(0); }}
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
            onFilter={() => { setShowProblemsOnly(true); setStatusFilter("all"); setWarehouseFilter(false); setCurrentPage(0); }}
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

          {/* Warehouse filter active badge */}
          {warehouseFilter && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
              בטיפול מחסן
              <button onClick={() => { setWarehouseFilter(false); setCurrentPage(0); }} className="hover:text-cyan-900">
                <XSmallIcon />
              </button>
            </span>
          )}

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 whitespace-nowrap font-medium">סטטוס:</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as WorkOrderStatus | "all"); setWarehouseFilter(false); setCurrentPage(0); }}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="all">פעילות</option>
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

          <button
            type="button"
            onClick={() => setShowCompleted(v => !v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
              showCompleted
                ? "bg-gray-200 text-gray-700 border-gray-300"
                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {showCompleted ? "הסתר הושלמו" : "הצג הושלמו"}
          </button>

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
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">התקדמות</th>
                      <th className="px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">סטטוס</th>
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
                        onSelect={(o) => setSelectedOrderId(o.id)}
                        onStartComplete={setCompletingOrder}
                        onRequestCancel={setCancelingOrder}
                        onRequestStatusChange={setPendingStatusChange}
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
        {/* ── Completed Orders Section ── */}
        {showCompleted && (
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span className="text-sm font-bold text-gray-500">הושלמו ({counts.completed})</span>
              {counts.completed > 30 && <span className="text-xs text-gray-400">מוצגות 30 האחרונות</span>}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden opacity-80">
              {completedOrders.length === 0 ? (
                <div className="py-10 text-center text-xs text-gray-400">אין הזמנות שהושלמו</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right" dir="rtl">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-3 text-xs font-semibold text-gray-500 w-8 text-center">#</th>
                        <th className="px-2 py-3 text-xs font-semibold text-gray-500 w-8 text-center">אופי</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-500">שם / מספר הזמנה</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-500">לקוח</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-500">מיקום</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-500">תאריך יצירה</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-500">התקדמות</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-500">סטטוס</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-500">עדכון אחרון</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-500">פעולות</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {completedOrders.map((order, idx) => (
                        <OrderRow
                          key={order.id}
                          order={order}
                          index={completedOrders.length - idx}
                          phoneMap={phoneMap}
                          riskScore={riskScores.get(order.id)}
                          onUpdateStatus={handleUpdateStatus}
                          onApproveCustomer={approveCustomerOrder}
                          onSelect={(o) => setSelectedOrderId(o.id)}
                          onStartComplete={setCompletingOrder}
                          onRequestCancel={setCancelingOrder}
                          onRequestStatusChange={setPendingStatusChange}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Order Detail Slide-Over */}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrderId(null)}
          onUpdateFields={updateOrderFields}
        />
      )}

      {/* Complete Order Confirmation Modal */}
      {completingOrder && (
        <CompleteOrderModal
          order={completingOrder}
          onConfirm={() => handleUpdateStatus(completingOrder.id, "completed")}
          onCancel={() => setCompletingOrder(null)}
        />
      )}

      {/* Cancel Order Modal */}
      {cancelingOrder && (
        <CancelOrderModal
          order={cancelingOrder}
          onConfirm={() => updateOrderStatus(cancelingOrder.id, "cancelled")}
          onClose={() => setCancelingOrder(null)}
        />
      )}

      {/* Status transition confirmation */}
      {pendingStatusChange && (
        <ConfirmDialog
          title={pendingStatusChange.title}
          body={<p className="text-sm text-gray-600">{pendingStatusChange.body}</p>}
          confirmLabel="אשר"
          variant="warning"
          onConfirm={async () => {
            const { order, action, nextStatus } = pendingStatusChange;
            if (action === "approveCustomer") {
              await approveCustomerOrder(order.id);
            } else if (nextStatus) {
              await handleUpdateStatus(order.id, nextStatus);
            }
            setPendingStatusChange(null);
          }}
          onClose={() => setPendingStatusChange(null)}
        />
      )}
    </div>
  );
}
