"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useOrdersContext } from "@/context/OrdersContext";
import { useCustomersContext } from "@/context/CustomersContext";
import { STATUS_LABELS } from "@/types/workOrder";
import type { WorkOrder, WorkOrderStatus } from "@/types/workOrder";
import { ProjectMap } from "./ProjectMap";
import { useWorkflowAlerts, DEPT_LABELS } from "@/hooks/useWorkflowAlerts";
import type { WorkflowAlert } from "@/hooks/useWorkflowAlerts";
import { getStageSlaColor, hoursInCurrentStage } from "@/lib/workflowEngine";
import { useNotifications } from "@/hooks/useNotifications";
import { useForecast } from "@/hooks/useForecast";

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  const h = diff / 3600000;
  if (m < 2) return "עכשיו";
  if (h < 1) return `לפני ${m} דקות`;
  if (h < 24) return `לפני ${Math.round(h)} שעות`;
  if (h < 48) return "אתמול";
  return formatDateShort(iso);
}

function todayLabel(): string {
  return new Date().toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isSameMonth(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

// ─── Icons ─────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}


function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Pipeline Stage Type ───────────────────────────────────────────────────

interface PipelineStage {
  label: string;
  count: number;
  color: string;
  textColor: string;
  href: string;
  status: string;
}

// ─── Alerts Section ────────────────────────────────────────────────────────

const SEVERITY_STYLE = {
  critical: { icon: "text-red-500",   hover: "hover:bg-red-50",   badge: "bg-red-100 text-red-700"    },
  warn:     { icon: "text-amber-500", hover: "hover:bg-amber-50", badge: "bg-amber-100 text-amber-700" },
};

function AlertsSection({
  alerts,
  onAlertClick,
}: {
  alerts: WorkflowAlert[];
  onAlertClick: (alert: WorkflowAlert) => void;
}) {
  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy-900">התראות לטיפול</h2>
        <div className="flex items-center gap-1.5">
          {criticalCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {criticalCount} קריטי
            </span>
          )}
          {alerts.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {alerts.length}
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {alerts.length === 0 ? (
          <div className="px-5 py-5 text-center">
            <div className="text-2xl mb-1">✓</div>
            <p className="text-xs text-gray-400">אין התראות — הכל תקין</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const style = SEVERITY_STYLE[alert.severity];
            return (
              <button
                key={alert.id}
                onClick={() => onAlertClick(alert)}
                className={`flex items-start gap-3 px-4 py-3 ${style.hover} transition-colors w-full text-right`}
              >
                <span className={`${style.icon} mt-0.5 shrink-0`}><AlertIcon /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 leading-relaxed">{alert.message}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badge}`}>
                      {DEPT_LABELS[alert.department]}
                    </span>
                    {alert.orderNumbers && alert.orderNumbers.length > 0 && (
                      <span className="text-[10px] text-gray-400">
                        {alert.orderNumbers.slice(0, 3).join(", ")}
                        {alert.orderNumbers.length > 3 && ` +${alert.orderNumbers.length - 3}`}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  graphics_pending: "bg-amber-100 text-amber-700",
  graphics_active: "bg-blue-100 text-blue-700",
  graphics_done: "bg-green-100 text-green-700",
  production: "bg-purple-100 text-purple-700",
  ready_installation: "bg-teal-100 text-teal-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
};

// ─── Drill-Down Panel ──────────────────────────────────────────────────────

interface DrillState {
  title: string;
  description: string;
  getOrders: (allOrders: WorkOrder[]) => WorkOrder[];
}

const DEPT_STATUS_LABEL: Record<string, string> = {
  graphics_pending: "ממתין לגרפיקה",
  graphics_active: "בטיפול גרפיקה",
  graphics_done: "גרפיקה הושלמה",
  production: "בייצור",
  ready_installation: "מוכן לביצוע",
  completed: "הושלם",
  cancelled: "בוטל",
};

function InternalOrderDetail({
  order,
  onBack,
  onUpdateFields,
}: {
  order: WorkOrder;
  onBack: () => void;
  onUpdateFields: (id: string, fields: Partial<WorkOrder>) => Promise<void>;
}) {
  const [notesDraft, setNotesDraft] = useState(order.generalNotes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteSaveState, setNoteSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [urgentSaveState, setUrgentSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!editingNotes) setNotesDraft(order.generalNotes ?? "");
  }, [order.generalNotes, editingNotes]);

  async function handleSaveNote() {
    setNoteSaveState("saving");
    try {
      await onUpdateFields(order.id, { generalNotes: notesDraft.trim() });
      setNoteSaveState("saved");
      setEditingNotes(false);
      setTimeout(() => setNoteSaveState("idle"), 2500);
    } catch {
      setNoteSaveState("error");
    }
  }

  async function handleToggleUrgent() {
    setUrgentSaveState("saving");
    try {
      await onUpdateFields(order.id, {
        priority: order.priority === "urgent" ? "normal" : "urgent",
      });
      setUrgentSaveState("saved");
      setTimeout(() => setUrgentSaveState("idle"), 2500);
    } catch {
      setUrgentSaveState("error");
      setTimeout(() => setUrgentSaveState("idle"), 3000);
    }
  }

  const isTerminal = order.status === "completed" || order.status === "cancelled";

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3 z-10">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="חזור"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs font-bold text-gray-500">{order.orderNumber}</p>
          {order.jobName && <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{order.jobName}</p>}
        </div>
        <Link
          href="/orders"
          className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1 shrink-0"
        >
          פתח בהזמנות
          <ExternalLinkIcon />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Status + priority */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[order.status] ?? "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
          {order.priority === "urgent" && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">דחוף</span>
          )}
        </div>

        {/* Key fields */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">לקוח</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{order.customer || "—"}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">תאריך</p>
            <p className="text-sm font-semibold text-gray-800">{formatDateShort(order.date)}</p>
          </div>
          <div className={`rounded-lg p-3 col-span-2 ${order.location ? "bg-gray-50" : "bg-amber-50 border border-amber-200"}`}>
            <p className="text-[10px] text-gray-400 mb-0.5">מיקום</p>
            <p className="text-sm font-semibold text-gray-800">
              {order.location || <span className="text-amber-600 text-xs">מיקום חסר</span>}
            </p>
          </div>
        </div>

        {/* Department pipeline */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">שלבי עיבוד</p>
          <div className="space-y-1.5">
            <div className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
              order.graphicsCompletedAt ? "bg-green-50" : order.graphicsAcknowledgedAt ? "bg-blue-50" : "bg-amber-50"
            }`}>
              <span className="text-xs font-medium text-gray-700">גרפיקה</span>
              <span className="text-xs text-gray-500">
                {order.graphicsCompletedAt ? "הושלמה ✓" : order.graphicsAcknowledgedAt ? "בביצוע" : "ממתינה"}
              </span>
            </div>
            {order.warehouseRequired && (
              <div className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                order.warehouseStatus === "ready" ? "bg-green-50" : "bg-amber-50"
              }`}>
                <span className="text-xs font-medium text-gray-700">מחסן</span>
                <span className="text-xs text-gray-500">
                  {order.warehouseStatus === "ready" ? "מוכן ✓" : order.warehouseStatus === "processing" ? "בביצוע" : "ממתין"}
                </span>
              </div>
            )}
            {order.fabricationRequired && (
              <div className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                order.fabricationStatus === "completed" ? "bg-green-50" :
                order.fabricationStatus === "issue" ? "bg-red-50" : "bg-orange-50"
              }`}>
                <span className="text-xs font-medium text-gray-700">מסגרייה</span>
                <span className="text-xs text-gray-500">
                  {order.fabricationStatus === "completed" ? "הושלם ✓" :
                   order.fabricationStatus === "in_progress" ? "בביצוע" :
                   order.fabricationStatus === "issue" ? "בעיה" : "ממתין"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Manager notes */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-gray-500">הערת מנהל</p>
            {!editingNotes && (
              <div className="flex items-center gap-2">
                {noteSaveState === "saved" && (
                  <span className="text-[10px] text-green-600 font-medium">✓ נשמר</span>
                )}
                <button
                  onClick={() => { setNotesDraft(order.generalNotes ?? ""); setEditingNotes(true); }}
                  className="text-[10px] text-blue-500 hover:text-blue-700"
                >
                  {order.generalNotes ? "ערוך" : "הוסף הערה"}
                </button>
              </div>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                rows={3}
                placeholder="הערה פנימית מהמנהל..."
                className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                dir="rtl"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveNote}
                  disabled={noteSaveState === "saving"}
                  className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
                >
                  {noteSaveState === "saving" ? "שומר..." : "שמור"}
                </button>
                <button onClick={() => { setEditingNotes(false); setNoteSaveState("idle"); }} className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-500">
                  ביטול
                </button>
                {noteSaveState === "error" && (
                  <span className="text-[10px] text-red-600 font-medium">שגיאה בשמירה</span>
                )}
              </div>
            </div>
          ) : order.generalNotes ? (
            <div className="bg-amber-50 rounded-lg px-3 py-2.5">
              <p className="text-sm text-gray-700">{order.generalNotes}</p>
            </div>
          ) : (
            <p className="text-xs text-gray-300 italic">אין הערת מנהל</p>
          )}
        </div>

        {/* Manager actions */}
        {!isTerminal && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">פעולות מנהל</p>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={handleToggleUrgent}
                disabled={urgentSaveState === "saving"}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  order.priority === "urgent"
                    ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
                }`}
              >
                {urgentSaveState === "saving"
                  ? "שומר..."
                  : order.priority === "urgent" ? "הסר עדיפות דחופה" : "סמן כדחוף"}
              </button>
              {urgentSaveState === "saved" && (
                <span className="text-[10px] text-green-600 font-medium">✓ נשמר</span>
              )}
              {urgentSaveState === "error" && (
                <span className="text-[10px] text-red-600 font-medium">שגיאה — לא נשמר</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DrillDownPanel({
  drill,
  onClose,
  onUpdateFields,
}: {
  drill: DrillState;
  onClose: () => void;
  onUpdateFields: (id: string, fields: Partial<WorkOrder>) => Promise<void>;
}) {
  const { orders: allOrders } = useOrdersContext();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const liveOrders = useMemo(() => drill.getOrders(allOrders), [drill, allOrders]);
  const selectedOrder = useMemo(
    () => selectedOrderId ? allOrders.find((o) => o.id === selectedOrderId) ?? null : null,
    [selectedOrderId, allOrders],
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-0 left-0 h-full w-full max-w-lg bg-white z-50 shadow-2xl flex flex-col" dir="rtl">

        {selectedOrder ? (
          <InternalOrderDetail
            order={selectedOrder}
            onBack={() => setSelectedOrderId(null)}
            onUpdateFields={onUpdateFields}
          />
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-navy-900">{drill.title}</h2>
                {drill.description && (
                  <p className="text-xs text-gray-400 mt-0.5">{drill.description}</p>
                )}
                <p className="text-xs text-gray-500 mt-1 font-medium">{liveOrders.length} הזמנות</p>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="סגור"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Orders list */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {liveOrders.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-gray-400">אין הזמנות להצגה</p>
                </div>
              ) : (
                liveOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors w-full text-right"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-navy-900">{order.orderNumber}</span>
                        {order.priority === "urgent" && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-600">דחוף</span>
                        )}
                        {(order.generalNotes || order.notes) && (
                          <span className="text-amber-500" title="יש הערת מנהל">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                          </span>
                        )}
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLE[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-700 font-medium mt-0.5 truncate">{order.customer}</div>
                      {order.jobName && (
                        <div className="text-xs text-gray-400 truncate">{order.jobName}</div>
                      )}
                      {order.location ? (
                        <div className="text-[10px] text-gray-400 mt-0.5 truncate">{order.location}</div>
                      ) : (
                        <span className="text-[9px] text-amber-600 font-semibold">מיקום חסר</span>
                      )}
                    </div>
                    <div className="shrink-0 text-[10px] text-gray-300 mt-0.5">
                      {formatDateShort(order.updatedAt ?? order.createdAt)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Stage Health Panel ────────────────────────────────────────────────────

interface StageSpec {
  status: WorkOrderStatus;
  label: string;
  deptLabel: string;
}

const STAGE_SPECS: StageSpec[] = [
  { status: "graphics_pending",   label: "ממתינה לגרפיקה", deptLabel: "גרפיקה"  },
  { status: "graphics_active",    label: "בטיפול גרפיקה",  deptLabel: "גרפיקה"  },
  { status: "graphics_done",      label: "גרפיקה הושלמה",  deptLabel: "משרד"    },
  { status: "production",         label: "ייצור",           deptLabel: "מסגרייה" },
  { status: "ready_installation", label: "מוכן להתקנה",    deptLabel: "תיאום"   },
];

function StageHealthPanel({ orders }: { orders: WorkOrder[] }) {
  const now = Date.now();

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-bold text-navy-900">בריאות צנרת הזמנות</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">
          זמן בשלב · ירוק = תקין · צהוב = מתעכב · אדום = קריטי
        </p>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {STAGE_SPECS.map(spec => {
            const stageOrders = orders.filter(o => o.status === spec.status);
            const colors      = stageOrders.map(o => getStageSlaColor(o, now));
            const green  = colors.filter(c => c === "green").length;
            const yellow = colors.filter(c => c === "yellow").length;
            const red    = colors.filter(c => c === "red").length;
            const worst  =
              red > 0             ? "red" :
              yellow > 0          ? "yellow" :
              stageOrders.length  ? "green" :
                                    "gray";

            const containerCls =
              worst === "red"    ? "bg-red-50 border-red-200" :
              worst === "yellow" ? "bg-amber-50 border-amber-200" :
              worst === "green"  ? "bg-green-50 border-green-100" :
                                   "bg-gray-50 border-gray-100";
            const countCls =
              worst === "red"    ? "text-red-600" :
              worst === "yellow" ? "text-amber-600" :
              worst === "green"  ? "text-green-700" :
                                   "text-gray-300";

            // Show longest wait in the stage for tooltip context
            const maxHours = stageOrders.length
              ? Math.max(...stageOrders.map(o => hoursInCurrentStage(o, now)))
              : 0;
            const maxDays = maxHours >= 24 ? `${Math.floor(maxHours / 24)}י` : `${Math.round(maxHours)}ש׳`;

            return (
              <div
                key={spec.status}
                className={`rounded-xl border p-3 flex flex-col gap-2 ${containerCls}`}
                title={stageOrders.length ? `הזמן הארוך ביותר בשלב: ${maxDays}` : undefined}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider truncate">
                    {spec.deptLabel}
                  </span>
                  <span className={`text-2xl font-black leading-none ${countCls}`}>
                    {stageOrders.length}
                  </span>
                </div>
                <div className="text-xs font-medium text-gray-700 leading-tight">{spec.label}</div>
                {stageOrders.length > 0 ? (
                  <div className="flex items-center gap-1 flex-wrap">
                    {red > 0 && (
                      <span className="text-[9px] font-bold text-red-600 bg-red-100 rounded px-1.5 py-0.5">
                        {red} קריטי
                      </span>
                    )}
                    {yellow > 0 && (
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-100 rounded px-1.5 py-0.5">
                        {yellow} מאחר
                      </span>
                    )}
                    {green > 0 && (
                      <span className="text-[9px] font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5">
                        {green} תקין
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-gray-300">ריק</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Recent Activity Section ───────────────────────────────────────────────

function ActivitySection({ orders }: { orders: WorkOrder[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy-900">פעילות אחרונה</h2>
        <Link href="/orders" className="text-xs text-ek-blue hover:underline flex items-center gap-1">
          הצג הכל <ExternalLinkIcon />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {orders.length === 0 ? (
          <div className="px-5 py-5 text-center">
            <p className="text-xs text-gray-400">אין הזמנות עדיין</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-navy-900 truncate">{order.orderNumber}</span>
                  {order.priority === "urgent" && (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-600 shrink-0">דחוף</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 truncate">{order.customer}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLE[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
                <span className="text-[10px] text-gray-300">{relativeTime(order.updatedAt ?? order.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Forecast Panel ────────────────────────────────────────────────────────

function CapacityBar({ pct }: { pct: number }) {
  const filled = Math.round(pct);
  const barColor =
    filled >= 90 ? "bg-red-500" :
    filled >= 70 ? "bg-amber-400" :
    filled >= 40 ? "bg-green-500" : "bg-gray-300";
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${filled}%` }}
        />
      </div>
      <span className={`text-xs font-bold tabular-nums w-10 text-right ${
        filled >= 90 ? "text-red-600" :
        filled >= 70 ? "text-amber-600" : "text-green-700"
      }`}>
        {filled}%
      </span>
    </div>
  );
}

function ForecastPanel() {
  const forecast = useForecast();
  const fmt = (n: number) =>
    "₪" + n.toLocaleString("he-IL", { maximumFractionDigits: 0 });

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-navy-900">תחזית תפעולית</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">
            שבוע הבא · מבוסס מגמת 12 שבועות
          </p>
        </div>
        {(forecast.criticalRiskCount > 0 || forecast.highRiskCount > 0) && (
          <div className="flex items-center gap-1.5">
            {forecast.criticalRiskCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {forecast.criticalRiskCount} סיכון קריטי
              </span>
            )}
            {forecast.highRiskCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                {forecast.highRiskCount} סיכון גבוה
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Revenue forecast */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            תחזית הכנסות שבוע הבא
          </span>
          <span className="text-xl font-black text-navy-900 leading-none">
            {forecast.nextWeekRevenueForecast != null
              ? fmt(forecast.nextWeekRevenueForecast)
              : "—"}
          </span>
          <span className="text-[10px] text-gray-400">על בסיס מגמה</span>
        </div>

        {/* Pending billing */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            חיוב ממתין גבייה
          </span>
          <span className={`text-xl font-black leading-none ${
            forecast.pendingBillingRevenue > 0 ? "text-amber-600" : "text-gray-300"
          }`}>
            {fmt(forecast.pendingBillingRevenue)}
          </span>
          <span className="text-[10px] text-gray-400">הזמנות שהושלמו</span>
        </div>

        {/* Completion forecast */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            ביצוע מתוכנן
          </span>
          <div className="flex items-end gap-3">
            <div className="flex flex-col items-center">
              <span className="text-xl font-black text-navy-900 leading-none">
                {forecast.completionForecast.thisWeek}
              </span>
              <span className="text-[9px] text-gray-400">השבוע</span>
            </div>
            <div className="text-gray-200 font-light text-lg leading-none mb-1">|</div>
            <div className="flex flex-col items-center">
              <span className="text-xl font-black text-gray-500 leading-none">
                {forecast.completionForecast.nextWeek}
              </span>
              <span className="text-[9px] text-gray-400">שבוע הבא</span>
            </div>
          </div>
        </div>

        {/* Crew capacity */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            ניצול קיבולת צוותים
          </span>
          <CapacityBar pct={forecast.crewCapacity.utilizationPct} />
          <span className="text-[10px] text-gray-400">
            {Math.round(forecast.crewCapacity.scheduledHours)}שע׳ מתוך{" "}
            {Math.round(forecast.crewCapacity.totalHours)}שע׳ זמינות
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────

export function DashboardPage() {
  const { orders, updateOrderFields } = useOrdersContext();
  const { customers } = useCustomersContext();

  const [drill, setDrill] = useState<DrillState | null>(null);

  const metrics = useMemo(() => {
    const open = orders.filter((o) => o.status !== "completed" && o.status !== "cancelled");
    const completedMonth = orders.filter((o) => o.status === "completed" && isSameMonth(o.updatedAt ?? o.createdAt));
    return {
      openOrders: open.length,
      pendingGraphics: orders.filter((o) => o.status === "graphics_pending").length,
      activeGraphics: orders.filter((o) => o.status === "graphics_active").length,
      graphicsDone: orders.filter((o) => o.status === "graphics_done").length,
      inProduction: orders.filter((o) => o.status === "production").length,
      readyInstall: orders.filter((o) => o.status === "ready_installation").length,
      completedMonth: completedMonth.length,
      urgentOpen: orders.filter((o) => o.priority === "urgent" && o.status !== "completed" && o.status !== "cancelled").length,
      totalCustomers: customers.length,
      totalOrders: orders.length,
    };
  }, [orders, customers]);

  const alerts = useWorkflowAlerts();
  const { criticalAlerts, stuckOrders } = useNotifications();

  const recentActivity = useMemo(
    () =>
      [...orders]
        .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
        .slice(0, 7),
    [orders]
  );

  const pipelineStages: PipelineStage[] = [
    {
      label: "ממתינות לגרפיקה",
      count: metrics.pendingGraphics,
      color: "bg-amber-50 border-amber-200",
      textColor: "text-amber-700",
      href: "/graphics",
      status: "graphics_pending",
    },
    {
      label: "בטיפול גרפיקה",
      count: metrics.activeGraphics,
      color: "bg-blue-50 border-blue-200",
      textColor: "text-blue-700",
      href: "/graphics",
      status: "graphics_active",
    },
    {
      label: "גרפיקה הושלמה",
      count: metrics.graphicsDone,
      color: "bg-emerald-50 border-emerald-200",
      textColor: "text-emerald-700",
      href: "/orders",
      status: "graphics_done",
    },
    {
      label: "בייצור",
      count: metrics.inProduction,
      color: "bg-purple-50 border-purple-200",
      textColor: "text-purple-700",
      href: "/orders",
      status: "production",
    },
    {
      label: "מוכן להתקנה",
      count: metrics.readyInstall,
      color: "bg-teal-50 border-teal-200",
      textColor: "text-teal-700",
      href: "/orders",
      status: "ready_installation",
    },
    {
      label: "הושלם",
      count: metrics.completedMonth,
      color: "bg-green-50 border-green-200",
      textColor: "text-green-700",
      href: "/orders",
      status: "completed",
    },
  ];

  function handleStageClick(label: string, status: string) {
    setDrill({
      title: label,
      description: `הזמנות בשלב: ${label}`,
      getOrders: status === "completed"
        ? (all) => all.filter((o) => o.status === "completed" && isSameMonth(o.updatedAt ?? o.createdAt))
        : (all) => all.filter((o) => o.status === status),
    });
  }

  function handleAlertClick(alert: WorkflowAlert) {
    const nums = new Set(alert.orderNumbers ?? []);
    setDrill({
      title: alert.message,
      description: DEPT_LABELS[alert.department] ?? alert.department,
      getOrders: (all) => nums.size > 0 ? all.filter((o) => nums.has(o.orderNumber)) : [],
    });
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #05111f 0%, #0d1b2e 55%, #1a2d4a 100%)" }}>
        <div className="px-8 py-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-ek-gold text-[9px] font-bold uppercase tracking-[0.25em] mb-2 opacity-80">
                ELKAYAM CONTROL CENTER
              </p>
              <h1 className="text-3xl font-black text-white leading-tight tracking-tight">
                מרכז שליטה אלקיים
              </h1>
              <p className="text-white/40 text-sm mt-1.5">{todayLabel()} · תמונת מצב תפעולית</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/new-order"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ek-blue hover:bg-ek-blue-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-ek-blue/20"
              >
                <PlusIcon />
                הזמנה חדשה
              </Link>
              <Link
                href="/work-diary"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ek-blue hover:bg-ek-blue-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-ek-blue/20"
              >
                <PlusIcon />
                יומן חדש
              </Link>
              <Link
                href="/orders"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-medium transition-colors border border-white/15 hover:bg-white/8"
              >
                כל ההזמנות
              </Link>
            </div>
          </div>

          {/* Gold separator */}
          <div className="mt-6 h-px" style={{ background: "linear-gradient(to left, transparent, rgba(245,158,11,0.4), transparent)" }} />

          {/* Quick stats strip */}
          <div className="mt-4 flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ek-gold shrink-0" />
              <span className="text-white/50 text-xs">{metrics.totalOrders} הזמנות במערכת</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ek-gold shrink-0" />
              <span className="text-white/50 text-xs">{metrics.openOrders} הזמנות פתוחות</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ek-gold shrink-0" />
              <span className="text-white/50 text-xs">{metrics.totalCustomers} לקוחות</span>
            </div>
            {metrics.urgentOpen > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                <span className="text-red-300 text-xs font-semibold">{metrics.urgentOpen} הזמנות דחופות</span>
              </div>
            )}
            {criticalAlerts > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="text-red-300 text-xs font-semibold">{criticalAlerts} חריגות SLA קריטיות</span>
              </div>
            )}
            {stuckOrders > 0 && criticalAlerts === 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-amber-300 text-xs">{stuckOrders} הזמנות מתעכבות</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main Content ──────────────────────────────────────── */}
      <div className="px-6 py-6 max-w-7xl mx-auto space-y-5">

        {/* ─── Unified Status Section ─────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-navy-900">סטטוס תפעולי</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {metrics.openOrders} פתוחות{metrics.urgentOpen > 0 ? ` · ${metrics.urgentOpen} דחופות` : ""}
              </p>
            </div>
            <Link href="/orders" className="text-xs text-ek-blue hover:underline flex items-center gap-1">
              כל ההזמנות <ExternalLinkIcon />
            </Link>
          </div>
          <div className="p-4 grid grid-cols-3 sm:grid-cols-6 gap-3">
            {pipelineStages.map((stage) => (
              <button
                key={stage.label}
                onClick={() => handleStageClick(stage.label, stage.status)}
                className={`flex flex-col items-center px-3 py-3 rounded-xl border ${stage.color} hover:opacity-90 transition-opacity cursor-pointer`}
              >
                <span className={`text-2xl font-black leading-none ${stage.textColor}`}>{stage.count}</span>
                <span className={`text-[10px] font-medium mt-1.5 text-center leading-tight ${stage.textColor} opacity-80`}>
                  {stage.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── Alerts + Activity ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3">
            <AlertsSection alerts={alerts} onAlertClick={handleAlertClick} />
          </div>
          <div className="lg:col-span-2">
            <ActivitySection orders={recentActivity} />
          </div>
        </div>

        {/* Operational Forecast */}
        <ForecastPanel />

        {/* Map Section */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-navy-900">מפת פרויקטים</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">תצוגה גיאוגרפית · פרויקטים לפי מיקום</p>
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
              ישראל
            </span>
          </div>
          <ProjectMap />
        </div>

      </div>

      {/* Drill-down panel */}
      {drill && <DrillDownPanel drill={drill} onClose={() => setDrill(null)} onUpdateFields={updateOrderFields} />}
    </div>
  );
}
