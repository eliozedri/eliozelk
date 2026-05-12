"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCustomers } from "@/hooks/useCustomers";
import { useOrdersContext } from "@/context/OrdersContext";
import { STATUS_LABELS, STATUS_COLORS } from "@/types/workOrder";
import type { WorkOrder } from "@/types/workOrder";

function BackIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function OrderRow({ order }: { order: WorkOrder }) {
  const signCount = order.signRows.filter((r) => r.signNumber).length;
  const miscCount = [
    ...order.miscRows.filter((r) => r.description),
    ...(order.accessoryRows ?? []).filter((r) => r.description),
  ].length;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{order.orderNumber}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(order.date)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{order.city || order.location || "—"}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
          {STATUS_LABELS[order.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {signCount > 0 && `${signCount} תמרורים`}
        {signCount > 0 && miscCount > 0 && " + "}
        {miscCount > 0 && `${miscCount} פריטים`}
        {signCount === 0 && miscCount === 0 && "—"}
      </td>
      <td className="px-4 py-3 text-sm text-gray-400">{formatDate(order.createdAt)}</td>
    </tr>
  );
}

export function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { customers } = useCustomers();
  const { orders } = useOrdersContext();

  const customer = customers.find((c) => c.id === params.id);
  const customerOrders = orders.filter(
    (o) => o.customer.trim().toLowerCase() === (customer?.name ?? "").trim().toLowerCase()
  );

  const completedOrders = customerOrders.filter((o) => o.status === "completed");
  const openOrders = customerOrders.filter((o) => o.status !== "completed" && o.status !== "cancelled");

  if (!customer) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] py-12 px-4 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">לקוח לא נמצא</p>
        <Link href="/customers" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
          <BackIcon /> חזור ללקוחות
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Back */}
        <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
          <BackIcon />
          חזור ללקוחות
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                {customer.phone && <span dir="ltr">{customer.phone}</span>}
                {customer.location && <span>{customer.location}</span>}
              </div>
              {customer.paymentTerms && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                  תנאי תשלום: {customer.paymentTerms}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-400 text-left">
              נוסף {formatDate(customer.createdAt)}
            </div>
          </div>
          {customer.notes && (
            <div className="mt-3 p-3 rounded-lg bg-gray-50 text-sm text-gray-600">{customer.notes}</div>
          )}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="סה״כ הזמנות" value={customerOrders.length} />
          <StatCard label="הזמנות פתוחות" value={openOrders.length} sub="בתהליך" />
          <StatCard label="הזמנות שהושלמו" value={completedOrders.length} />
          <StatCard
            label="הזמנה אחרונה"
            value={customerOrders.length > 0 ? formatDate(customerOrders[0].date) : "—"}
          />
        </div>

        {/* Orders table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">היסטוריית הזמנות</h2>
          </div>

          {customerOrders.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">אין הזמנות ללקוח זה</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-sm font-medium text-gray-500 text-right">מספר הזמנה</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-500 text-right">תאריך</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-500 text-right">עיר</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-500 text-right">סטטוס</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-500 text-right">פריטים</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-500 text-right">נוצרה</th>
                  </tr>
                </thead>
                <tbody>
                  {customerOrders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Future placeholder: payments */}
        <div className="mt-6 bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
          <div className="text-2xl mb-2">💳</div>
          <p>מעקב תשלומים — יתווסף בקרוב</p>
          <p className="text-xs mt-1">תנאי תשלום, חשבוניות, גבייה</p>
        </div>

      </div>
    </div>
  );
}
