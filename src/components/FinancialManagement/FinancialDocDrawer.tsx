"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, FileText, ExternalLink, Truck, AlertTriangle, Loader2, Check } from "lucide-react";
import {
  DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_COLORS,
  type SupplierDocument, type SupplierDocumentType, type SupplierDocumentStatus,
} from "@/types/supplierDocument";
import {
  EXPENSE_TYPE_ORDER, EXPENSE_TYPE_LABELS, BUSINESS_AREA_LABELS, UPLOAD_SOURCE_LABELS,
  type ExpenseType, type BusinessArea, type UploadSource,
} from "@/types/financial";
import { authedFetch, authedJson } from "@/lib/clientApi";

interface FullDoc extends SupplierDocument {
  duplicateChecks?: Array<{ id: string; check_type: string; match_score: number; result: string; details: string; override_approved: boolean; created_at: string }>;
  reviewEvents?: Array<{ id: string; event_type: string; notes: string; created_by: string; created_at: string }>;
}

function money(n: number | null | undefined, cur = "ILS"): string {
  if (n == null) return "—";
  return `${cur === "ILS" ? "₪" : ""}${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
}

export function FinancialDocDrawer({
  documentId, canManage, onClose, onChanged,
}: {
  documentId: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<FullDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingClass, setSavingClass] = useState(false);
  const [expenseType, setExpenseType] = useState<ExpenseType | "">("");
  const [businessArea, setBusinessArea] = useState<BusinessArea | "">("");
  const [overrideReason, setOverrideReason] = useState("");
  const [resolving, setResolving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await authedJson<FullDoc>(`/api/supplier-documents/${documentId}`);
      setDoc(d);
      setExpenseType((d.expenseType as ExpenseType) ?? "");
      setBusinessArea((d.businessArea as BusinessArea) ?? "");
    } catch (e) { setErr(e instanceof Error ? e.message : "טעינה נכשלה"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [documentId]);

  async function saveClassification() {
    if (!expenseType) { setErr("יש לבחור סוג הוצאה"); return; }
    setSavingClass(true); setErr(null);
    try {
      await authedFetch(`/api/supplier-documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ expenseType, businessArea: businessArea || null, requiresClassification: false }),
      });
      await load(); onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "שמירה נכשלה"); }
    finally { setSavingClass(false); }
  }

  async function resolveDuplicate(action: "override" | "link_existing" | "reject") {
    setResolving(true); setErr(null);
    try {
      const candidateIds = (doc?.duplicateChecks ?? []).map(c => c.id);
      const topScore = Math.max(0, ...(doc?.duplicateChecks ?? []).map(c => c.match_score));
      await authedFetch(`/api/supplier-documents/${documentId}/resolve-duplicate`, {
        method: "POST",
        body: JSON.stringify({ action, reason: overrideReason, matchScore: topScore, similarDocumentIds: candidateIds }),
      });
      await load(); onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "פעולה נכשלה"); }
    finally { setResolving(false); }
  }

  const dupChecks = doc?.duplicateChecks ?? [];
  const isDuplicateSuspected = doc?.status === "duplicate_suspected" || dupChecks.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-start" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative bg-surface w-full sm:w-[560px] max-w-full h-full overflow-y-auto shadow-2xl">
        <div className="bg-navy-900 text-white p-4 sticky top-0 z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-base flex items-center gap-2"><FileText className="w-5 h-5" /> מסמך כספי</h2>
            {doc && <p className="text-xs text-white/60 mt-1 truncate">{DOCUMENT_TYPE_LABELS[doc.documentType as SupplierDocumentType] ?? doc.documentType} · {doc.documentNumber || "ללא מספר"}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : !doc ? (
          <p className="p-6 text-center text-slate-400">{err ?? "מסמך לא נמצא"}</p>
        ) : (
          <div className="p-4 flex flex-col gap-4">
            {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5 text-sm">{err}</div>}

            {/* Duplicate alert */}
            {isDuplicateSuspected && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="flex items-center gap-2 text-red-700 font-bold text-sm"><AlertTriangle className="w-4 h-4" /> חשד לכפילות</div>
                <ul className="mt-2 text-xs text-red-700 flex flex-col gap-1">
                  {dupChecks.map(c => (
                    <li key={c.id}>• {c.details} — התאמה {Math.round(c.match_score * 100)}% {c.override_approved ? "(אושר ידנית)" : ""}</li>
                  ))}
                </ul>
                {canManage && !dupChecks.every(c => c.override_approved) && (
                  <div className="mt-3 flex flex-col gap-2">
                    <input value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="סיבת ההחלטה (נשמר ב-audit)" className="border border-red-200 rounded px-2 py-1.5 text-sm" />
                    <div className="flex flex-wrap gap-2">
                      <button disabled={resolving} onClick={() => resolveDuplicate("override")} className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg">שמור כמסמך חדש בכל זאת</button>
                      <button disabled={resolving} onClick={() => resolveDuplicate("link_existing")} className="px-3 py-1.5 text-xs bg-slate-600 text-white rounded-lg">אחד עם הקיים</button>
                      <button disabled={resolving} onClick={() => resolveDuplicate("reject")} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg">בטל / דחה</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Status + classification */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">סטטוס</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${DOCUMENT_STATUS_COLORS[doc.status as SupplierDocumentStatus]}`}>{DOCUMENT_STATUS_LABELS[doc.status as SupplierDocumentStatus] ?? doc.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-[11px] text-slate-400">ספק</div><div className="text-navy-900">{doc.supplier?.name ?? (doc.supplierNameRaw || "—")}</div></div>
                <div><div className="text-[11px] text-slate-400">תאריך</div><div className="text-navy-900">{doc.documentDate ? new Date(doc.documentDate).toLocaleDateString("he-IL") : "—"}</div></div>
                <div><div className="text-[11px] text-slate-400">לפני מע"מ</div><div className="text-navy-900">{money(doc.subtotalBeforeVat, doc.currency)}</div></div>
                <div><div className="text-[11px] text-slate-400">מע"מ</div><div className="text-navy-900">{money(doc.vatAmount, doc.currency)}</div></div>
                <div><div className="text-[11px] text-slate-400">סה"כ</div><div className="text-navy-900 font-bold">{money(doc.totalAfterVat, doc.currency)}</div></div>
                <div><div className="text-[11px] text-slate-400">מקור העלאה</div><div className="text-navy-900">{UPLOAD_SOURCE_LABELS[(doc.uploadSource as UploadSource)] ?? doc.uploadSource ?? "—"}</div></div>
              </div>

              {/* Classification */}
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-navy-900">סיווג הוצאה</span>
                  {doc.requiresClassification && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">דורש סיווג</span>}
                </div>
                {canManage ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select value={expenseType} onChange={e => setExpenseType(e.target.value as ExpenseType)} className="border border-slate-200 rounded px-2 py-1.5 text-sm bg-white flex-1">
                      <option value="">— בחר סוג הוצאה —</option>
                      {EXPENSE_TYPE_ORDER.map(t => <option key={t} value={t}>{EXPENSE_TYPE_LABELS[t]}</option>)}
                    </select>
                    <select value={businessArea} onChange={e => setBusinessArea(e.target.value as BusinessArea)} className="border border-slate-200 rounded px-2 py-1.5 text-sm bg-white flex-1">
                      <option value="">— תחום עסקי —</option>
                      {(Object.keys(BUSINESS_AREA_LABELS) as BusinessArea[]).map(a => <option key={a} value={a}>{BUSINESS_AREA_LABELS[a]}</option>)}
                    </select>
                    <button onClick={saveClassification} disabled={savingClass} className="px-3 py-1.5 text-sm bg-ek-blue text-white rounded-lg flex items-center gap-1 justify-center">
                      {savingClass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} שמור
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-navy-900">{doc.expenseType ? EXPENSE_TYPE_LABELS[doc.expenseType as ExpenseType] : "לא סווג"}</div>
                )}
              </div>
            </div>

            {/* Links */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col gap-2">
              {doc.equipmentId ? (
                <button onClick={() => router.push(`/fleet?asset=${encodeURIComponent(doc.equipmentId!)}`)} className="flex items-center justify-between text-sm text-ek-blue hover:underline">
                  <span className="flex items-center gap-2"><Truck className="w-4 h-4" /> כלי משויך</span>
                  <span className="flex items-center gap-1 text-xs">פתח כרטיס כלי <ExternalLink className="w-3.5 h-3.5" /></span>
                </button>
              ) : (
                <div className="text-xs text-slate-400">לא משויך לכלי</div>
              )}
              {doc.fileUrl && (
                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between text-sm text-ek-blue hover:underline">
                  <span className="flex items-center gap-2"><FileText className="w-4 h-4" /> {doc.fileName || "קובץ מצורף"}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {/* Audit trail */}
            {(doc.reviewEvents?.length ?? 0) > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-navy-900 mb-2">היסטוריית פעולות</div>
                <ul className="flex flex-col gap-1.5 text-xs text-slate-500">
                  {doc.reviewEvents!.map(ev => (
                    <li key={ev.id} className="flex flex-col">
                      <span className="text-navy-900">{ev.notes || ev.event_type}</span>
                      <span className="text-[10px] text-slate-400">{ev.created_by} · {new Date(ev.created_at).toLocaleString("he-IL")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
