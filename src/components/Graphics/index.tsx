"use client";

import { useOrdersContext } from "@/context/OrdersContext";
import type { WorkOrder } from "@/types/workOrder";

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

function PendingOrderCard({ order, onAcknowledge }: { order: WorkOrder; onAcknowledge: () => void }) {
  const signCount = order.signRows.filter((r) => r.signNumber).length;
  const miscCount = order.miscRows.filter((r) => r.description).length;

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
          <span className="text-xs text-gray-400">מיקום</span>
          <div className="font-medium text-gray-800 truncate">{order.location || "—"}</div>
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

      {order.reference && (
        <div className="text-xs text-gray-500">
          <span className="font-medium">אסמכתא:</span> {order.reference}
        </div>
      )}

      <button
        onClick={onAcknowledge}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        אישור קבלה
      </button>
    </div>
  );
}

function ActiveOrderCard({ order, onComplete }: { order: WorkOrder; onComplete: () => void }) {
  const signCount = order.signRows.filter((r) => r.signNumber).length;
  const miscCount = order.miscRows.filter((r) => r.description).length;

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 flex flex-col gap-3">
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
          <span className="text-xs text-gray-400">מיקום</span>
          <div className="font-medium text-gray-800 truncate">{order.location || "—"}</div>
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

      {order.reference && (
        <div className="text-xs text-gray-500">
          <span className="font-medium">אסמכתא:</span> {order.reference}
        </div>
      )}

      <button
        onClick={onComplete}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        סמן כהושלם
      </button>
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
