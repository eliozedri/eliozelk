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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function PendingOrderCard({ order, onAcknowledge }: { order: WorkOrder; onAcknowledge: () => Promise<void> }) {
  const signCount = order.signRows.filter((r) => r.signNumber).length;
  const miscCount = [
    ...order.miscRows.filter((r) => r.description),
    ...(order.accessoryRows ?? []).filter((r) => r.description),
  ].length;
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [ackState, setAckState] = useState<"idle" | "saving" | "error">("idle");

  async function handleAcknowledge() {
    setAckState("saving");
    try {
      await onAcknowledge();
    } catch {
      setAckState("error");
      setTimeout(() => setAckState("idle"), 3000);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">{order.orderNumber}</span>
            {order.priority === "urgent" && <UrgentBadge />}
          </div>
          <span className="text-xs text-gray-500">נכנסה {formatDate(order.graphicsSentAt)} בשעה {formatTime(order.graphicsSentAt)}</span>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 whitespace-nowrap">
          ממתין לאישור
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-xs text-gray-400">לקוח</span>
          <div className="font-medium text-gray-800 truncate">{order.customer || "—"}</div>
        </div>
        <div>
          <span className="text-xs text-gray-400">עיר</span>
          <div className="font-medium text-gray-800 truncate">{order.city || order.location || "—"}</div>
        </div>
        <div>
          <span className="text-xs text-gray-400">תאריך הזמנה</span>
          <div className="font-medium text-gray-800">{order.date || "—"}</div>
        </div>
        <div>
          <span className="text-xs text-gray-400">פריטים</span>
          <div className="font-medium text-gray-800">
            {signCount > 0 && `${signCount} תמרורים`}
            {signCount > 0 && miscCount > 0 && " + "}
            {miscCount > 0 && `${miscCount} שונות`}
            {signCount === 0 && miscCount === 0 && "—"}
          </div>
        </div>
      </div>

      {order.generalNotes && (
        <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-2">
          <span className="font-medium">הערות: </span>{order.generalNotes}
        </div>
      )}

      {order.fabricationRequired && (
        <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2 font-medium">
          🔧 דרושה עבודת מסגרות
        </div>
      )}

      <OpenProblems order={order} />

      {showProblemForm ? (
        <ProblemForm orderId={order.id} onClose={() => setShowProblemForm(false)} />
      ) : (
        <div className="flex gap-2">
          <button
            onClick={handleAcknowledge}
            disabled={ackState === "saving"}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {ackState === "saving" ? (
              <span>שומר...</span>
            ) : ackState === "error" ? (
              <span className="text-red-200">שגיאה — לחץ לנסות שוב</span>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                אישור קבלה
              </>
            )}
          </button>
          <button
            onClick={() => setShowProblemForm(true)}
            className="px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors whitespace-nowrap"
          >
            דווח בעיה
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => Promise<void>; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleConfirm() {
    setSaving(true);
    setErrorMsg("");
    try {
      await onConfirm();
    } catch (e) {
      setSaving(false);
      setErrorMsg(e instanceof Error ? e.message : "שגיאה לא ידועה");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4">
        <p className="text-sm font-medium text-gray-800 text-center leading-relaxed">{message}</p>
        {errorMsg && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
            שגיאה: {errorMsg}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "שומר..." : errorMsg ? "נסה שוב" : "כן, מוכן"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveOrderCard({ order, onComplete }: { order: WorkOrder; onComplete: () => Promise<void> }) {
  const signCount = order.signRows.filter((r) => r.signNumber).length;
  const miscCount = [
    ...order.miscRows.filter((r) => r.description),
    ...(order.accessoryRows ?? []).filter((r) => r.description),
  ].length;
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 flex flex-col gap-3">
      {showConfirm && (
        <ConfirmModal
          message="האם ההזמנה מוכנה בוודאות וניתן להעביר אותה להתקנה?"
          onConfirm={async () => { await onComplete(); setShowConfirm(false); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">{order.orderNumber}</span>
            {order.priority === "urgent" && <UrgentBadge />}
          </div>
          <span className="text-xs text-gray-500">
            אושר {order.graphicsAcknowledgedAt ? formatDate(order.graphicsAcknowledgedAt) + " בשעה " + formatTime(order.graphicsAcknowledgedAt) : "—"}
          </span>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 whitespace-nowrap">
          בטיפול
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-xs text-gray-400">לקוח</span>
          <div className="font-medium text-gray-800 truncate">{order.customer || "—"}</div>
        </div>
        <div>
          <span className="text-xs text-gray-400">עיר</span>
          <div className="font-medium text-gray-800 truncate">{order.city || order.location || "—"}</div>
        </div>
        <div>
          <span className="text-xs text-gray-400">תאריך הזמנה</span>
          <div className="font-medium text-gray-800">{order.date || "—"}</div>
        </div>
        <div>
          <span className="text-xs text-gray-400">פריטים</span>
          <div className="font-medium text-gray-800">
            {signCount > 0 && `${signCount} תמרורים`}
            {signCount > 0 && miscCount > 0 && " + "}
            {miscCount > 0 && `${miscCount} שונות`}
            {signCount === 0 && miscCount === 0 && "—"}
          </div>
        </div>
      </div>

      {order.generalNotes && (
        <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-2">
          <span className="font-medium">הערות: </span>{order.generalNotes}
        </div>
      )}

      {order.fabricationRequired && (
        <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2 font-medium">
          🔧 דרושה עבודת מסגרות
        </div>
      )}

      <OpenProblems order={order} />

      {showProblemForm ? (
        <ProblemForm orderId={order.id} onClose={() => setShowProblemForm(false)} />
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setShowConfirm(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            סמן כהושלם
          </button>
          <button
            onClick={() => setShowProblemForm(true)}
            className="px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors whitespace-nowrap"
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

  const pending = orders.filter((o) => o.status === "graphics_pending");
  const active = orders.filter((o) => o.status === "graphics_active");

  const urgentPending = pending.filter((o) => o.priority === "urgent").length;

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">מחלקת גרפיקה</h1>
            <p className="text-sm text-gray-500 mt-0.5">ניהול הזמנות נכנסות ועבודות פעילות</p>
          </div>
          <div className="mr-auto flex items-center gap-2">
            {pending.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold bg-amber-100 text-amber-700">
                {urgentPending > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                )}
                {pending.length} ממתינות
              </span>
            )}
            {active.length > 0 && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold bg-blue-100 text-blue-700">
                {active.length} פעילות
              </span>
            )}
          </div>
        </div>

        {/* Pending section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
            <h2 className="text-base font-bold text-gray-800">הזמנות נכנסות</h2>
            <span className="text-sm text-gray-400">({pending.length})</span>
          </div>

          {pending.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              אין הזמנות חדשות הממתינות לאישור
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pending.map((order) => (
                <PendingOrderCard
                  key={order.id}
                  order={order}
                  onAcknowledge={() => acknowledgeOrder(order.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Active section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
            <h2 className="text-base font-bold text-gray-800">עבודות פעילות</h2>
            <span className="text-sm text-gray-400">({active.length})</span>
          </div>

          {active.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              אין עבודות פעילות כרגע
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {active.map((order) => (
                <ActiveOrderCard
                  key={order.id}
                  order={order}
                  onComplete={() => completeGraphics(order.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
