"use client";

import { useState, useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import type { WorkOrder } from "@/types/workOrder";
import { STATUS_LABELS, ACCOUNTING_STATUS_LABELS, ACCOUNTING_STATUS_COLORS } from "@/types/workOrder";
import { exportAccountingCSV, exportAccountingPDF } from "@/lib/accountingExport";
import type { AccountingReportData } from "@/components/pdf/AccountingDocument";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { DIARY_STATUS_LABELS, DIARY_STATUS_COLORS } from "@/types/workDiary";
import { exportWorkDiaryPDF } from "@/lib/workDiaryExport";
import { useAuth } from "@/context/AuthContext";

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

export function AccountingPage() {
  const { orders, updateOrderFields } = useOrdersContext();
  const { diaries } = useWorkDiaryContext();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<"orders" | "work-diaries" | "billing">("orders");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [diaryExportingId, setDiaryExportingId] = useState<string | null>(null);
  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  const [invoiceInputs, setInvoiceInputs] = useState<Record<string, string>>({});

  const pendingBilling = useMemo(
    () => orders.filter(
      (o) => o.status === "completed" &&
             (!o.accountingStatus || o.accountingStatus === "pending") &&
             !o.invoicedAt
    ),
    [orders]
  );

  function handleMarkInvoiced(order: WorkOrder) {
    setInvoicingId(order.id);
    const invoiceNumber = invoiceInputs[order.id]?.trim() || null;
    updateOrderFields(order.id, {
      accountingStatus: "invoiced",
      invoicedAt: new Date().toISOString(),
      invoicedBy: profile?.id ?? null,
      invoiceNumber,
    });
    setInvoiceInputs((prev) => { const next = { ...prev }; delete next[order.id]; return next; });
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
        </div>

        {/* Pending Billing Tab */}
        {activeTab === "billing" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
              <div className="bg-white rounded-xl border border-amber-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{pendingBilling.length}</p>
                <p className="text-xs text-gray-500">הזמנות ממתינות לחיוב</p>
              </div>
              <div className="bg-white rounded-xl border border-green-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{new Set(pendingBilling.map((o) => o.customer)).size}</p>
                <p className="text-xs text-gray-500">לקוחות ייחודיים</p>
              </div>
              <div className="bg-white rounded-xl border border-blue-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{orders.filter((o) => o.accountingStatus === "invoiced").length}</p>
                <p className="text-xs text-gray-500">הזמנות שחויבו</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {pendingBilling.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-gray-500 font-medium">אין הזמנות הממתינות לחיוב</p>
                  <p className="text-sm text-gray-400 mt-1">הזמנות שהושלמו ועדיין לא חויבו יופיעו כאן</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">הזמנה</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">לקוח</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">מיקום</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-24">תאריך</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center w-16">שלטים</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">מס׳ חשבונית</th>
                        <th className="px-4 py-2.5 w-32"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBilling.map((order) => (
                        <tr key={order.id} className="border-b border-gray-100 hover:bg-amber-50/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900 text-xs">{order.orderNumber}</td>
                          <td className="px-4 py-3 text-gray-700">{order.customer}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{order.location || "—"}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(order.date)}</td>
                          <td className="px-4 py-3 text-center text-gray-700 text-sm font-medium">{countSignQty(order) || "—"}</td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              placeholder="אופציונלי"
                              value={invoiceInputs[order.id] ?? ""}
                              onChange={(e) => setInvoiceInputs((prev) => ({ ...prev, [order.id]: e.target.value }))}
                              className="w-28 px-2 py-1 rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-300"
                              dir="ltr"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => handleMarkInvoiced(order)}
                              disabled={invoicingId === order.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {invoicingId === order.id ? "שומר..." : "סמן כחויב"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400">
                    {pendingBilling.length} הזמנות ממתינות לחיוב
                  </div>
                </div>
              )}
            </div>
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
                            <button
                              type="button"
                              onClick={() => handleDiaryPDF(diary.id)}
                              disabled={diaryExportingId === diary.id}
                              className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50 transition-colors"
                            >
                              {diaryExportingId === diary.id ? "מייצא..." : "PDF"}
                            </button>
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
