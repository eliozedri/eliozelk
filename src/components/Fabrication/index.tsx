"use client";

import { useState } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import type { WorkOrder } from "@/types/workOrder";
import {
  FABRICATION_STATUS_LABELS,
  FABRICATION_STATUS_COLORS,
  PROBLEM_CATEGORY_LABELS,
  PROBLEM_STATUS_LABELS,
  PROBLEM_STATUS_COLORS,
  type FabricationStatus,
  type OrderProblemCategory,
} from "@/types/workOrder";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: FabricationStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${FABRICATION_STATUS_COLORS[status]}`}>
      {FABRICATION_STATUS_LABELS[status]}
    </span>
  );
}

const FAB_CATEGORIES: OrderProblemCategory[] = [
  "missing_dimensions", "material_shortage", "fabrication_unclear", "unclear_request", "other",
];

function ProblemForm({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { addOrderProblem } = useOrdersContext();
  const [category, setCategory] = useState<OrderProblemCategory>("fabrication_unclear");
  const [description, setDescription] = useState("");

  function submit() {
    if (!description.trim()) return;
    addOrderProblem(orderId, { department: "fabrication", category, description: description.trim() });
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
        {FAB_CATEGORIES.map((c) => (
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

function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4">
        <p className="text-sm font-medium text-gray-800 text-center leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button type="button" onClick={onConfirm} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors">כן, מוכן</button>
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">ביטול</button>
        </div>
      </div>
    </div>
  );
}

function FabricationCard({ order }: { order: WorkOrder }) {
  const { updateOrderFields } = useOrdersContext();
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [showReadyConfirm, setShowReadyConfirm] = useState(false);
  const status = order.fabricationStatus ?? "pending";
  const fab = order.fabricationDetails;

  const NEXT_STATUS: Record<FabricationStatus, FabricationStatus | null> = {
    pending: "acknowledged",
    acknowledged: "in_progress",
    in_progress: "ready",
    ready: "completed",
    completed: null,
    issue: "in_progress",
  };

  const NEXT_LABEL: Record<FabricationStatus, string> = {
    pending: "אשר קבלה",
    acknowledged: "התחל עבודה",
    in_progress: "סמן כמוכן",
    ready: "סמן כהושלם",
    completed: "",
    issue: "חזור לעבודה",
  };

  function advance() {
    const next = NEXT_STATUS[status];
    if (!next) return;
    // Require explicit confirmation before marking ready
    if (status === "in_progress" && next === "ready") {
      setShowReadyConfirm(true);
      return;
    }
    doAdvance(next);
  }

  function doAdvance(next: FabricationStatus) {
    const now = new Date().toISOString();
    const extra: Partial<WorkOrder> = { fabricationStatus: next };
    if (next === "acknowledged") extra.fabricationAcknowledgedAt = now;
    if (next === "ready")        extra.fabricationReadyAt = now;
    if (next === "completed")    extra.fabricationCompletedAt = now;
    updateOrderFields(order.id, extra);
  }

  const borderColor = {
    pending: "border-amber-200",
    acknowledged: "border-blue-200",
    in_progress: "border-purple-200",
    ready: "border-teal-200",
    completed: "border-green-200",
    issue: "border-red-300",
  }[status];

  return (
    <div className={`bg-white rounded-xl border ${borderColor} shadow-sm p-4 flex flex-col gap-3`}>
      {showReadyConfirm && (
        <ConfirmModal
          message="האם ההזמנה מוכנה בוודאות וניתן להעביר אותה להתקנה?"
          onConfirm={() => { setShowReadyConfirm(false); doAdvance("ready"); }}
          onCancel={() => setShowReadyConfirm(false)}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">{order.orderNumber}</span>
            {order.priority === "urgent" && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">דחוף</span>
            )}
          </div>
          <span className="text-xs text-gray-500">נכנסה {order.graphicsSentAt ? formatDate(order.graphicsSentAt) : "—"}</span>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-xs text-gray-400">לקוח</span>
          <div className="font-medium text-gray-800 truncate">{order.customer || "—"}</div>
        </div>
        <div>
          <span className="text-xs text-gray-400">עיר</span>
          <div className="font-medium text-gray-800">{order.city || "—"}</div>
        </div>
      </div>

      {fab && (
        <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-sm">
          {fab.description && <div className="font-medium text-gray-800 mb-1">{fab.description}</div>}
          <div className="flex flex-wrap gap-3 text-xs text-gray-600">
            {fab.width && <span>רוחב: {fab.width} ס&quot;מ</span>}
            {fab.height && <span>גובה: {fab.height} ס&quot;מ</span>}
            {fab.quantity && <span>כמות: {fab.quantity}</span>}
            {fab.material && <span>חומר: {fab.material}</span>}
          </div>
          {fab.notes && <div className="text-xs text-gray-500 mt-1">{fab.notes}</div>}
        </div>
      )}

      {order.generalNotes && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
          <span className="font-medium">הערות: </span>{order.generalNotes}
        </div>
      )}

      <OpenProblems order={order} />

      {showProblemForm ? (
        <ProblemForm orderId={order.id} onClose={() => setShowProblemForm(false)} />
      ) : (
        <div className="flex gap-2">
          {NEXT_STATUS[status] !== null && (
            <button
              onClick={advance}
              className="flex-1 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              {NEXT_LABEL[status]}
            </button>
          )}
          {status !== "completed" && (
            <button
              onClick={() => setShowProblemForm(true)}
              className="px-3 py-2 rounded-lg text-sm font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
            >
              בעיה
            </button>
          )}
          {status === "completed" && (
            <div className="flex-1 py-2 rounded-lg text-sm font-bold text-center text-green-700 bg-green-50 border border-green-200">
              ✓ הושלם
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_GROUPS: { statuses: FabricationStatus[]; label: string; dotColor: string }[] = [
  { statuses: ["pending"], label: "ממתינות לאישור", dotColor: "bg-amber-400" },
  { statuses: ["acknowledged", "in_progress"], label: "עבודות פעילות", dotColor: "bg-purple-500" },
  { statuses: ["ready"], label: "מוכנות לאיסוף", dotColor: "bg-teal-500" },
  { statuses: ["issue"], label: "בעיות", dotColor: "bg-red-500" },
  { statuses: ["completed"], label: "הושלמו", dotColor: "bg-green-500" },
];

export function Fabrication() {
  const { orders } = useOrdersContext();
  const [showCompleted, setShowCompleted] = useState(false);

  const fabOrders = orders.filter((o) => o.fabricationRequired && o.status !== "cancelled");

  const visibleGroups = STATUS_GROUPS.filter((g) =>
    showCompleted ? true : !g.statuses.includes("completed")
  );

  return (
    <div className="min-h-screen bg-surface py-6 px-4">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">מחלקת מסגריה</h1>
            <p className="text-sm text-gray-500 mt-0.5">עבודות מסגרות פעילות</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none no-print">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="w-4 h-4 rounded accent-green-600"
            />
            הצג הושלמו
          </label>
        </div>

        {fabOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-4xl mb-3">🔧</div>
            <p className="text-gray-500 text-sm">אין הזמנות עם עבודת מסגרות כרגע</p>
            <p className="text-gray-400 text-xs mt-1">הזמנות עם ✓ &quot;האם דרושה עבודת מסגרות&quot; יופיעו כאן</p>
          </div>
        ) : (
          visibleGroups.map((group) => {
            const groupOrders = fabOrders.filter((o) =>
              group.statuses.includes(o.fabricationStatus ?? "pending")
            );
            if (groupOrders.length === 0) return null;
            return (
              <div key={group.label} className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${group.dotColor}`} />
                  <h2 className="text-base font-bold text-gray-800">{group.label}</h2>
                  <span className="text-sm text-gray-400">({groupOrders.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupOrders.map((order) => (
                    <FabricationCard key={order.id} order={order} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
