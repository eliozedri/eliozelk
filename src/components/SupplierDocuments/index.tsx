"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "@/lib/supabase/client";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_COLORS,
} from "@/types/supplierDocument";
import type { SupplierDocumentStatus, SupplierDocumentType } from "@/types/supplierDocument";
import { UploadOrManualModal } from "./UploadOrManualModal";
import { DocumentReview } from "./DocumentReview";

async function getToken(): Promise<string> {
  const db = getSupabase();
  if (!db) return "";
  const { data: { session } } = await db.auth.getSession();
  return session?.access_token ?? "";
}

interface DocRow {
  id: string;
  status: SupplierDocumentStatus;
  document_type: SupplierDocumentType;
  supplier_id: string | null;
  supplier_name_raw: string;
  document_number: string;
  document_date: string | null;
  total_after_vat: number | null;
  currency: string;
  file_name: string;
  created_at: string;
  suppliers: { id: string; name: string } | null;
}

interface Supplier { id: string; name: string; vat_number: string; }

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "כל הסטטוסים" },
  { value: "draft_ready", label: "טיוטה מוכנה" },
  { value: "needs_review", label: "ממתין לבדיקה" },
  { value: "duplicate_suspected", label: "חשד לכפילות" },
  { value: "approved", label: "אושר" },
  { value: "posted", label: "נרשם" },
  { value: "rejected", label: "נדחה" },
];

export function SupplierDocumentsModule() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [reviewDocId, setReviewDocId] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/supplier-documents?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDocs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadSuppliers = useCallback(async () => {
    const { getSupabase } = await import("@/lib/supabase/client");
    const db = getSupabase();
    if (!db) return;
    const { data } = await db
      .from("suppliers")
      .select("id,name,vat_number")
      .eq("is_active", true)
      .order("name");
    setSuppliers((data ?? []) as Supplier[]);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadDocs(); loadSuppliers(); }, [loadDocs, loadSuppliers]);

  // Stats
  const pending = docs.filter(d => ["draft_ready", "needs_review"].includes(d.status)).length;
  const duplicates = docs.filter(d => d.status === "duplicate_suspected").length;
  const postedThisMonth = docs.filter(d => {
    if (d.status !== "posted") return false;
    const m = new Date(); m.setDate(1); m.setHours(0, 0, 0, 0);
    return new Date(d.created_at) >= m;
  }).length;

  function handleCreated(id: string) {
    setShowModal(false);
    setReviewDocId(id);
    loadDocs();
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">מנוע קליטת מסמכי ספקים</h1>
            <p className="text-sm text-gray-500 mt-0.5">חשבוניות · תעודות משלוח · הוצאות · מלאי</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            הוסף מסמך
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="px-6 py-4 grid grid-cols-3 gap-4">
        <KpiCard label="ממתין לבדיקה" value={pending} color="amber" />
        <KpiCard label="חשד לכפילות" value={duplicates} color="red" />
        <KpiCard label="נרשם החודש" value={postedThisMonth} color="teal" />
      </div>

      {/* Filter bar */}
      <div className="px-6 pb-3 flex gap-2 flex-wrap">
        {STATUS_FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              statusFilter === opt.value
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div className="px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-7 h-7 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">אין מסמכים</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 text-sm text-teal-600 hover:underline font-medium"
            >
              הוסף מסמך ראשון
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-right px-4 py-3 font-medium text-gray-500">סטטוס</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">סוג</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">ספק</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">מסמך</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">תאריך</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">סכום</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map(doc => (
                  <tr
                    key={doc.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setReviewDocId(doc.id)}
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${DOCUMENT_STATUS_COLORS[doc.status]}`}>
                        {DOCUMENT_STATUS_LABELS[doc.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {DOCUMENT_TYPE_LABELS[doc.document_type]}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {doc.suppliers?.name || doc.supplier_name_raw || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {doc.document_number || doc.file_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {doc.document_date
                        ? new Date(doc.document_date).toLocaleDateString("he-IL")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                      {doc.total_after_vat != null
                        ? `${doc.currency === "ILS" ? "₪" : doc.currency}${doc.total_after_vat.toLocaleString("he-IL", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <button
                        className="text-xs text-teal-600 hover:text-teal-800 font-medium"
                        onClick={e => { e.stopPropagation(); setReviewDocId(doc.id); }}
                      >
                        פתח
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <UploadOrManualModal
          suppliers={suppliers}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {reviewDocId && (
        <DocumentReview
          documentId={reviewDocId}
          onClose={() => { setReviewDocId(null); loadDocs(); }}
          onPosted={() => { setReviewDocId(null); loadDocs(); }}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red:   "bg-red-50 border-red-200 text-red-700",
    teal:  "bg-teal-50 border-teal-200 text-teal-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? "bg-gray-50 border-gray-200 text-gray-700"}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-0.5">{label}</p>
    </div>
  );
}
