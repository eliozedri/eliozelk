"use client";

import { useState } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import type { WorkOrder } from "@/types/workOrder";
import {
  FABRICATION_STATUS_LABELS,
  FABRICATION_STATUS_COLORS,
  type FabricationStatus,
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

function FabricationCard({ order }: { order: WorkOrder }) {
  const { updateOrderFields } = useOrdersContext();
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
    const now = new Date().toISOString();
    const extra: Partial<WorkOrder> = { fabricationStatus: next };
    if (next === "acknowledged") extra.fabricationAcknowledgedAt = now;
    if (next === "completed") extra.fabricationCompletedAt = now;
    updateOrderFields(order.id, extra);
  }

  function markIssue() {
    updateOrderFields(order.id, { fabricationStatus: "issue" });
  }

  const borderColor = {
    pending: "border-amber-200",
    acknowledged: "border-blue-200",
    in_progress: "border-purple-200",
    ready: "border-teal-200",
    completed: "border-green-200",
    issue: "border-red-200",
  }[status];

  return (
    <div className={`bg-white rounded-xl border ${borderColor} shadow-sm p-4 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">{order.orderNumber}</span>
            {order.priority === "urgent" && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">דחוף</span>
            )}
          </div>
          <span className="text-xs text-gray-500">נכנסה {formatDate(order.graphicsSentAt)}</span>
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

      <div className="flex gap-2">
        {NEXT_STATUS[status] !== null && (
          <button
            onClick={advance}
            className="flex-1 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            {NEXT_LABEL[status]}
          </button>
        )}
        {status !== "completed" && status !== "issue" && (
          <button
            onClick={markIssue}
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

  const fabOrders = orders.filter((o) => o.fabricationRequired);

  const visibleGroups = STATUS_GROUPS.filter((g) =>
    showCompleted ? true : !g.statuses.includes("completed")
  );

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
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
