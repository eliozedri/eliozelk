"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useOrdersContext } from "@/context/OrdersContext";
import { STATUS_LABELS } from "@/types/workOrder";
import type { WorkOrder } from "@/types/workOrder";

export interface DrillState {
  title: string;
  description: string;
  getOrders: (allOrders: WorkOrder[]) => WorkOrder[];
}

const STATUS_STYLE: Record<string, string> = {
  graphics_pending:  "bg-amber-100 text-amber-700",
  graphics_active:   "bg-blue-100 text-blue-700",
  graphics_done:     "bg-green-100 text-green-700",
  production:        "bg-purple-100 text-purple-700",
  ready_installation:"bg-teal-100 text-teal-700",
  completed:         "bg-gray-100 text-gray-600",
  cancelled:         "bg-red-100 text-red-600",
};

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

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

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
    if (!editingNotes) setNotesDraft(order.generalNotes ?? ""); // eslint-disable-line react-hooks/set-state-in-effect
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
      await onUpdateFields(order.id, { priority: order.priority === "urgent" ? "normal" : "urgent" });
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
        <Link href="/orders" className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1 shrink-0">
          פתח בהזמנות <ExternalLinkIcon />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[order.status] ?? "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
          {order.priority === "urgent" && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">דחוף</span>
          )}
        </div>

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
                <button
                  onClick={() => { setEditingNotes(false); setNoteSaveState("idle"); }}
                  className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-500"
                >
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
              {urgentSaveState === "saved"  && <span className="text-[10px] text-green-600 font-medium">✓ נשמר</span>}
              {urgentSaveState === "error"  && <span className="text-[10px] text-red-600 font-medium">שגיאה — לא נשמר</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  drill: DrillState;
  onClose: () => void;
  onUpdateFields: (id: string, fields: Partial<WorkOrder>) => Promise<void>;
}

export function DrillDownPanel({ drill, onClose, onUpdateFields }: Props) {
  const { orders: allOrders } = useOrdersContext();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const liveOrders = useMemo(() => drill.getOrders(allOrders), [drill, allOrders]);
  const selectedOrder = useMemo(
    () => selectedOrderId ? allOrders.find(o => o.id === selectedOrderId) ?? null : null,
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
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {liveOrders.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-gray-400">אין הזמנות להצגה</p>
                </div>
              ) : (
                liveOrders.map(order => (
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
                      {order.jobName && <div className="text-xs text-gray-400 truncate">{order.jobName}</div>}
                      {order.location
                        ? <div className="text-[10px] text-gray-400 mt-0.5 truncate">{order.location}</div>
                        : <span className="text-[9px] text-amber-600 font-semibold">מיקום חסר</span>
                      }
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
