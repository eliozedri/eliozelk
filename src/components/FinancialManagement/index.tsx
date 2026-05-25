"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Wallet, Search, AlertTriangle, Tag, FileWarning, Coins, Loader2, Truck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { canPerformAction } from "@/types/auth";
import { useFinancialDocuments, type FinancialDocRow } from "@/hooks/useFinancialDocuments";
import {
  DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_COLORS,
  type SupplierDocumentType, type SupplierDocumentStatus,
} from "@/types/supplierDocument";
import {
  EXPENSE_TYPE_LABELS, BUSINESS_AREA_LABELS, UPLOAD_SOURCE_LABELS,
  type ExpenseType, type BusinessArea, type UploadSource,
} from "@/types/financial";
import { FinancialDocDrawer } from "./FinancialDocDrawer";

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `₪${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}

type Toggle = "needsClassification" | "duplicateSuspected" | "needsReview" | "missingData" | "fromFleet";

export default function FinancialManagement() {
  const { profile } = useAuth();
  const canManage = !!profile && canPerformAction(profile, "review_supplier_document");
  const { documents, loading, error, refetch } = useFinancialDocuments();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<string>("all");
  const [expenseType, setExpenseType] = useState<string>("all");
  const [businessArea, setBusinessArea] = useState<string>("all");
  const [uploadSource, setUploadSource] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [toggles, setToggles] = useState<Record<Toggle, boolean>>({
    needsClassification: false, duplicateSuspected: false, needsReview: false, missingData: false, fromFleet: false,
  });
  const [openId, setOpenId] = useState<string | null>(searchParams.get("doc"));

  function toggle(t: Toggle) { setToggles(p => ({ ...p, [t]: !p[t] })); }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter(d => {
      if (q) {
        const hay = [d.supplier_name_raw, d.suppliers?.name, d.document_number, d.file_name].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (docType !== "all" && d.document_type !== docType) return false;
      if (expenseType !== "all" && d.expense_type !== expenseType) return false;
      if (businessArea !== "all" && d.business_area !== businessArea) return false;
      if (uploadSource !== "all" && (d.upload_source ?? "general_scan") !== uploadSource) return false;
      if (status !== "all" && d.status !== status) return false;
      if (toggles.needsClassification && !d.requires_classification) return false;
      if (toggles.duplicateSuspected && d.status !== "duplicate_suspected") return false;
      if (toggles.needsReview && d.status !== "needs_review") return false;
      if (toggles.missingData && d.supplier_name_raw && d.total_after_vat != null) return false;
      if (toggles.fromFleet && d.upload_source !== "fleet" && !d.equipment_id) return false;
      return true;
    });
  }, [documents, search, docType, expenseType, businessArea, uploadSource, status, toggles]);

  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = (d: FinancialDocRow) => {
      if (!d.document_date) return false;
      const dt = new Date(d.document_date);
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
    };
    return {
      total: documents.length,
      monthSum: documents.filter(thisMonth).reduce((s, d) => s + (d.total_after_vat ?? 0), 0),
      needsReview: documents.filter(d => d.status === "needs_review").length,
      needsClassification: documents.filter(d => d.requires_classification).length,
      duplicateSuspected: documents.filter(d => d.status === "duplicate_suspected").length,
      missingData: documents.filter(d => !d.supplier_name_raw || d.total_after_vat == null).length,
    };
  }, [documents]);

  const KPIS = [
    { label: 'סה"כ מסמכים', value: kpis.total, icon: <Wallet className="w-4 h-4" />, tone: "text-navy-900 bg-slate-100" },
    { label: "סכום החודש", value: money(kpis.monthSum), icon: <Coins className="w-4 h-4" />, tone: "text-green-700 bg-green-100" },
    { label: "ממתין לבדיקה", value: kpis.needsReview, icon: <FileWarning className="w-4 h-4" />, tone: "text-orange-700 bg-orange-100" },
    { label: "דורש סיווג", value: kpis.needsClassification, icon: <Tag className="w-4 h-4" />, tone: "text-amber-700 bg-amber-100" },
    { label: "חשד לכפילות", value: kpis.duplicateSuspected, icon: <AlertTriangle className="w-4 h-4" />, tone: "text-red-700 bg-red-100" },
    { label: "חסרים נתונים", value: kpis.missingData, icon: <FileWarning className="w-4 h-4" />, tone: "text-slate-600 bg-slate-100" },
  ];

  const TOGGLE_DEFS: { key: Toggle; label: string }[] = [
    { key: "duplicateSuspected", label: "חשד לכפילות" },
    { key: "needsClassification", label: "דורש סיווג" },
    { key: "needsReview", label: "ממתין לבדיקה" },
    { key: "missingData", label: "חסרים נתונים" },
    { key: "fromFleet", label: "מצי רכב ומכונות" },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-surface p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className="w-10 h-10 rounded-xl bg-navy-900 text-white flex items-center justify-center"><Wallet className="w-5 h-5" /></span>
        <div>
          <h1 className="text-xl font-black text-navy-900 leading-tight">הנהלת כספים</h1>
          <p className="text-xs text-slate-500">מרכז כל המסמכים הכספיים — חשבוניות, קבלות, תעודות משלוח ומסמכי ספקים</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPIS.map((k, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${k.tone}`}>{k.icon}</span>
            <div className="min-w-0"><div className="text-lg font-bold text-navy-900 leading-none truncate">{k.value}</div><div className="text-[11px] text-slate-500 truncate mt-1">{k.label}</div></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש: ספק, מספר מסמך, קובץ" className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <select value={docType} onChange={e => setDocType(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="all">כל סוגי המסמכים</option>
            {(Object.keys(DOCUMENT_TYPE_LABELS) as SupplierDocumentType[]).map(t => <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>)}
          </select>
          <select value={expenseType} onChange={e => setExpenseType(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="all">כל סוגי ההוצאה</option>
            {(Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[]).map(t => <option key={t} value={t}>{EXPENSE_TYPE_LABELS[t]}</option>)}
          </select>
          <select value={businessArea} onChange={e => setBusinessArea(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="all">כל התחומים</option>
            {(Object.keys(BUSINESS_AREA_LABELS) as BusinessArea[]).map(a => <option key={a} value={a}>{BUSINESS_AREA_LABELS[a]}</option>)}
          </select>
          <select value={uploadSource} onChange={e => setUploadSource(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="all">כל המקורות</option>
            {(Object.keys(UPLOAD_SOURCE_LABELS) as UploadSource[]).map(s => <option key={s} value={s}>{UPLOAD_SOURCE_LABELS[s]}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="all">כל הסטטוסים</option>
            {(Object.keys(DOCUMENT_STATUS_LABELS) as SupplierDocumentStatus[]).map(s => <option key={s} value={s}>{DOCUMENT_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {TOGGLE_DEFS.map(t => (
            <button key={t.key} onClick={() => toggle(t.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${toggles[t.key] ? "bg-ek-blue text-white border-ek-blue" : "bg-white text-slate-600 border-slate-200 hover:border-ek-blue/50"}`}>{t.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16 text-slate-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400"><Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">{documents.length === 0 ? "אין מסמכים כספיים" : "אין תוצאות לסינון"}</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm text-right min-w-[820px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="px-3 py-2 font-semibold">ספק</th>
                <th className="px-3 py-2 font-semibold">מספר</th>
                <th className="px-3 py-2 font-semibold">סוג</th>
                <th className="px-3 py-2 font-semibold">תאריך</th>
                <th className="px-3 py-2 font-semibold">סה"כ</th>
                <th className="px-3 py-2 font-semibold">סיווג</th>
                <th className="px-3 py-2 font-semibold">מקור</th>
                <th className="px-3 py-2 font-semibold">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} onClick={() => setOpenId(d.id)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer">
                  <td className="px-3 py-2 font-medium text-navy-900">{d.suppliers?.name || d.supplier_name_raw || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{d.document_number || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{DOCUMENT_TYPE_LABELS[d.document_type as SupplierDocumentType] ?? d.document_type}</td>
                  <td className="px-3 py-2 text-slate-500">{d.document_date ? new Date(d.document_date).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="px-3 py-2 text-navy-900 font-semibold">{money(d.total_after_vat)}</td>
                  <td className="px-3 py-2">
                    {d.requires_classification
                      ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">דורש סיווג</span>
                      : <span className="text-slate-500 text-xs">{d.expense_type ? EXPENSE_TYPE_LABELS[d.expense_type as ExpenseType] : "—"}</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">
                    <span className="flex items-center gap-1">{d.equipment_id && <Truck className="w-3 h-3 text-ek-blue" />}{UPLOAD_SOURCE_LABELS[(d.upload_source as UploadSource)] ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${DOCUMENT_STATUS_COLORS[d.status as SupplierDocumentStatus]}`}>{DOCUMENT_STATUS_LABELS[d.status as SupplierDocumentStatus] ?? d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <FinancialDocDrawer documentId={openId} canManage={canManage} onClose={() => setOpenId(null)} onChanged={refetch} />
      )}
    </div>
  );
}
