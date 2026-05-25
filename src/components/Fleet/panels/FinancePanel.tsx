"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Coins, ExternalLink, AlertTriangle } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/clientApi";
import {
  DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_COLORS,
  type SupplierDocumentType, type SupplierDocumentStatus, type UserDocumentCard,
} from "@/types/supplierDocument";
import { EXPENSE_TYPE_LABELS, EXPENSE_TYPE_ORDER, type ExpenseType } from "@/types/financial";

interface DocRow {
  id: string; status: string; document_type: string; supplier_name_raw: string;
  document_number: string; total_after_vat: number | null; expense_type: string | null;
  requires_classification: boolean; created_at: string;
}

const CARD_OPTIONS: { card: UserDocumentCard; label: string }[] = [
  { card: "invoice", label: "חשבונית" },
  { card: "delivery_note", label: "תעודת משלוח" },
  { card: "receipt", label: "קבלה" },
  { card: "other", label: "אחר" },
];

export function FinancePanel({ equipmentId, canManage }: { equipmentId: string; canManage: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<UserDocumentCard>("invoice");
  const [expenseType, setExpenseType] = useState<ExpenseType | "">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const db = getSupabase();
    if (!db) { setLoading(false); return; }
    const { data } = await db
      .from("supplier_documents")
      .select("id,status,document_type,supplier_name_raw,document_number,total_after_vat,expense_type,requires_classification,created_at")
      .eq("equipment_id", equipmentId)
      .not("status", "in", '("archived")')
      .order("created_at", { ascending: false });
    setDocs((data ?? []) as DocRow[]);
    setLoading(false);
  }, [equipmentId]);
  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("equipmentId", equipmentId);
      fd.append("uploadSource", "fleet");
      fd.append("businessArea", "fleet");
      fd.append("selectedDocumentType", card);
      if (expenseType) fd.append("expenseType", expenseType);
      const res = await authedFetch("/api/supplier-documents/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (res.status === 409) {
        setErr(`קובץ זהה כבר קיים במערכת (מסמך ${j.existingDocNumber || j.existingDocumentId}). לא נוצרה כפילות.`);
      } else if (!res.ok) {
        throw new Error(j.error ?? "העלאה נכשלה");
      } else {
        setMsg("המסמך נשמר ושויך לכלי. אם זוהה חשד לכפילות — הוא יסומן בהנהלת כספים.");
        await load();
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "העלאה נכשלה"); }
    finally { setBusy(false); }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-navy-900 flex items-center gap-2"><Coins className="w-4 h-4" /> מסמכים כספיים</h4>
      </div>
      <p className="text-[11px] text-slate-400 -mt-1">חשבוניות / תעודות משלוח / קבלות מקושרות לכלי. כל מסמך נשמר במרכז הכספי ומופיע גם בהנהלת כספים. בדיקת כפילויות רצה אוטומטית מול כל המערכת.</p>

      {canManage && (
        <div className="bg-slate-50 rounded-lg p-3 flex flex-col sm:flex-row sm:items-end gap-2 text-sm">
          <label className="flex flex-col gap-1 flex-1"><span className="text-xs text-slate-500">סוג מסמך</span>
            <select value={card} onChange={e => setCard(e.target.value as UserDocumentCard)} className="border border-slate-200 rounded px-2 py-1.5 bg-white">
              {CARD_OPTIONS.map(o => <option key={o.card} value={o.card}>{o.label}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 flex-1"><span className="text-xs text-slate-500">סוג הוצאה (אופציונלי)</span>
            <select value={expenseType} onChange={e => setExpenseType(e.target.value as ExpenseType)} className="border border-slate-200 rounded px-2 py-1.5 bg-white">
              <option value="">— יזוהה / יסווג בהמשך —</option>
              {EXPENSE_TYPE_ORDER.map(t => <option key={t} value={t}>{EXPENSE_TYPE_LABELS[t]}</option>)}
            </select></label>
          <button onClick={() => inputRef.current?.click()} disabled={busy} className="px-3 py-1.5 text-sm bg-ek-blue text-white rounded-lg flex items-center gap-1 justify-center">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} סרוק / הוסף מסמך כספי
          </button>
          <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </div>
      )}

      {msg && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">{msg}</p>}
      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {err}</p>}

      {loading ? (
        <div className="flex justify-center py-6 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">אין מסמכים כספיים לכלי זה</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map(d => (
            <li key={d.id} className="bg-white border border-slate-200 rounded-lg p-3 text-sm flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-navy-900 truncate">{d.supplier_name_raw || "ספק לא ידוע"} · {DOCUMENT_TYPE_LABELS[d.document_type as SupplierDocumentType] ?? d.document_type}</div>
                <div className="text-xs text-slate-400 flex flex-wrap gap-x-3 mt-0.5">
                  {d.document_number && <span>מס' {d.document_number}</span>}
                  {d.total_after_vat != null && <span>₪{d.total_after_vat.toLocaleString("he-IL")}</span>}
                  {d.requires_classification ? <span className="text-amber-600 font-semibold">דורש סיווג</span> : d.expense_type && <span>{EXPENSE_TYPE_LABELS[d.expense_type as ExpenseType]}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${DOCUMENT_STATUS_COLORS[d.status as SupplierDocumentStatus]}`}>{DOCUMENT_STATUS_LABELS[d.status as SupplierDocumentStatus] ?? d.status}</span>
                <button onClick={() => router.push(`/financial-management?doc=${encodeURIComponent(d.id)}`)} className="text-ek-blue hover:text-ek-blue/70" title="פתח בהנהלת כספים"><ExternalLink className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
