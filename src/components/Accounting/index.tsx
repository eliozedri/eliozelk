"use client";

import { useState, useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import type { WorkOrder } from "@/types/workOrder";
import { STATUS_LABELS, ACCOUNTING_STATUS_LABELS, ACCOUNTING_STATUS_COLORS } from "@/types/workOrder";
import { exportAccountingCSV, exportAccountingExcel, exportAccountingPDF, exportCustomerBillingCSV, exportCustomerBillingPDF, exportCustomerBillingExcel } from "@/lib/accountingExport";
import type { AccountingReportData } from "@/components/pdf/AccountingDocument";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { DIARY_STATUS_LABELS, DIARY_STATUS_COLORS } from "@/types/workDiary";
import { exportWorkDiaryPDF, exportWorkDiaryCSV } from "@/lib/workDiaryExport";
import { useAuth } from "@/context/AuthContext";
import { useOperationalKPIs } from "@/hooks/useOperationalKPIs";

// ─── Cancel Order Modal ───────────────────────────────────────────────────────

function CancelOrderModal({
  order,
  onConfirm,
  onClose,
}: {
  order: WorkOrder;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleConfirm() {
    setSaveState("saving");
    setErrorMsg("");
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setSaveState("error");
      setErrorMsg(e instanceof Error ? e.message : "שגיאה לא ידועה");
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={saveState === "saving" ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" dir="rtl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <p className="font-bold text-gray-900">ביטול הזמנה</p>
              <p className="text-xs text-gray-500 mt-0.5">{order.orderNumber} · {order.customer}</p>
            </div>
          </div>
          <div className="text-sm text-gray-600 mb-5 space-y-1.5">
            <p>פעולה זו תבצע את הפעולות הבאות:</p>
            <ul className="space-y-1 text-xs text-gray-500 pr-2">
              <li>• ההזמנה תוסר מרשימת <strong className="text-gray-700">ממתין לחיוב</strong></li>
              <li>• ההזמנה לא תופיע בסיכומי חיוב ובייצוא נתוני חיוב</li>
              <li>• הסטטוס יעודכן ל<strong className="text-gray-700">בוטל</strong></li>
              <li className="text-green-700">• ההזמנה <strong>אינה נמחקת</strong> מהמערכת — ניתן לצפות בה ב<strong>ארכיון חשבוניות</strong></li>
            </ul>
          </div>
          {saveState === "error" && (
            <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              שגיאה: {errorMsg}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={saveState === "saving"}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white transition-colors"
            >
              {saveState === "saving" ? "מבטל..." : saveState === "error" ? "נסה שוב" : "אשר ביטול"}
            </button>
            <button
              onClick={onClose}
              disabled={saveState === "saving"}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              חזור
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Accounting Order Edit Panel ──────────────────────────────────────────────

function AccountingOrderEditPanel({
  order,
  onClose,
  onSave,
}: {
  order: WorkOrder;
  onClose: () => void;
  onSave: (id: string, fields: Partial<WorkOrder>) => Promise<void>;
}) {
  const [jobName, setJobName] = useState(order.jobName ?? "");
  const [location, setLocation] = useState(order.location ?? "");
  const [billedAmount, setBilledAmount] = useState(order.billedAmount != null ? String(order.billedAmount) : "");
  const [invoiceNumber, setInvoiceNumber] = useState(order.invoiceNumber ?? "");
  const [notes, setNotes] = useState(order.generalNotes ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSave() {
    setSaveState("saving");
    setErrorMsg("");
    const fields: Partial<WorkOrder> = {
      jobName: jobName.trim() || null,
      location: location.trim() || undefined,
      invoiceNumber: invoiceNumber.trim() || null,
      generalNotes: notes.trim(),
    };
    const parsed = parseFloat(billedAmount);
    if (!isNaN(parsed) && billedAmount.trim() !== "") {
      fields.billedAmount = parsed;
    } else if (billedAmount.trim() === "") {
      fields.billedAmount = null;
    }
    try {
      await onSave(order.id, fields);
      setSaveState("saved");
      setTimeout(() => onClose(), 1200);
    } catch (e) {
      setSaveState("error");
      setErrorMsg(e instanceof Error ? e.message : "שגיאה לא ידועה");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={saveState === "saving" ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 z-10 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">עריכת פרטי הזמנה</h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{order.orderNumber} · {order.customer}</p>
          </div>
          <button onClick={onClose} disabled={saveState === "saving"} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors disabled:opacity-40">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">שם עבודה</label>
            <input value={jobName} onChange={e => setJobName(e.target.value)}
              placeholder="שם העבודה / פרויקט"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" dir="rtl" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              מיקום
              {!order.location && <span className="mr-2 text-amber-600 font-normal">(חסר)</span>}
            </label>
            <input value={location} onChange={e => setLocation(e.target.value)}
              placeholder="עיר / כתובת / אתר"
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${!order.location ? "border-amber-300 bg-amber-50" : "border-gray-300"}`}
              dir="rtl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">סכום לחיוב ₪</label>
              <input type="number" min={0} step={1} value={billedAmount} onChange={e => setBilledAmount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">מספר חשבונית</label>
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="אופציונלי"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" dir="ltr" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">הערות חיוב</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="הערות פנימיות לחיוב..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" dir="rtl" />
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {saveState === "error" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <svg className="w-4 h-4 text-red-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="text-xs text-red-700 font-medium">שגיאה בשמירה{errorMsg ? `: ${errorMsg}` : ""} — נסה שוב</p>
            </div>
          )}
          {saveState === "saved" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
              <svg className="w-4 h-4 text-green-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <p className="text-xs text-green-700 font-medium">✓ נשמר בהצלחה — סוגר...</p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saveState === "saving" || saveState === "saved"}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveState === "saving" ? "שומר..." : "שמור שינויים"}
            </button>
            <button
              onClick={onClose}
              disabled={saveState === "saving"}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const { diaries, cancelDiary } = useWorkDiaryContext();
  const { profile } = useAuth();
  const { billingLeakage, byOrder } = useOperationalKPIs();

  const [activeTab, setActiveTab] = useState<"orders" | "work-diaries" | "billing" | "invoiced" | "archive" | "diary-archive">("orders");
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
  const [billingPdfExporting, setBillingPdfExporting] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState<WorkOrder | null>(null);
  const [cancelingDiaryId, setCancelingDiaryId] = useState<string | null>(null);

  // Map orderId → diary revenue for billing queue enrichment
  const orderRevenueMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of byOrder) m.set(o.orderId, o.totalRevenue);
    return m;
  }, [byOrder]);

  // Cancelled orders archive
  const cancelledOrders = useMemo(
    () => orders
      .filter(o => o.status === "cancelled")
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime()),
    [orders]
  );

  const cancelledThisMonth = useMemo(() => {
    const now = new Date();
    return cancelledOrders.filter(o => {
      const d = new Date(o.updatedAt ?? o.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [cancelledOrders]);

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

  const cancelledDiaries = useMemo(
    () => diaries
      .filter(d => d.status === "cancelled")
      .sort((a, b) => new Date(b.cancelledAt ?? b.updatedAt).getTime() - new Date(a.cancelledAt ?? a.updatedAt).getTime()),
    [diaries]
  );

  const cancelledDiariesThisMonth = useMemo(() => {
    const now = new Date();
    return cancelledDiaries.filter(d => {
      const dt = new Date(d.cancelledAt ?? d.updatedAt);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    }).length;
  }, [cancelledDiaries]);

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

  async function handleBillingPDF(customerName: string, groupOrders: WorkOrder[]) {
    setBillingPdfExporting(customerName);
    try {
      await exportCustomerBillingPDF({
        customerName,
        orders: groupOrders,
        dateFrom: billingDateFrom || undefined,
        dateTo: billingDateTo || undefined,
        generatedAt: new Date().toISOString(),
      });
    } finally {
      setBillingPdfExporting(null);
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
      if (o.status === "cancelled") return false;
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

  const [exportingExcel, setExportingExcel] = useState(false);
  async function handleExportExcel() {
    setExportingExcel(true);
    try { await exportAccountingExcel(buildReportData()); } finally { setExportingExcel(false); }
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
          <button
            type="button"
            onClick={() => setActiveTab("archive")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "archive"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            ארכיון חשבוניות
            {cancelledOrders.length > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-xs font-bold ${activeTab === "archive" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                {cancelledOrders.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("diary-archive")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "diary-archive"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            ארכיון יומנים
            {cancelledDiaries.length > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-xs font-bold ${activeTab === "diary-archive" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                {cancelledDiaries.length}
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
                            onClick={(e) => { e.stopPropagation(); handleBillingPDF(group.customerName, group.orders); }}
                            disabled={billingPdfExporting === group.customerName}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors whitespace-nowrap disabled:opacity-50"
                          >
                            {billingPdfExporting === group.customerName ? "..." : "PDF"}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); exportCustomerBillingExcel(group.customerName, group.orders); }}
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
                                <th className="px-4 py-2 w-28"></th>
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
                                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                                      {order.location ? order.location : (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">מיקום חסר</span>
                                      )}
                                    </td>
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
                                      <div className="flex items-center gap-1.5">
                                        <button type="button" onClick={() => handleMarkInvoiced(order)} disabled={invoicingId === order.id}
                                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap">
                                          {invoicingId === order.id ? "שומר..." : "סמן כחויב"}
                                        </button>
                                        <button type="button"
                                          onClick={() => setEditingOrder(order)}
                                          className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                          title="עריכת פרטים">
                                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                        <button type="button"
                                          onClick={() => setCancelingOrder(order)}
                                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors whitespace-nowrap">
                                          <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                          הסר מחיוב
                                        </button>
                                      </div>
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
                                CSV
                              </button>
                              <button
                                type="button"
                                onClick={() => setCancelingDiaryId(diary.id)}
                                className="text-xs text-red-500 hover:text-red-700 transition-colors"
                                title="בטל יומן"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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

        {/* Archive Tab */}
        {activeTab === "archive" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
              <div className="bg-white rounded-xl border border-red-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-red-600">{cancelledOrders.length}</p>
                <p className="text-xs text-gray-500">הזמנות שבוטלו סה״כ</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{new Set(cancelledOrders.map(o => o.customer)).size}</p>
                <p className="text-xs text-gray-500">לקוחות</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{cancelledThisMonth}</p>
                <p className="text-xs text-gray-500">בוטלו החודש</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {cancelledOrders.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-gray-200 mb-3">
                    <svg className="w-10 h-10 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                    </svg>
                  </div>
                  <p className="text-gray-500 font-medium">אין הזמנות מבוטלות</p>
                  <p className="text-sm text-gray-400 mt-1">הזמנות שבוטלו יישמרו כאן לצפייה בלבד</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="px-5 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <p className="text-xs text-red-600">ארכיון בלבד — הזמנות אלו אינן נכללות בחישובים, בדוחות ובחיובים</p>
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">#</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">הזמנה</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">לקוח</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">מיקום</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">תאריך הזמנה</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">תאריך ביטול</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center w-16">שלטים</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center w-16">שונות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cancelledOrders.map((order, idx) => {
                        const isExpanded = expandedRows.has(order.id);
                        return (
                          <>
                            <tr
                              key={order.id}
                              className="border-b border-gray-100 hover:bg-red-50/20 transition-colors cursor-pointer"
                              onClick={() => toggleRow(order.id)}
                            >
                              <td className="px-4 py-3 text-gray-300 text-xs">{idx + 1}</td>
                              <td className="px-4 py-3 font-mono text-xs font-bold text-gray-400 line-through">{order.orderNumber}</td>
                              <td className="px-4 py-3 text-gray-500">{order.customer}</td>
                              <td className="px-4 py-3 text-gray-400 text-xs">{order.location || "—"}</td>
                              <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(order.date)}</td>
                              <td className="px-4 py-3 text-gray-400 text-xs">{formatDate((order.updatedAt ?? order.createdAt).slice(0, 10))}</td>
                              <td className="px-4 py-3 text-center text-gray-400 text-sm">{countSignQty(order) || "—"}</td>
                              <td className="px-4 py-3 text-center text-gray-400 text-sm">{countMiscQty(order) || "—"}</td>
                            </tr>
                            {isExpanded && <ExpandedRow key={`${order.id}-expanded`} order={order} />}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400">
                    {cancelledOrders.length} הזמנות בארכיון
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Diary Archive Tab */}
        {activeTab === "diary-archive" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
              <div className="bg-white rounded-xl border border-red-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-red-600">{cancelledDiaries.length}</p>
                <p className="text-xs text-gray-500">יומנים שבוטלו סה״כ</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{new Set(cancelledDiaries.map(d => d.customerName).filter(Boolean)).size}</p>
                <p className="text-xs text-gray-500">לקוחות</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{cancelledDiariesThisMonth}</p>
                <p className="text-xs text-gray-500">בוטלו החודש</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {cancelledDiaries.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-gray-200 mb-3">
                    <svg className="w-10 h-10 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                  </div>
                  <p className="text-gray-500 font-medium">אין יומנים מבוטלים</p>
                  <p className="text-sm text-gray-400 mt-1">יומנים שבוטלו יישמרו כאן לצפייה בלבד</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="px-5 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <p className="text-xs text-red-600">ארכיון בלבד — יומנים אלו אינם נכללים בחישובים ובדוחות</p>
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">#</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">מס׳ יומן</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">קבלן</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">אתר</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">תאריך ביצוע</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">תאריך ביטול</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">סטטוס לפני ביטול</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cancelledDiaries.map((diary, idx) => (
                        <tr key={diary.id} className="border-b border-gray-100 hover:bg-red-50/20 transition-colors">
                          <td className="px-4 py-3 text-gray-300 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-gray-400 line-through">{diary.diaryNumber}</td>
                          <td className="px-4 py-3 text-gray-500">{diary.customerName || "—"}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{diary.siteName || "—"}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(diary.executionDate)}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{diary.cancelledAt ? formatDate(diary.cancelledAt.slice(0, 10)) : "—"}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">בוטל</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400">
                    {cancelledDiaries.length} יומנים בארכיון
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
              ייצוא CSV
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filtered.length === 0 || exportingExcel}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-green-400 text-green-700 text-sm font-medium hover:bg-green-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              {exportingExcel ? "מייצא..." : "ייצוא Excel"}
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
                    <th className="w-16"></th>
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
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {order.location ? order.location : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">מיקום חסר</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(order.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
                              {STATUS_LABELS[order.status] || order.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700 text-sm font-medium">{countSignQty(order) || "—"}</td>
                          <td className="px-4 py-3 text-center text-gray-700 text-sm font-medium">{countMiscQty(order) || "—"}</td>
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }}
                                className="p-1 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="עריכת פרטים"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setCancelingOrder(order); }}
                                className="p-1 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="ביטול / הסרת הזמנה"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                              </button>
                              <ChevronIcon open={isExpanded} />
                            </div>
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
              <span>מוצגים {filtered.length} מתוך {orders.length - cancelledOrders.length} הזמנות</span>
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

      {/* Accounting Order Edit Panel */}
      {editingOrder && (
        <AccountingOrderEditPanel
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSave={updateOrderFields}
        />
      )}

      {/* Cancel Order Modal */}
      {cancelingOrder && (
        <CancelOrderModal
          order={cancelingOrder}
          onConfirm={() => updateOrderFields(cancelingOrder.id, { status: "cancelled" })}
          onClose={() => setCancelingOrder(null)}
        />
      )}

      {/* Cancel Diary Modal */}
      {cancelingDiaryId && (() => {
        const diary = diaries.find(d => d.id === cancelingDiaryId);
        if (!diary) return null;
        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={() => setCancelingDiaryId(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" dir="rtl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">ביטול יומן עבודה</p>
                    <p className="text-xs text-gray-500 mt-0.5">{diary.diaryNumber} · {diary.customerName || "ללא לקוח"}</p>
                  </div>
                </div>
                <div className="text-sm text-gray-600 mb-5 space-y-1.5">
                  <p>פעולה זו תבצע את הפעולות הבאות:</p>
                  <ul className="space-y-1 text-xs text-gray-500 pr-2">
                    <li>• היומן יוסר מרשימת <strong className="text-gray-700">יומני עבודה</strong></li>
                    <li>• היומן לא יכלל בחישובים ובדוחות</li>
                    <li className="text-green-700">• היומן <strong>אינו נמחק</strong> — ניתן לצפות בו ב<strong>ארכיון יומנים</strong></li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { cancelDiary(cancelingDiaryId); setCancelingDiaryId(null); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white transition-colors"
                  >
                    אשר ביטול
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelingDiaryId(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    חזרה
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
