"use client";

import { useRef, useState } from "react";
import { Plus, Trash2, Loader2, FileText, ExternalLink } from "lucide-react";
import { OPERATIONAL_DOC_TYPE_LABELS, type OperationalDocType } from "@/types/equipment";
import { fleetFetch } from "../fleetApi";

interface DocEntry {
  type: string;
  label: string;
  url: string;
  storage_path: string;
  expiry_date?: string;
  uploaded_at?: string;
}

const DOC_TYPES = Object.keys(OPERATIONAL_DOC_TYPE_LABELS) as OperationalDocType[];

export function DocumentsPanel({
  equipmentId, documents, canManage, onChange,
}: {
  equipmentId: string;
  documents: DocEntry[];
  canManage: boolean;
  onChange: (docs: DocEntry[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<OperationalDocType>("license");
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", docType);
      if (label.trim()) fd.append("label", label.trim());
      if (expiry) fd.append("expiry_date", expiry);
      const res = await fleetFetch(`/api/equipment/${equipmentId}/document`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "העלאה נכשלה");
      onChange(j.documents as DocEntry[]);
      setLabel(""); setExpiry("");
    } catch (e) { setErr(e instanceof Error ? e.message : "העלאה נכשלה"); }
    finally { setBusy(false); }
  }

  async function remove(storage_path: string) {
    setBusy(true); setErr(null);
    try {
      const res = await fleetFetch(`/api/equipment/${equipmentId}/document`, {
        method: "DELETE", body: JSON.stringify({ storage_path }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "מחיקה נכשלה");
      onChange(j.documents as DocEntry[]);
    } catch (e) { setErr(e instanceof Error ? e.message : "מחיקה נכשלה"); }
    finally { setBusy(false); }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-navy-900 flex items-center gap-2"><FileText className="w-4 h-4" /> מסמכים תפעוליים</h4>
      </div>
      <p className="text-[11px] text-slate-400 -mt-1">רישיון, טסט, ביטוח, ספר מכונה ומסמכים תפעוליים. מסמכים כספיים (חשבוניות/תעודות משלוח) יתווספו בשלב 2.</p>

      {canManage && (
        <div className="bg-slate-50 rounded-lg p-3 flex flex-col sm:flex-row sm:items-end gap-2 text-sm">
          <label className="flex flex-col gap-1 flex-1"><span className="text-xs text-slate-500">סוג מסמך</span>
            <select value={docType} onChange={e => setDocType(e.target.value as OperationalDocType)} className="border border-slate-200 rounded px-2 py-1.5 bg-white">
              {DOC_TYPES.map(t => <option key={t} value={t}>{OPERATIONAL_DOC_TYPE_LABELS[t]}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 flex-1"><span className="text-xs text-slate-500">תיאור (אופציונלי)</span>
            <input value={label} onChange={e => setLabel(e.target.value)} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">תוקף (אופציונלי)</span>
            <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <button onClick={() => inputRef.current?.click()} disabled={busy} className="px-3 py-1.5 text-sm bg-ek-blue text-white rounded-lg flex items-center gap-1 justify-center">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} העלה
          </button>
          <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </div>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}
      {documents.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">אין מסמכים</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map(d => (
            <li key={d.storage_path} className="bg-white border border-slate-200 rounded-lg p-2.5 text-sm flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 shrink-0">
                  {OPERATIONAL_DOC_TYPE_LABELS[d.type as OperationalDocType] ?? d.type}
                </span>
                <span className="truncate text-navy-900">{d.label}</span>
                {d.expiry_date && <span className="text-[11px] text-slate-400 shrink-0">תוקף: {new Date(d.expiry_date).toLocaleDateString("he-IL")}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-ek-blue hover:text-ek-blue/70" title="פתח"><ExternalLink className="w-4 h-4" /></a>}
                {canManage && <button onClick={() => remove(d.storage_path)} className="text-slate-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
