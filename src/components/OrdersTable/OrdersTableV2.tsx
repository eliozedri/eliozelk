"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronDown, ChevronUp, MapPin, AlertTriangle,
  Wrench, Package, Receipt, CheckCircle2, ArrowLeft,
} from "lucide-react";
import { useOrdersContext } from "@/context/OrdersContext";
import {
  STATUS_LABELS, STATUS_COLORS, getProgressState,
  hasOpenProblems, openProblemsCount, FABRICATION_STATUS_LABELS,
} from "@/types/workOrder";
import type { WorkOrder, WorkOrderStatus } from "@/types/workOrder";
import { getStageSlaColor, hoursInCurrentStage } from "@/lib/workflowEngine";
import { formatDate } from "@/lib/dateFormatting";

// ─── Constants ────────────────────────────────────────────────────────────────

const OPERATIONAL: Set<WorkOrderStatus> = new Set([
  "graphics_pending", "graphics_active", "graphics_done",
  "production", "ready_installation",
]);

// ─── Display helpers ──────────────────────────────────────────────────────────

type UrgencyLevel = "critical" | "warning" | "ok";

function getUrgencyLevel(order: WorkOrder, slaColor: string): UrgencyLevel {
  if (order.priority === "urgent" || slaColor === "red") return "critical";
  if (slaColor === "yellow" || hasOpenProblems(order)) return "warning";
  return "ok";
}

function getNextAction(order: WorkOrder): { label: string; cls: string } {
  switch (order.status) {
    case "graphics_pending":
      return { label: "ממתין לאישור גרפיקה", cls: "text-amber-700 bg-amber-50 border border-amber-200" };
    case "graphics_active":
      return { label: "בטיפול גרפיקה", cls: "text-blue-700 bg-blue-50 border border-blue-200" };
    case "graphics_done":
      return { label: "מעבר לייצור", cls: "text-purple-700 bg-purple-50 border border-purple-200" };
    case "production":
      return { label: "בייצור", cls: "text-purple-700 bg-purple-50 border border-purple-200" };
    case "ready_installation":
      if (order.customerApprovalStatus === "pending")
        return { label: "ממתין לאישור לקוח", cls: "text-amber-700 bg-amber-50 border border-amber-200" };
      return { label: "מוכן להתקנה", cls: "text-teal-700 bg-teal-50 border border-teal-200" };
    default:
      return { label: "—", cls: "text-gray-400 bg-gray-50 border border-gray-100" };
  }
}

function getBillingReady(order: WorkOrder): boolean {
  return (
    order.status === "completed" &&
    (!order.accountingStatus ||
      order.accountingStatus === "pending" ||
      order.accountingStatus === "verified")
  );
}

function formatHours(hours: number): string {
  if (hours < 1) return "< 1ש׳";
  if (hours < 24) return `${Math.round(hours)}ש׳`;
  const d = Math.floor(hours / 24);
  return `${d}י׳`;
}

// ─── Progress dots ────────────────────────────────────────────────────────────

const STAGE_LABELS = ["נוצרה", "גרפיקה", "ייצור", "התקנה", "הושלם"] as const;

function V2ProgressDots({ order }: { order: WorkOrder }) {
  if (order.status === "cancelled") {
    return <span className="text-xs text-red-400 font-medium">בוטל</span>;
  }
  const { completedSteps, activeStep } = getProgressState(order.status);
  return (
    <div className="flex items-center" aria-label="שלבי התקדמות">
      {STAGE_LABELS.map((label, i) => {
        const done = i < completedSteps;
        const active = i === activeStep;
        return (
          <div key={label} className="flex items-center">
            <div
              className={[
                "w-2.5 h-2.5 rounded-full border shrink-0 transition-colors",
                done
                  ? "bg-blue-500 border-blue-500"
                  : active
                  ? "bg-white border-blue-500 ring-2 ring-blue-200"
                  : "bg-gray-200 border-gray-200",
              ].join(" ")}
              title={label}
            />
            {i < STAGE_LABELS.length - 1 && (
              <div
                className={`h-px w-4 shrink-0 transition-colors ${done ? "bg-blue-400" : "bg-gray-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Inline expanded panel ────────────────────────────────────────────────────

function V2ExpandedPanel({ order }: { order: WorkOrder }) {
  const problemCount = openProblemsCount(order);
  const note = order.generalNotes || order.notes;

  return (
    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">

        {/* Location */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">מיקום</p>
          {order.location ? (
            <div className="flex items-center gap-1.5 text-gray-700">
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="truncate text-xs">{order.location}</span>
            </div>
          ) : (
            <span className="text-xs text-amber-600 font-medium">חסר מיקום</span>
          )}
        </div>

        {/* Scheduled date */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">תאריך ביצוע</p>
          <p className="text-xs text-gray-700">
            {order.scheduledDate ? formatDate(order.scheduledDate) : "—"}
          </p>
        </div>

        {/* Fabrication */}
        {order.fabricationRequired && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">מסגרייה</p>
            <div className="flex items-center gap-1.5 text-gray-700">
              <Wrench className="w-3.5 h-3.5 shrink-0 text-gray-400" />
              <span className="text-xs">
                {order.fabricationStatus
                  ? FABRICATION_STATUS_LABELS[order.fabricationStatus]
                  : "ממתין"}
              </span>
            </div>
          </div>
        )}

        {/* Warehouse */}
        {order.warehouseRequired && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">מחסן</p>
            <div className="flex items-center gap-1.5 text-gray-700">
              <Package className="w-3.5 h-3.5 shrink-0 text-gray-400" />
              <span className="text-xs">
                {order.warehouseStatus === "ready"
                  ? "מוכן"
                  : order.warehouseStatus === "processing"
                  ? "בטיפול"
                  : "ממתין"}
              </span>
            </div>
          </div>
        )}

        {/* Open problems */}
        {problemCount > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">בעיות פתוחות</p>
            <div className="flex items-center gap-1.5 text-red-600 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs">{problemCount} בעיות</span>
            </div>
          </div>
        )}

        {/* Notes */}
        {note && (
          <div className="col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">הערות</p>
            <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{note}</p>
          </div>
        )}
      </div>

      {/* Edit link */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <Link
          href={`/new-order?edit=${order.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
          עבור להזמנה
        </Link>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

const URGENCY_ROW_CLS: Record<UrgencyLevel, string> = {
  critical: "border-r-4 border-red-500",
  warning: "border-r-4 border-amber-400",
  ok: "border-r-4 border-transparent",
};

const URGENCY_BG_CLS: Record<UrgencyLevel, string> = {
  critical: "bg-red-50/40",
  warning: "bg-amber-50/30",
  ok: "bg-white",
};

function V2Row({
  order,
  expanded,
  onToggle,
}: {
  order: WorkOrder;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isTerminal = order.status === "completed" || order.status === "cancelled";
  const slaColor = !isTerminal ? getStageSlaColor(order) : "gray";
  const stageHours = !isTerminal ? hoursInCurrentStage(order) : 0;
  const urgency = getUrgencyLevel(order, slaColor);
  const nextAction = getNextAction(order);
  const billingReady = getBillingReady(order);

  return (
    <div className={`border-b border-gray-100 last:border-0 ${URGENCY_ROW_CLS[urgency]}`}>
      {/* Main row */}
      <div
        className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-blue-50/40 ${URGENCY_BG_CLS[urgency]}`}
        onClick={onToggle}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
        {/* Order identity — takes remaining space */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {order.priority === "urgent" && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 shrink-0">
                <AlertTriangle className="w-2.5 h-2.5" />
                דחוף
              </span>
            )}
            <span className="text-sm font-bold text-gray-900 truncate leading-tight">
              {order.jobName || order.customer}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="font-mono text-[11px] text-gray-400 tracking-tight">
              {order.orderNumber}
            </span>
            {order.jobName && order.customer && (
              <span className="text-[11px] text-gray-500 truncate">{order.customer}</span>
            )}
          </div>
        </div>

        {/* Progress dots */}
        <div className="shrink-0 hidden sm:block">
          <V2ProgressDots order={order} />
        </div>

        {/* Status chip */}
        <div className="shrink-0 hidden md:block">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_COLORS[order.status]}`}
          >
            {STATUS_LABELS[order.status]}
          </span>
        </div>

        {/* Next action */}
        <div className="shrink-0 hidden lg:block">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${nextAction.cls}`}
          >
            {nextAction.label}
          </span>
        </div>

        {/* SLA age + dot */}
        {!isTerminal && (
          <div className="shrink-0 hidden sm:flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                slaColor === "red"
                  ? "bg-red-500"
                  : slaColor === "yellow"
                  ? "bg-amber-400"
                  : "bg-green-500"
              }`}
            />
            <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
              {formatHours(stageHours)}
            </span>
          </div>
        )}

        {/* Warehouse processing chip */}
        {order.warehouseRequired && order.warehouseStatus === "processing" && (
          <div className="shrink-0 hidden lg:flex items-center">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-teal-100 text-teal-700">
              <Package className="w-3 h-3" />
              בטיפול מחסן
            </span>
          </div>
        )}

        {/* Billing ready badge */}
        {billingReady && (
          <div className="shrink-0 hidden lg:flex items-center">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold"
              style={{ background: "#fef3c7", color: "#92400e" }}
            >
              <Receipt className="w-3 h-3" />
              מוכן לחיוב
            </span>
          </div>
        )}

        {/* Expand toggle */}
        <button
          className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label={expanded ? "כווץ פרטים" : "הרחב פרטים"}
          tabIndex={-1}
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Inline expanded panel */}
      {expanded && <V2ExpandedPanel order={order} />}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OrdersTableV2() {
  const { orders } = useOrdersContext();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const sortedOrders = useMemo(() => {
    const urgencyRank: Record<UrgencyLevel, number> = { critical: 0, warning: 1, ok: 2 };

    return orders
      .filter((o) => OPERATIONAL.has(o.status))
      .map((o) => {
        const slaColor = getStageSlaColor(o);
        const urgency = getUrgencyLevel(o, slaColor);
        const hours = hoursInCurrentStage(o);
        return { order: o, urgency, hours };
      })
      .sort((a, b) => {
        const rankDiff = urgencyRank[a.urgency] - urgencyRank[b.urgency];
        if (rankDiff !== 0) return rankDiff;
        return b.hours - a.hours;
      });
  }, [orders]);

  const completedOrders = useMemo(() => {
    if (!showCompleted) return [];
    return orders
      .filter((o) => o.status === "completed")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [orders, showCompleted]);

  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <section className="px-6 pb-10" aria-label="טבלת הזמנות V2">
      {/* Visibility marker — temporary diagnostic banner */}
      <div
        className="mb-3 px-4 py-2 rounded-lg text-sm font-bold text-amber-900 border border-amber-300"
        style={{ backgroundColor: "#fef3c7" }}
      >
        ✦ טבלת הזמנות V2 — תצוגה ניסיונית · {sortedOrders.length} הזמנות פעילות
      </div>

      {/* Section header */}
      <div className="flex items-center gap-3 mb-4 pt-2">
        <div className="w-1 h-7 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
        <div className="flex-1">
          <h2
            className="text-sm font-black uppercase tracking-widest"
            style={{ color: "#0d1b2e" }}
          >
            טבלת הזמנות V2
          </h2>
          <p className="text-[10px] text-gray-400 font-medium mt-0.5">
            תצוגת ניהול · {sortedOrders.length} הזמנות פעילות · ממוין לפי דחיפות
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCompleted(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
            showCompleted
              ? "bg-gray-200 text-gray-700 border-gray-300"
              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
          }`}
        >
          {showCompleted ? "הסתר הושלמו" : "הצג הושלמו"}
        </button>
      </div>

      {/* Active orders table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {sortedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-sm font-semibold text-gray-400">אין הזמנות פעילות</p>
            <p className="text-xs text-gray-300 mt-1">כל ההזמנות הושלמו</p>
          </div>
        ) : (
          sortedOrders.map(({ order }) => (
            <V2Row
              key={order.id}
              order={order}
              expanded={expandedId === order.id}
              onToggle={() => toggle(order.id)}
            />
          ))
        )}
      </div>

      {/* Completed orders section */}
      {showCompleted && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3 px-1">
            <CheckCircle2 className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-bold text-gray-500">הושלמו ({completedOrders.length})</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden opacity-75">
            {completedOrders.length === 0 ? (
              <div className="py-10 text-center text-xs text-gray-400">אין הזמנות שהושלמו</div>
            ) : (
              completedOrders.map((order) => (
                <V2Row
                  key={order.id}
                  order={order}
                  expanded={expandedId === order.id}
                  onToggle={() => toggle(order.id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
