"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCustomersContext } from "@/context/CustomersContext";
import { useOrdersContext } from "@/context/OrdersContext";
import { STATUS_LABELS, STATUS_COLORS } from "@/types/workOrder";
import type { WorkOrder } from "@/types/workOrder";
import { useOperationalKPIs } from "@/hooks/useOperationalKPIs";
import { useOrderRiskScores } from "@/hooks/useOrderRiskScores";
import type { CustomerMetrics, OrderProfitabilitySummary } from "@/lib/operationalKPIs";

// ─── Icons ─────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoney(n: number): string {
  return "₪" + Math.abs(n).toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

// ─── Sub-components ────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "neutral" | "good" | "warn" | "bad";
}) {
  const valCls =
    emphasis === "good" ? "text-green-700" :
    emphasis === "warn" ? "text-amber-600" :
    emphasis === "bad"  ? "text-red-600"   : "text-gray-900";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold leading-none ${valCls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

const RISK_CONFIG: Record<
  CustomerMetrics["riskLevel"],
  { dot: string; label: string; explanation: string; banner: string }
> = {
  green: {
    dot: "bg-green-500",
    label: "לקוח רווחי",
    explanation: "מרווח ממוצע > 10% על פני כלל ההזמנות המבוצעות.",
    banner: "bg-green-50 border-green-200 text-green-800",
  },
  amber: {
    dot: "bg-amber-400",
    label: "מרווח נמוך",
    explanation: "מרווח ממוצע בין 0% ל-10% — עלויות ביצוע גבוהות יחסית להכנסות.",
    banner: "bg-amber-50 border-amber-200 text-amber-800",
  },
  red: {
    dot: "bg-red-500",
    label: "לקוח עם הפסדים",
    explanation: "מרווח ממוצע שלילי — עלויות הביצוע עולות על ההכנסות.",
    banner: "bg-red-50 border-red-200 text-red-800",
  },
};

const RISK_BADGE: Record<string, { label: string; cls: string }> = {
  medium:   { label: "סיכון בינוני",  cls: "bg-amber-100 text-amber-700"  },
  high:     { label: "סיכון גבוה",    cls: "bg-orange-100 text-orange-700" },
  critical: { label: "סיכון קריטי",   cls: "bg-red-100 text-red-700"       },
};

// ─── Order table row ───────────────────────────────────────────────────────

function OrderHistoryRow({ order }: { order: WorkOrder }) {
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
      <td className="px-4 py-3 text-sm text-gray-500">
        {[signCount > 0 && `${signCount} תמרורים`, miscCount > 0 && `${miscCount} פריטים`]
          .filter(Boolean).join(" + ") || "—"}
      </td>
    </tr>
  );
}

function ProfitabilityRow({ s }: { s: OrderProfitabilitySummary }) {
  const marginCls =
    s.marginPct < 0 ? "text-red-600" :
    s.marginPct < 10 ? "text-amber-600" : "text-green-700";
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-2.5 text-sm font-mono font-semibold text-gray-800">{s.orderNumber}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500 capitalize">{s.orderStatus}</td>
      <td className="px-4 py-2.5 text-sm text-gray-700">{s.totalRevenue > 0 ? fmtMoney(s.totalRevenue) : "—"}</td>
      <td className="px-4 py-2.5 text-sm text-gray-700">{s.totalCost > 0 ? fmtMoney(s.totalCost) : "—"}</td>
      <td className={`px-4 py-2.5 text-sm font-semibold ${s.netProfit !== 0 ? (s.netProfit > 0 ? "text-green-700" : "text-red-600") : "text-gray-400"}`}>
        {s.netProfit !== 0 ? `${s.netProfit > 0 ? "+" : ""}${fmtMoney(s.netProfit)}` : "—"}
      </td>
      <td className={`px-4 py-2.5 text-sm font-semibold ${marginCls}`}>
        {s.totalRevenue > 0 ? `${s.marginPct.toFixed(1)}%` : "—"}
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{s.diaryCount} יומנים</td>
    </tr>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { customers } = useCustomersContext();
  const { orders } = useOrdersContext();
  const { byCustomer, byOrder } = useOperationalKPIs();
  const riskScores = useOrderRiskScores();

  const customer = customers.find((c) => c.id === params.id);

  const customerOrders = useMemo(
    () => orders.filter(
      (o) => o.customer.trim().toLowerCase() === (customer?.name ?? "").trim().toLowerCase()
    ),
    [orders, customer]
  );

  const customerMetrics = useMemo(
    () => byCustomer.find(
      (c) => c.customerName.trim().toLowerCase() === (customer?.name ?? "").trim().toLowerCase()
    ) ?? null,
    [byCustomer, customer]
  );

  const customerProfitOrders = useMemo(
    () => byOrder.filter(
      (o) => o.customerName.trim().toLowerCase() === (customer?.name ?? "").trim().toLowerCase()
    ),
    [byOrder, customer]
  );

  // Completed orders without invoice
  const uninvoicedOrders = useMemo(
    () => customerOrders.filter(
      (o) => o.status === "completed" &&
        !o.invoicedAt &&
        (!o.accountingStatus || o.accountingStatus === "pending")
    ),
    [customerOrders]
  );

  // Active orders with medium+ risk
  const riskyActiveOrders = useMemo(
    () => customerOrders.filter((o) => {
      const rs = riskScores.get(o.id);
      return rs && rs.level !== "low" && o.status !== "completed" && o.status !== "cancelled";
    }),
    [customerOrders, riskScores]
  );

  if (!customer) {
    return (
      <div className="min-h-screen bg-surface py-12 px-4 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">לקוח לא נמצא</p>
        <Link href="/customers" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
          <BackIcon /> חזור ללקוחות
        </Link>
      </div>
    );
  }

  const openOrders = customerOrders.filter(
    (o) => o.status !== "completed" && o.status !== "cancelled"
  );
  const completedOrders = customerOrders.filter((o) => o.status === "completed");

  const risk = customerMetrics ? RISK_CONFIG[customerMetrics.riskLevel] : null;

  return (
    <div className="min-h-screen bg-surface py-6 px-4">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Back */}
        <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <BackIcon />
          חזור ללקוחות
        </Link>

        {/* Header card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                {risk && (
                  <span className={`w-3 h-3 rounded-full shrink-0 ${risk.dot}`} title={risk.label} />
                )}
                <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
                {risk && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${risk.banner}`}>
                    {risk.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {customer.phone && <span dir="ltr">{customer.phone}</span>}
                {customer.location && <span>{customer.location}</span>}
              </div>
              {customer.paymentTerms && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                  תנאי תשלום: {customer.paymentTerms}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-400">נוסף {formatDate(customer.createdAt)}</div>
          </div>
          {customer.notes && (
            <div className="mt-3 p-3 rounded-lg bg-gray-50 text-sm text-gray-600">{customer.notes}</div>
          )}
          {risk && customerMetrics && (
            <div className={`mt-3 flex items-start gap-2 p-3 rounded-lg border text-xs ${risk.banner}`}>
              <AlertIcon />
              <span>{risk.explanation}</span>
            </div>
          )}
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label="סה״כ הזמנות" value={String(customerOrders.length)} />
          <KpiTile label="הזמנות פתוחות" value={String(openOrders.length)} sub="בתהליך" />
          <KpiTile label="הושלמו" value={String(completedOrders.length)} />
          {customerMetrics ? (
            <>
              <KpiTile
                label="סה״כ הכנסות"
                value={"₪" + customerMetrics.totalRevenue.toLocaleString("he-IL", { maximumFractionDigits: 0 })}
              />
            </>
          ) : (
            <KpiTile label="הכנסות" value="—" sub="אין נתוני יומן" />
          )}
        </div>

        {/* Financial P&L panel */}
        {customerMetrics && customerMetrics.totalRevenue > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">תמונה פיננסית</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">מבוסס יומני ביצוע מאושרים ומוגשים</p>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">הכנסות</span>
                <span className="text-xl font-black text-gray-900">
                  {fmtMoney(customerMetrics.totalRevenue)}
                </span>
                <span className="text-[10px] text-gray-400">{customerMetrics.diaryCount} יומנים</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">עלויות</span>
                <span className="text-xl font-black text-gray-900">
                  {fmtMoney(customerMetrics.totalCost)}
                </span>
                <span className="text-[10px] text-gray-400">{customerMetrics.orderCount} הזמנות</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">רווח נקי</span>
                <span className={`text-xl font-black ${customerMetrics.netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {customerMetrics.netProfit >= 0 ? "+" : ""}{fmtMoney(customerMetrics.netProfit)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">מרווח ממוצע</span>
                <span className={`text-xl font-black ${
                  customerMetrics.avgMarginPct < 0 ? "text-red-600" :
                  customerMetrics.avgMarginPct < 10 ? "text-amber-600" : "text-green-700"
                }`}>
                  {customerMetrics.avgMarginPct.toFixed(1)}%
                </span>
                <span className="text-[10px] text-gray-400">
                  ₪{Math.round(customerMetrics.avgRevenuePerOrder).toLocaleString()} ממוצע/הזמנה
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Billing leakage callout */}
        {uninvoicedOrders.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-amber-500 mt-0.5 shrink-0"><AlertIcon /></span>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {uninvoicedOrders.length} הזמנות שהושלמו ממתינות לחיוב
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {uninvoicedOrders.map((o) => o.orderNumber).join(", ")}
              </p>
            </div>
            <Link
              href="/accounting"
              className="mr-auto text-xs font-semibold text-amber-800 hover:text-amber-900 underline whitespace-nowrap"
            >
              פתח בחשבונאות
            </Link>
          </div>
        )}

        {/* Active order risk summary */}
        {riskyActiveOrders.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">הזמנות פעילות בסיכון</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {riskyActiveOrders.length}
              </span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {riskyActiveOrders.map((order) => {
                const rs = riskScores.get(order.id)!;
                const badge = RISK_BADGE[rs.level];
                return (
                  <div key={order.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 bg-gray-50/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{order.orderNumber}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">
                        {rs.factors.map((f) => f.label).join(" · ")}
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Per-order profitability table */}
        {customerProfitOrders.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">רווחיות לפי הזמנה</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">מבוסס יומני ביצוע שהוגשו</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">הזמנה</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">סטטוס</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">הכנסות</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">עלויות</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">רווח</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">מרווח</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">יומנים</th>
                  </tr>
                </thead>
                <tbody>
                  {customerProfitOrders.map((s) => (
                    <ProfitabilityRow key={s.orderId} s={s} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Full order history table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">היסטוריית הזמנות</h2>
          </div>
          {customerOrders.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">אין הזמנות ללקוח זה</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">מספר הזמנה</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">תאריך</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">עיר</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">סטטוס</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">פריטים</th>
                  </tr>
                </thead>
                <tbody>
                  {customerOrders.map((order) => (
                    <OrderHistoryRow key={order.id} order={order} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
