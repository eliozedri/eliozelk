"use client";

import { useState } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import type { WorkOrder } from "@/types/workOrder";
import {
  PROBLEM_CATEGORY_LABELS,
  PROBLEM_STATUS_LABELS,
  PROBLEM_STATUS_COLORS,
  type OrderProblemCategory,
} from "@/types/workOrder";
import { formatDate } from "@/lib/dateFormatting";

function UrgentBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
      דחוף
    </span>
  );
}

const CATEGORIES: OrderProblemCategory[] = [
  "missing_dimensions", "missing_file", "unclear_request", "wrong_file",
  "material_shortage", "fabrication_unclear", "graphic_unclear", "other",
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; border: string; badge: string }> = {
  graphics_pending: { label: "ממתין לאישור",  bg: "bg-amber-50",  border: "border-amber-200",  badge: "bg-amber-100 text-amber-700" },
  graphics_active:  { label: "בטיפול גרפיקה", bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700"  },
};

function ProblemForm({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { addOrderProblem } = useOrdersContext();
  const [category, setCategory] = useState<OrderProblemCategory>("unclear_request");
  const [description, setDescription] = useState("");

  function submit() {
    if (!description.trim()) return;
    addOrderProblem(orderId, { department: "graphics", category, description: description.trim() });
    onClose();
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex flex-col gap-2">
      <div className="text-xs font-semibold text-red-700 mb-0.5">דיווח בעיה</div>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as OrderProblemCategory)}
        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-red-300"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{PROBLEM_CATEGORY_LABELS[c]}</option>
        ))}
      </select>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="תיאור הבעיה..."
        rows={2}
        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-red-300 resize-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!description.trim()}
          className="flex-1 py-1.5 rounded text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          שלח דיווח
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded text-xs text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}

function OpenProblems({ order }: { order: WorkOrder }) {
  const { resolveOrderProblem } = useOrdersContext();
  const problems = (order.problems ?? []).filter((p) => p.status !== "resolved" && p.status !== "cancelled");
  if (problems.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {problems.map((p) => (
        <div key={p.id} className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs flex items-start gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PROBLEM_STATUS_COLORS[p.status]}`}>
                {PROBLEM_STATUS_LABELS[p.status]}
              </span>
              <span className="text-gray-500">{PROBLEM_CATEGORY_LABELS[p.category]}</span>
            </div>
            <div className="text-gray-700">{p.description}</div>
          </div>
          <button
            type="button"
            onClick={() => resolveOrderProblem(order.id, p.id)}
            className="shrink-0 text-[10px] px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium transition-colors whitespace-nowrap"
          >
            נפתרה
          </button>
        </div>
      ))}
    </div>
  );
}

function GraphicsOrderCard({ order, onAcknowledge, onComplete, overrideCfg }: {
  order: WorkOrder;
  onAcknowledge?: () => Promise<void>;
  onComplete?: () => Promise<void>;
  overrideCfg?: typeof STATUS_CONFIG[string];
}) {
  const isPending = order.status === "graphics_pending";
  const cfg = overrideCfg ?? STATUS_CONFIG[order.status] ?? STATUS_CONFIG.graphics_pending;
  const signCount = order.signRows.filter((r) => r.signNumber).length;
  const miscCount = [
    ...order.miscRows.filter((r) => r.description),
    ...(order.accessoryRows ?? []).filter((r) => r.description),
  ].length;
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [actionState, setActionState] = useState<"idle" | "saving" | "error">("idle");
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleAction() {
    setShowConfirm(true);
  }

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-3`}>
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isPending ? "bg-blue-100" : "bg-green-100"}`}>
                {isPending ? (
                  <svg className="w-4.5 h-4.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : (
                  <svg className="w-4.5 h-4.5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </div>
              <p className="font-bold text-gray-900 text-sm">
                {isPending ? "אישור קבלת הזמנה לטיפול" : "סיום עבודת גרפיקה"}
              </p>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <p className="font-semibold text-gray-800">#{order.orderNumber} · {order.customer}</p>
              <p className="text-xs text-gray-500">
                {isPending
                  ? "הזמנה זו תועבר לסטטוס 'בטיפול גרפיקה'. האישור מסמן שהגרפיקאי קיבל את ההזמנה לידיו."
                  : "הזמנה זו תסומן כהושלמה גרפית ותועבר לשלב הבא (ייצור / מוכן להתקנה)."}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  setShowConfirm(false);
                  setActionState("saving");
                  try {
                    if (isPending) { await onAcknowledge?.(); }
                    else { await onComplete?.(); }
                    setActionState("idle");
                  } catch {
                    setActionState("error");
                    setTimeout(() => setActionState("idle"), 3000);
                  }
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-colors ${isPending ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"}`}
              >
                {isPending ? "אשר קבלה" : "סמן כהושלם"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-gray-900">{order.orderNumber}</span>
            {order.priority === "urgent" && <UrgentBadge />}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.badge}`}>
              {cfg.label}
            </span>
          </div>
          <span className="text-sm font-semibold text-gray-700 truncate">{order.customer}</span>
          {(order.jobName || order.city || order.location) && (
            <span className="text-xs text-gray-500 truncate">{order.jobName || order.city || order.location}</span>
          )}
        </div>
        <div className="text-xs text-gray-400 shrink-0">{order.graphicsSentAt ? formatDate(order.graphicsSentAt) : "—"}</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white/60 rounded-lg px-3 py-1.5 border border-gray-100">
          <span className="text-gray-400">תאריך הזמנה</span>
          <div className="font-semibold text-gray-800">{order.date || "—"}</div>
        </div>
        <div className="bg-white/60 rounded-lg px-3 py-1.5 border border-gray-100">
          <span className="text-gray-400">פריטים</span>
          <div className="font-semibold text-gray-800">
            {signCount > 0 ? `${signCount} תמרורים` : ""}
            {signCount > 0 && miscCount > 0 ? " + " : ""}
            {miscCount > 0 ? `${miscCount} שונות` : ""}
            {signCount === 0 && miscCount === 0 ? "—" : ""}
          </div>
        </div>
      </div>

      {order.generalNotes && (
        <p className="text-xs text-gray-600 bg-white/60 rounded-lg px-3 py-2 border border-gray-100 line-clamp-2">
          <span className="font-medium">הערות: </span>{order.generalNotes}
        </p>
      )}

      {order.fabricationRequired && (
        <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 font-medium">
          דרושה עבודת מסגרות
        </div>
      )}

      <OpenProblems order={order} />

      {/* Actions */}
      {showProblemForm ? (
        <ProblemForm orderId={order.id} onClose={() => setShowProblemForm(false)} />
      ) : (
        <div className="flex gap-2">
          <button
            onClick={handleAction}
            disabled={actionState === "saving"}
            className={`flex-1 py-2 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-60 ${
              isPending
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {actionState === "saving" ? "שומר..." :
             actionState === "error" ? "שגיאה — נסה שוב" :
             isPending ? "אשר קבלה" : "סמן כהושלם"}
          </button>
          <button
            onClick={() => setShowProblemForm(true)}
            className="px-3 py-2 rounded-lg text-xs font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 transition-colors whitespace-nowrap"
          >
            דווח בעיה
          </button>
        </div>
      )}
    </div>
  );
}

export function Graphics() {
  const { orders, acknowledgeOrder, completeGraphics } = useOrdersContext();
  const [showCompleted, setShowCompleted] = useState(false);

  const pending   = orders.filter((o) => o.status === "graphics_pending");
  const active    = orders.filter((o) => o.status === "graphics_active");
  const completed = showCompleted ? orders.filter((o) => o.status === "graphics_done") : [];
  const urgentPending = pending.filter((o) => o.priority === "urgent").length;

  const STATUS_CONFIG_DONE: typeof STATUS_CONFIG[string] = {
    label: "גרפיקה הושלמה", bg: "bg-green-50", border: "border-green-200", badge: "bg-green-100 text-green-700",
  };

  const groups: { key: string; label: string; orders: WorkOrder[]; dot: string }[] = [
    { key: "graphics_pending", label: "הזמנות נכנסות",  orders: pending,   dot: "bg-amber-400" },
    { key: "graphics_active",  label: "עבודות פעילות",  orders: active,    dot: "bg-blue-500"  },
    ...(showCompleted ? [{ key: "graphics_done", label: "עבודות שהושלמו", orders: completed, dot: "bg-green-500" }] : []),
  ];

  return (
    <div className="min-h-screen bg-surface py-6 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Header — same pattern as Warehouse */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">מחלקת גרפיקה</h1>
            <p className="text-sm text-gray-500">ניהול הזמנות נכנסות ועבודות פעילות</p>
          </div>
          <div className="mr-auto flex items-center gap-3">
            {urgentPending > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold bg-red-100 text-red-700">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                {urgentPending} דחופות
              </span>
            )}
            <span className="text-sm text-gray-500">פתוחות:</span>
            <span className="font-black text-gray-900">{pending.length + active.length}</span>
            <button
              type="button"
              onClick={() => setShowCompleted(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${showCompleted ? "bg-green-100 border-green-300 text-green-700" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
            >
              {showCompleted ? "הסתר הושלמו" : "הצג הושלמו"}
            </button>
          </div>
        </div>

        {pending.length + active.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/>
              <circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/>
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
            </svg>
            <p className="text-gray-500 font-medium">אין הזמנות פעילות במחלקת גרפיקה</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {groups.map(({ key, label, orders: groupOrders, dot }) => {
              const cfg = STATUS_CONFIG[key];
              return (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className={`w-2.5 h-2.5 rounded-full ${dot} shrink-0`}></span>
                    <span className="text-sm font-bold text-gray-700">{label}</span>
                    {groupOrders.length > 0 && (
                      <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${cfg.badge}`}>
                        {groupOrders.length}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    {groupOrders.length === 0 ? (
                      <div className={`rounded-xl border ${cfg.border} ${cfg.bg} px-4 py-6 text-center`}>
                        <p className="text-xs text-gray-400">אין הזמנות</p>
                      </div>
                    ) : (
                      groupOrders.map(o => (
                        <GraphicsOrderCard
                          key={o.id}
                          order={o}
                          onAcknowledge={o.status === "graphics_pending" ? () => acknowledgeOrder(o.id) : undefined}
                          onComplete={o.status === "graphics_active" ? () => completeGraphics(o.id) : undefined}
                          overrideCfg={o.status === "graphics_done" ? STATUS_CONFIG_DONE : undefined}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
