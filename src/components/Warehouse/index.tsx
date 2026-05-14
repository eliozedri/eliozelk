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

function UrgentBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
      דחוף
    </span>
  );
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; border: string; badge: string }
> = {
  pending:    { label: "ממתין להכנה",  bg: "bg-amber-50",  border: "border-amber-200",  badge: "bg-amber-100 text-amber-700" },
  processing: { label: "בהכנה",        bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700" },
  ready:      { label: "מוכן",         bg: "bg-green-50",  border: "border-green-200",  badge: "bg-green-100 text-green-700" },
};

function OrderCard({ order }: { order: WorkOrder }) {
  const { updateOrderFields } = useOrdersContext();

  const warehouseStatus = order.warehouseStatus ?? "pending";
  const cfg = STATUS_CONFIG[warehouseStatus] ?? STATUS_CONFIG.pending;

  const accessoryItems = (order.accessoryRows ?? []).filter(r => r.description?.trim());

  function advance() {
    if (warehouseStatus === "pending")    updateOrderFields(order.id, { warehouseStatus: "processing" });
    if (warehouseStatus === "processing") updateOrderFields(order.id, { warehouseStatus: "ready" });
  }

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-3`}>
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
          {order.jobName && (
            <span className="text-xs text-gray-500 truncate">{order.jobName}</span>
          )}
        </div>
        <div className="text-xs text-gray-400 shrink-0">{formatDate(order.date)}</div>
      </div>

      {/* Accessory items */}
      {accessoryItems.length > 0 && (
        <ul className="text-xs text-gray-700 space-y-1 bg-white/70 rounded-lg px-3 py-2 border border-gray-100">
          {accessoryItems.map((row, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{row.description}</span>
              {row.quantity && <span className="shrink-0 text-gray-500">× {row.quantity}</span>}
            </li>
          ))}
        </ul>
      )}

      {/* Notes */}
      {order.notes && (
        <p className="text-xs text-gray-500 bg-white/60 rounded-lg px-3 py-2 border border-gray-100 line-clamp-2">
          {order.notes}
        </p>
      )}

      {/* Actions */}
      {warehouseStatus !== "ready" && (
        <button
          type="button"
          onClick={advance}
          className={`w-full py-2 rounded-lg text-xs font-bold text-white transition-colors ${
            warehouseStatus === "pending"
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {warehouseStatus === "pending" ? "אשר קבלה — התחל הכנה" : "סמן כמוכן"}
        </button>
      )}
    </div>
  );
}

export function Warehouse() {
  const { orders } = useOrdersContext();

  const warehouseOrders = orders
    .filter(o =>
      o.warehouseRequired &&
      o.status !== "completed" &&
      o.status !== "cancelled"
    )
    .sort((a, b) => {
      const priority = (o: WorkOrder) => (o.priority === "urgent" ? 0 : 1);
      if (priority(a) !== priority(b)) return priority(a) - priority(b);
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  const groups: { key: string; orders: WorkOrder[] }[] = [
    { key: "pending",    orders: warehouseOrders.filter(o => !o.warehouseStatus || o.warehouseStatus === "pending") },
    { key: "processing", orders: warehouseOrders.filter(o => o.warehouseStatus === "processing") },
    { key: "ready",      orders: warehouseOrders.filter(o => o.warehouseStatus === "ready") },
  ];

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shadow">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">מחלקת מחסן</h1>
            <p className="text-sm text-gray-500">הכנת אביזרים ומוצרים להזמנות</p>
          </div>
          <div className="mr-auto flex items-center gap-2">
            <span className="text-sm text-gray-500">סה״כ פתוחות:</span>
            <span className="font-black text-gray-900">{warehouseOrders.filter(o => o.warehouseStatus !== "ready").length}</span>
          </div>
        </div>

        {warehouseOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <p className="text-gray-500 font-medium">אין הזמנות הממתינות להכנה במחסן</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {groups.map(({ key, orders: groupOrders }) => {
              const cfg = STATUS_CONFIG[key];
              return (
                <div key={key}>
                  <div className={`flex items-center gap-2 mb-3 px-1`}>
                    <span className={`text-sm font-bold text-gray-700`}>{cfg.label}</span>
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
                      groupOrders.map(o => <OrderCard key={o.id} order={o} />)
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
