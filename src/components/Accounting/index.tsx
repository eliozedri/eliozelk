"use client";

import { useState, useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import type { WorkOrder } from "@/types/workOrder";
import { STATUS_LABELS, ACCOUNTING_STATUS_LABELS, ACCOUNTING_STATUS_COLORS } from "@/types/workOrder";
import { exportAccountingCSV, exportAccountingPDF, exportCustomerBillingCSV } from "@/lib/accountingExport";
import type { AccountingReportData } from "@/components/pdf/AccountingDocument";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { DIARY_STATUS_LABELS, DIARY_STATUS_COLORS } from "@/types/workDiary";
import { exportWorkDiaryPDF, exportWorkDiaryCSV } from "@/lib/workDiaryExport";
import { useAuth } from "@/context/AuthContext";
import { useOperationalKPIs } from "@/hooks/useOperationalKPIs";

function AccountingIcon() {
  return (
    <svg className="w-7 h-7 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function countSignQty(order: WorkOrder): number {
  return order.signRows.reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0);
}

function countMiscQty(order: WorkOrder): number {
  return order.miscRows.reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0);
}

interface KpiCardProps {
  label: string;
  value: number | string;
  color: string;
}

function KpiCard({ label, value, color }: KpiCardProps) {
  return (
    <div className={`bg-white rounded-xl border ${color} px-5 py-4 shadow-sm flex flex-col gap-1`}>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

interface ExpandedRowProps {
  order: WorkOrder;
}

function ExpandedRow({ order }: ExpandedRowProps) {
  const hasSigns = order.signRows.some((r) => r.signNumber || r.quantity);
  const hasMisc = order.miscRows.some((r) => r.description);

  return (
    <tr>
      <td colSpan={9} className="px-0 py-0 bg-gray-50 border-b border-gray-200">
        <div className="px-8 py-4 space-y-4">
          {hasSigns && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">תמרורים</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-right font-medium pb-1 w-28">מספר שלט</th>
                    <th className="text-right font-medium pb-1 w-16">כמות</th>
                    <th className="text-right font-medium pb-1 w-32">מידות</th>
                    <th className="text-right font-medium pb-1">סוג</th>
                    <th className="text-right font-medium pb-1">הערות</th>
                  </tr>
                </thead>
                <tbody>
                  {order.signRows
                    .filter((r) => r.signNumber || r.quantity)
                    .map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="py-1 text-gray-800 font-medium">{r.signNumber || "—"}</td>
                        <td className="py-1 text-gray-700">{r.quantity || "—"}</td>
                        <td className="py-1 text-gray-500">{r.size || "—"}</td>
                        <td className="py-1 text-gray-500">{r.type || "—"}</td>
                        <td className="py-1 text-gray-400">{r.notes || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {hasMisc && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">שונות</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-right font-medium pb-1">תיאור</th>
                    <th className="text-right font-medium pb-1 w-16">כמות</th>
                    <th className="text-right font-medium pb-1 w-20">יחידה</th>
                    <th className="text-right font-medium pb-1">הערות</th>
                  </tr>
                </thead>
                <tbody>
                  {order.miscRows
                    .filter((r) => r.description)
                    .map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="py-1 text-gray-800">
                          {r.description}
                          {r.catalogItemId && (
                            <span className="mr-2 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                              מהקטלוג
                            </span>
                          )}
                        </td>
                        <td className="py-1 text-gray-700">{r.quantity || "—"}</td>
                        <td className="py-1 text-gray-500">{r.catalogItemUnit || "—"}</td>
                        <td className="py-1 text-gray-400">{r.notes || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {!hasSigns && !hasMisc && (
            <p className="text-xs text-gray-400 text-center py-2">אין פריטים בהזמנה זו</p>
          )}
        </div>
      </td>
    </tr>
  );
}

const ALL_STATUSES = [
  { value: "all", label: "כל הסטטוסים" },
  { value: "graphics_pending", label: STATUS_LABELS.graphics_pending },
  { value: "graphics_active", label: STATUS_LABELS.graphics_active },
  { value: "graphics_done", label: STATUS_LABELS.graphics_done },
  { value: "production", label: STATUS_LABELS.production },
  { value: "ready_installation", label: STATUS_LABELS.ready_installation },
  { value: "completed", label: STATUS_LABELS.completed },
  { value: "cancelled", label: STATUS_LABELS.cancelled },
];

const STATUS_COLORS: Record<string, string> = {
  graphics_pending: "bg-amber-100 text-amber-700",
  graphics_active: "bg-blue-100 text-blue-700",
  graphics_done: "bg-green-100 text-green-700",
  production: "bg-purple-100 text-purple-700",
  ready_installation: "bg-teal-100 text-teal-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
};

function agingDays(isoDate: string): number {
  return Math.round((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

function AgingBadge({ days }: { days: number }) {
  const cls =
    days >= 30 ? "bg-red-100 text-red-700" :
    days >= 7  ? "bg-amber-100 text-amber-700" :
                 "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`}>
      {days}י
    </span>
  );
}

export function AccountingPage() {
  const { orders, updateOrderFields } = useOrdersContext();
  const { diaries } = useWorkDiaryContext();
  const { profile } = useAuth();
  const { billingLeakage, byOrder } = useOperationalKPIs();

  const [activeTab, setActiveTab] = useState<"orders" | "work-diaries" | "billing" | "invoiced">("orders");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [diaryExportingId, setDiaryExportingId] = useState<string | null>(null);
  const [diaryCsvExportingId, setDiaryCsvExportingId] = useState<string | null>(null);
  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  const [invoiceInputs, setInvoiceInputs] = useState<Record<string, string>>({});
  const [billedAmountInputs, setBilledAmountInputs] = useState<Record<string, string>>({});
  // Billing tab specific
  const [billingDateFrom, setBillingDateFrom] = useState("");
  const [billingDateTo, setBillingDateTo] = useState("");
  const [expandedBillingCustomers, setExpandedBillingCustomers] = useState<Set<string>>(new Set());

  // Map orderId → diary revenue for billing queue enrichment
  const orderRevenueMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of byOrder) m.set(o.orderId, o.totalRevenue);
    return m;
  }, [byOrder]);

  // Invoiced history
  const invoicedOrders = useMemo(
    () => orders
      .filter(o => o.accountingStatus === "invoiced" || (o.invoicedAt != null))
      .sort((a, b) => new Date(b.invoicedAt ?? b.updatedAt).getTime() - new Date(a.invoicedAt ?? a.updatedAt).getTime()),
    [orders]
  );

  const invoicedThisMonth = useMemo(() => {
    const now = new Date();
    return invoicedOrders.filter(o => {
      const d = new Date(o.invoicedAt ?? o.updatedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [invoicedOrders]);

  const pendingBilling = useMemo(
    () => orders.filter(
      (o) => o.status === "completed" &&
             (!o.accountingStatus || o.accountingStatus === "pending") &&
             !o.invoicedAt
    ),
    [orders]
  );

  const pendingBillingFiltered = useMemo(() => {
    return pendingBilling.filter((o) => {
      if (billingDateFrom && o.date < billingDateFrom) return false;
      if (billingDateTo && o.date > billingDateTo) return false;
      return true;
    });
  }, [pendingBilling, billingDateFrom, billingDateTo]);

  interface CustomerBillingGroup {
    customerName: string;
    orders: WorkOrder[];
    totalEstRevenue: number;
    oldestDate: string;
    newestDate: string;
  }

  const billingByCustomer = useMemo<CustomerBillingGroup[]>(() => {
    const map = new Map<string, CustomerBillingGroup>();
    for (const o of pendingBillingFiltered) {
      const name = o.customer || "לא ידוע";
      if (!map.has(name)) {
        map.set(name, { customerName: name, orders: [], totalEstRevenue: 0, oldestDate: o.date, newestDate: o.date });
      }
      const g = map.get(name)!;
      g.orders.push(o);
      g.totalEstRevenue += orderRevenueMap.get(o.id) ?? 0;
      if (o.date < g.oldestDate) g.oldestDate = o.date;
      if (o.date > g.newestDate) g.newestDate = o.date;
    }
    return Array.from(map.values()).sort((a, b) => b.orders.length - a.orders.length);
  }, [pendingBillingFiltered, orderRevenueMap]);

  function toggleBillingCustomer(name: string) {
    setExpandedBillingCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function handleMarkInvoiced(order: WorkOrder) {
    setInvoicingId(order.id);
    const invoiceNumber = invoiceInputs[order.id]?.trim() || null;
    const billedAmountRaw = billedAmountInputs[order.id]?.trim();
    const billedAmount = billedAmountRaw ? parseFloat(billedAmountRaw) || null : null;
    updateOrderFields(order.id, {
      accountingStatus: "invoiced",
      invoicedAt: new Date().toISOString(),
      invoicedBy: profile?.name ?? null,
      invoiceNumber,
      ...(billedAmount != null ? { billedAmount } : {}),
    });
    setInvoiceInputs((prev) => { const next = { ...prev }; delete next[order.id]; return next; });
    setBilledAmountInputs((prev) => { const next = { ...prev }; delete next[order.id]; return next; });
    setInvoicingId(null);
  }

  const submittedDiaries = useMemo(
    () => diaries.filter((d) => d.status === "submitted"),
    [diaries]
  );

  const filteredDiaries = useMemo(() => {
    return submittedDiaries.filter((d) => {
      if (filterCustomer && !d.customerName.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
      if (filterDateFrom && d.executionDate < filterDateFrom) return false;
      if (filterDateTo && d.executionDate > filterDateTo) return false;
      return true;
    });
  }, [submittedDiaries, filterCustomer, filterDateFrom, filterDateTo]);

  async function handleDiaryPDF(id: string) {
    const diary = diaries.find((d) => d.id === id);
    if (!diary) return;
    setDiaryExportingId(id);
    try {
      await exportWorkDiaryPDF(diary);
    } finally {
      setDiaryExportingId(null);
    }
  }

  function handleDiaryCSV(id: string) {
    const diary = diaries.find((d) => d.id === id);
    if (!diary) return;
    setDiaryCsvExportingId(id);
    exportWorkDiaryCSV(diary);
    setDiaryCsvExportingId(null);
  }

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filterCustomer && !o.customer.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
      if (filterDateFrom && o.date < filterDateFrom) return false;
      if (filterDateTo && o.date > filterDateTo) return false;
      if (filterStatus !== "all" && o.status !== filterStatus) return false;
      return true;
    });
  }, [orders, filterCustomer, filterDateFrom, filterDateTo, filterStatus]);

  const kpis = useMemo(() => {
    const completed = filtered.filter((o) => o.status === "completed").length;
    const uniqueCustomers = new Set(filtered.map((o) => o.customer)).size;
    const totalSigns = filtered.reduce((s, o) => s + countSignQty(o), 0);
    const totalMisc = filtered.reduce((s, o) => s + countMiscQty(o), 0);
    return { completed, uniqueCustomers, totalSigns, totalMisc };
  }, [filtered]);

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildReportData(): AccountingReportData {
    return {
      orders: filtered,
      filterCustomer,
      filterDateFrom,
      filterDateTo,
      filterStatus,
      generatedAt: new Date().toISOString(),
    };
  }

  async function handleExportPDF() {
    setExporting(true);
    try {
      await exportAccountingPDF(buildReportData());
    } finally {
      setExporting(false);
    }
  }

  function handleExportCSV() {
    exportAccountingCSV(buildReportData());
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">הנהלת חשבונות</h1>
          <AccountingIcon />
        </div>
        <p className="text-sm text-gray-500 mb-4">סיכום עבודות, כמויות ודוחות לפי לקוחות</p>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 shadow-sm p-1 mb-5 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "orders"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            הזמנות
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("billing")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "billing"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            ממתין לחיוב
            {pendingBilling.length > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-xs font-bold ${activeTab === "billing" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
                {pendingBilling.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("work-diaries")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "work-diaries"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            יומני עבודה
            {submittedDiaries.length > 0 && (
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${activeTab === "work-diaries" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>
                {submittedDiaries.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("invoiced")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "invoiced"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            היסטוריית חיוב
            {invoicedOrders.length > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-xs font-bold ${activeTab === "invoiced" ? "bg-white/20 text-white" : "bg-green-100 text-green-700"}`}>
                {invoicedOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Pending Billing Tab — grouped by customer */}
        {activeTab === "billing" && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="bg-white rounded-xl border border-amber-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{pendingBillingFiltered.length}</p>
                <p className="text-xs text-gray-500">הזמנות ממתינות</p>
              </div>
              <div className="bg-white rounded-xl border border-blue-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-blue-700">{billingByCustomer.length}</p>
                <p className="text-xs text-gray-500">לקוחות עם חיוב פתוח</p>
              </div>
              <div className="bg-white rounded-xl border border-red-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-amber-700">
                  {billingLeakage.uninvoicedEstimatedRevenue > 0
                    ? "₪" + Math.round(billingLeakage.uninvoicedEstimatedRevenue).toLocaleString()
                    : "—"}
                </p>
                <p className="text-xs text-gray-500">הכנסות ממתינות לגבייה</p>
              </div>
              <div className="bg-white rounded-xl border border-green-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-green-700">{invoicedThisMonth}</p>
                <p className="text-xs text-gray-500">חויבו החודש</p>
              </div>
            </div>

            {/* Date filter for billing */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 px-5 py-4">
              <p className="text-xs font-semibold text-gray-600 mb-3">סינון לפי תאריך ביצוע</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">מתאריך</label>
                  <input type="date" value={billingDateFrom} onChange={(e) => setBillingDateFrom(e.target.value)} dir="ltr"
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">עד תאריך</label>
                  <input type="date" value={billingDateTo} onChange={(e) => setBillingDateTo(e.target.value)} dir="ltr"
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              {(billingDateFrom || billingDateTo) && (
                <div className="flex justify-end mt-2">
                  <button type="button" onClick={() => { setBillingDateFrom(""); setBillingDateTo(""); }}
                    className="px-3 py-1 rounded border border-gray-300 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                    נקה סינון
                  </button>
                </div>
              )}
            </div>

            {/* Customer-grouped view */}
            {billingByCustomer.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16 text-center">
                <p className="text-gray-500 font-medium">אין הזמנות הממתינות לחיוב</p>
                <p className="text-sm text-gray-400 mt-1">
                  {pendingBilling.length > 0 ? "נסה לשנות את טווח התאריכים" : "הזמנות שהושלמו ועדיין לא חויבו יופיעו כאן"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {billingByCustomer.map((group) => {
                  const isOpen = expandedBillingCustomers.has(group.customerName);
                  return (
                    <div key={group.customerName} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      {/* Customer header row */}
                      <div
                        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-amber-50/30 transition-colors"
                        onClick={() => toggleBillingCustomer(group.customerName)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">{group.customerName}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatDate(group.oldestDate)}
                            {group.oldestDate !== group.newestDate ? ` — ${formatDate(group.newestDate)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-center">
                            <p className="text-lg font-bold text-amber-600">{group.orders.length}</p>
                            <p className="text-[10px] text-gray-400">הזמנות</p>
                          </div>
                          {group.totalEstRevenue > 0 && (
                            <div className="text-center">
                              <p className="text-lg font-bold text-green-700">{"₪" + Math.round(group.totalEstRevenue).toLocaleString()}</p>
                              <p className="text-[10px] text-gray-400">הכנסה משוערת</p>
                            </div>
                          )}
                          {/* Export buttons */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); exportCustomerBillingCSV(group.customerName, group.orders); }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-green-300 text-green-700 hover:bg-green-50 transition-colors whitespace-nowrap"
                          >
                            Excel
                          </button>
                          <span className={`text-gray-300 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                          </span>
                        </div>
                      </div>

                      {/* Expanded order list */}
                      {isOpen && (
                        <div className="border-t border-gray-100">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">הזמנה</th>
                                <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">שם עבודה</th>
                                <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">מיקום</th>
                                <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right w-20">המתנה</th>
                                <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">הכנסה משוערת</th>
                                <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">מס׳ חשבונית</th>
                                <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">סכום ₪</th>
                                <th className="px-4 py-2 w-24"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.orders.map((order) => {
                                const estRevenue = orderRevenueMap.get(order.id) ?? 0;
                                const days = agingDays(order.updatedAt);
                                return (
                                  <tr key={order.id} className="border-b border-gray-50 hover:bg-amber-50/10 transition-colors">
                                    <td className="px-4 py-2.5">
                                      <div className="flex flex-col gap-0.5">
                                        <span className="font-mono text-xs font-bold text-gray-900">{order.orderNumber}</span>
                                        <span className="text-[10px] text-gray-400">{formatDate(order.date)}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-gray-700">{(order as { jobName?: string | null }).jobName || "—"}</td>
                                    <td className="px-4 py-2.5 text-gray-500 text-xs">{order.location || "—"}</td>
                                    <td className="px-4 py-2.5"><AgingBadge days={days} /></td>
                                    <td className="px-4 py-2.5 text-xs font-medium text-gray-700">
                                      {estRevenue > 0
                                        ? "₪" + Math.round(estRevenue).toLocaleString()
                                        : <span className="text-gray-300 text-[10px]">אין נתוני יומן</span>}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <input type="text" placeholder="אופציונלי"
                                        value={invoiceInputs[order.id] ?? ""}
                                        onChange={(e) => setInvoiceInputs((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                        className="w-20 px-2 py-1 rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-300"
                                        dir="ltr"
                                      />
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <input type="number" min={0} step={1}
                                        placeholder={estRevenue > 0 ? String(Math.round(estRevenue)) : "0"}
                                        value={billedAmountInputs[order.id] ?? ""}
                                        onChange={(e) => setBilledAmountInputs((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                        className="w-24 px-2 py-1 rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-300"
                                        dir="ltr"
                                      />
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <button type="button" onClick={() => handleMarkInvoiced(order)} disabled={invoicingId === order.id}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap">
                                        {invoicingId === order.id ? "שומר..." : "סמן כחויב"}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="px-5 py-2 text-xs text-gray-400">
                            {group.orders.length} הזמנות · {group.totalEstRevenue > 0 ? "סה״כ משוער: ₪" + Math.round(group.totalEstRevenue).toLocaleString() : ""}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Work Diaries Tab */}
        {activeTab === "work-diaries" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div className="bg-white rounded-xl border border-blue-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{submittedDiaries.length}</p>
                <p className="text-xs text-gray-500">יומנים שנשלחו</p>
              </div>
              <div className="bg-white rounded-xl border border-green-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{new Set(submittedDiaries.map((d) => d.customerName)).size}</p>
                <p className="text-xs text-gray-500">לקוחות ייחודיים</p>
              </div>
              <div className="bg-white rounded-xl border border-purple-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{submittedDiaries.filter((d) => d.executionDate === new Date().toISOString().split("T")[0]).length}</p>
                <p className="text-xs text-gray-500">יומנים היום</p>
              </div>
              <div className="bg-white rounded-xl border border-amber-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{diaries.filter((d) => d.status === "draft").length}</p>
                <p className="text-xs text-gray-500">טיוטות</p>
              </div>
            </div>

            {/* Diary filters */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">לקוח</label>
                  <input
                    type="text"
                    value={filterCustomer}
                    onChange={(e) => setFilterCustomer(e.target.value)}
                    placeholder="חיפוש לפי שם לקוח"
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">מתאריך</label>
                  <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} dir="ltr" className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">עד תאריך</label>
                  <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} dir="ltr" className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
                </div>
              </div>
              {(filterCustomer || filterDateFrom || filterDateTo) && (
                <div className="flex justify-end mt-3">
                  <button type="button" onClick={() => { setFilterCustomer(""); setFilterDateFrom(""); setFilterDateTo(""); }} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    נקה סינון
                  </button>
                </div>
              )}
            </div>

            {/* Diary list */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {filteredDiaries.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-gray-500 font-medium">
                    {submittedDiaries.length === 0 ? "עדיין לא נשלחו יומני עבודה" : "אין יומנים תואמים לסינון"}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">יומנים שנשלחו מ״יומן עבודה״ יופיעו כאן</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">מס׳ יומן</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">קבלן</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">אתר</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-24">תאריך</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">שעות</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">סטטוס</th>
                        <th className="px-4 py-2.5 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDiaries.map((diary) => (
                        <tr key={diary.id} className="border-b border-gray-100 hover:bg-blue-50/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900 text-xs">{diary.diaryNumber}</td>
                          <td className="px-4 py-3 text-gray-700">{diary.customerName || "—"}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{diary.siteName || "—"}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(diary.executionDate)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {diary.startTime && diary.endTime ? `${diary.startTime} — ${diary.endTime}` : diary.startTime || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${DIARY_STATUS_COLORS[diary.status]}`}>
                              {DIARY_STATUS_LABELS[diary.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDiaryPDF(diary.id)}
                                disabled={diaryExportingId === diary.id}
                                className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50 transition-colors"
                              >
                                {diaryExportingId === diary.id ? "..." : "PDF"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDiaryCSV(diary.id)}
                                disabled={diaryCsvExportingId === diary.id}
                                className="text-xs text-green-700 hover:text-green-900 underline disabled:opacity-50 transition-colors"
                              >
                                Excel
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400">
                    מוצגים {filteredDiaries.length} מתוך {submittedDiaries.length} יומנים
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Invoiced History Tab */}
        {activeTab === "invoiced" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
              <div className="bg-white rounded-xl border border-green-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-green-700">{invoicedOrders.length}</p>
                <p className="text-xs text-gray-500">הזמנות שחויבו סה״כ</p>
              </div>
              <div className="bg-white rounded-xl border border-blue-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{invoicedThisMonth}</p>
                <p className="text-xs text-gray-500">חויבו החודש</p>
              </div>
              <div className="bg-white rounded-xl border border-purple-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">
                  {invoicedOrders.filter(o => o.billedAmount).length > 0
                    ? "₪" + Math.round(invoicedOrders.reduce((s, o) => s + (o.billedAmount ?? 0), 0)).toLocaleString()
                    : "—"}
                </p>
                <p className="text-xs text-gray-500">סכום חויב כולל (עם סכום)</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {invoicedOrders.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-gray-500 font-medium">אין הזמנות שחויבו עדיין</p>
                  <p className="text-sm text-gray-400 mt-1">הזמנות שסומנו כחויב יופיעו כאן</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">הזמנה</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">לקוח</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">מס׳ חשבונית</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">סכום שחויב</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">תאריך חיוב</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">בוצע ע״י</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoicedOrders.map((order) => (
                        <tr key={order.id} className="border-b border-gray-100 hover:bg-green-50/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-xs font-bold text-gray-900">{order.orderNumber}</span>
                              <span className="text-[10px] text-gray-400">{order.location || "—"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{order.customer}</td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-700">
                            {order.invoiceNumber
                              ? <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-bold">{order.invoiceNumber}</span>
                              : <span className="text-gray-300 text-xs">לא הוזן</span>}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-green-700">
                            {order.billedAmount
                              ? "₪" + Math.round(order.billedAmount).toLocaleString()
                              : <span className="text-gray-300 text-xs">לא הוזן</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {order.invoicedAt ? formatDate(order.invoicedAt.slice(0, 10)) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{order.invoicedBy || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400">
                    {invoicedOrders.length} הזמנות חויבו
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Orders tab */}
        {activeTab === "orders" && (<>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <KpiCard label="הזמנות (בסינון)" value={filtered.length} color="border-blue-100" />
          <KpiCard label="הזמנות שהושלמו" value={kpis.completed} color="border-green-100" />
          <KpiCard label="לקוחות ייחודיים" value={kpis.uniqueCustomers} color="border-purple-100" />
          <KpiCard label="שלטים (כמות)" value={kpis.totalSigns} color="border-amber-100" />
        </div>

        {/* Filter card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">לקוח</label>
              <input
                type="text"
                value={filterCustomer}
                onChange={(e) => setFilterCustomer(e.target.value)}
                placeholder="חיפוש לפי שם לקוח"
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">מתאריך</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">עד תאריך</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">סטטוס</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setFilterCustomer("");
                setFilterDateFrom("");
                setFilterDateTo("");
                setFilterStatus("all");
              }}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              נקה סינון
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-green-400 text-green-700 text-sm font-medium hover:bg-green-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              ייצוא Excel
            </button>
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={filtered.length === 0 || exporting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              {exporting ? "מייצא..." : "ייצוא PDF"}
            </button>
          </div>
        </div>

        {/* Results table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-gray-300 mb-3">
                <svg className="w-12 h-12 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">אין הזמנות תואמות</p>
              <p className="text-sm text-gray-400 mt-1">
                {orders.length === 0 ? "עדיין לא נוצרו הזמנות במערכת" : "שנה את הסינון כדי לראות תוצאות"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">#</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">הזמנה</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">לקוח</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">מיקום</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-24">תאריך</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">סטטוס</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center w-16">שלטים</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center w-16">שונות</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order, idx) => {
                    const isExpanded = expandedRows.has(order.id);
                    return (
                      <>
                        <tr
                          key={order.id}
                          className="border-b border-gray-100 hover:bg-blue-50/20 transition-colors cursor-pointer"
                          onClick={() => toggleRow(order.id)}
                        >
                          <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-gray-900 text-xs">{order.orderNumber}</td>
                          <td className="px-4 py-3 text-gray-700">{order.customer}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{order.location || "—"}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(order.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
                              {STATUS_LABELS[order.status] || order.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700 text-sm font-medium">{countSignQty(order) || "—"}</td>
                          <td className="px-4 py-3 text-center text-gray-700 text-sm font-medium">{countMiscQty(order) || "—"}</td>
                          <td className="px-2 py-3 text-gray-400">
                            <ChevronIcon open={isExpanded} />
                          </td>
                        </tr>
                        {isExpanded && <ExpandedRow key={`${order.id}-expanded`} order={order} />}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
              <span>מוצגים {filtered.length} מתוך {orders.length} הזמנות</span>
              <span>
                סה״כ שלטים: <strong className="text-gray-600">{filtered.reduce((s, o) => s + countSignQty(o), 0)}</strong>
                {" | "}
                סה״כ שונות: <strong className="text-gray-600">{filtered.reduce((s, o) => s + countMiscQty(o), 0)}</strong>
              </span>
            </div>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
}
