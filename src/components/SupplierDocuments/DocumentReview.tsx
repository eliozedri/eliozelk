"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "@/lib/supabase/client";

async function getToken(): Promise<string> {
  const db = getSupabase();
  if (!db) return "";
  const { data: { session } } = await db.auth.getSession();
  return session?.access_token ?? "";
}
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_COLORS,
  INVENTORY_ACTION_LABELS,
  INVENTORY_ACTION_COLORS,
  DOCUMENT_CATEGORIES,
  USER_CARD_LABELS,
  USER_CARD_BUSINESS_EFFECT,
  docTypeToUserCard,
} from "@/types/supplierDocument";
import type {
  SupplierDocument,
  SupplierDocumentLine,
  PostingPreview,
  InventoryLineAction,
  SupplierDocumentType,
  UserDocumentCard,
} from "@/types/supplierDocument";

const DOCUMENT_TYPE_OPTIONS = Object.entries(DOCUMENT_TYPE_LABELS) as [SupplierDocumentType, string][];
const INVENTORY_ACTION_OPTIONS = Object.entries(INVENTORY_ACTION_LABELS) as [InventoryLineAction, string][];

interface FullDoc extends SupplierDocument {
  suppliers?: {
    id: string; name: string; vat_number: string; phone: string;
    email: string; whatsapp: string; address: string; city: string;
    contact_person: string;
  };
  lines: (SupplierDocumentLine & {
    catalog_items?: {
      id: string; name: string; current_quantity: number;
      minimum_quantity: number; cost_price: number | null; unit_of_measure: string;
    };
  })[];
  reviewEvents: Array<{
    id: string; event_type: string; field_name?: string;
    old_value?: string; new_value?: string; notes: string;
    created_by: string; created_at: string;
  }>;
  duplicateChecks: Array<{
    id: string; check_type: string; match_score: number;
    result: string; details: string; override_approved: boolean;
  }>;
}

export function DocumentReview({
  documentId,
  onClose,
  onPosted,
}: {
  documentId: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [doc, setDoc] = useState<FullDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PostingPreview | null>(null);
  const [posting, setPosting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showPostingPreview, setShowPostingPreview] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

  // Editable header fields
  const [editedDocType, setEditedDocType] = useState<SupplierDocumentType>("unknown");
  const [editedDocNumber, setEditedDocNumber] = useState("");
  const [editedDocDate, setEditedDocDate] = useState("");
  const [editedTotal, setEditedTotal] = useState("");
  const [editedVat, setEditedVat] = useState("");
  const [editedSubtotal, setEditedSubtotal] = useState("");
  const [editedNotes, setEditedNotes] = useState("");

  const loadDoc = useCallback(async () => {
    setLoading(true);
    try {
      const tok = await getToken();
      const res = await fetch(`/api/supplier-documents/${documentId}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) { setError("שגיאה בטעינת המסמך"); return; }
      const data: FullDoc = await res.json();
      setDoc(data);
      setEditedDocType(data.documentType);
      setEditedDocNumber(data.documentNumber);
      setEditedDocDate(data.documentDate ?? "");
      setEditedTotal(data.totalAfterVat?.toString() ?? "");
      setEditedVat(data.vatAmount?.toString() ?? "");
      setEditedSubtotal(data.subtotalBeforeVat?.toString() ?? "");
      setEditedNotes(data.notes);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  const loadPreview = useCallback(async () => {
    const tok = await getToken();
    const res = await fetch(`/api/supplier-documents/${documentId}/preview`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) setPreview(await res.json());
  }, [documentId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadDoc(); }, [loadDoc]);

  async function saveHeaderChanges() {
    setSaving(true);
    setError("");
    try {
      const tok = await getToken();
      const res = await fetch(`/api/supplier-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          documentType: editedDocType,
          documentNumber: editedDocNumber,
          documentDate: editedDocDate || undefined,
          totalAfterVat: editedTotal ? parseFloat(editedTotal) : undefined,
          vatAmount: editedVat ? parseFloat(editedVat) : undefined,
          subtotalBeforeVat: editedSubtotal ? parseFloat(editedSubtotal) : undefined,
          notes: editedNotes,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      setSuccessMsg("נשמר");
      setTimeout(() => setSuccessMsg(""), 2000);
      await loadDoc();
    } finally {
      setSaving(false);
    }
  }

  async function updateLine(
    lineId: string,
    field: "category" | "inventoryAction" | "catalogItemId",
    value: string | null
  ) {
    const tok = await getToken();
    await fetch(`/api/supplier-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify({
        lineUpdates: [{ id: lineId, [field === "inventoryAction" ? "inventoryAction" : field]: value }],
      }),
    });
    await loadDoc();
  }

  async function handleApproveAndPost() {
    setShowPostingPreview(false);
    setPosting(true);
    setError("");
    try {
      const tok = await getToken();
      const res = await fetch(`/api/supplier-documents/${documentId}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "שגיאה ברישום"); return; }
      onPosted();
    } finally {
      setPosting(false);
    }
  }

  async function handleReject() {
    const reason = window.prompt("סיבת דחייה (אופציונלי):");
    if (reason === null) return;
    setRejecting(true);
    const tok = await getToken();
    await fetch(`/api/supplier-documents/${documentId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ reason }),
    });
    setRejecting(false);
    onClose();
  }

  async function handleShowPreview() {
    await loadPreview();
    setShowPostingPreview(true);
  }

  if (loading) {
    return (
      <Overlay onClose={onClose}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Overlay>
    );
  }

  if (!doc) {
    return (
      <Overlay onClose={onClose}>
        <p className="text-red-600 p-8">מסמך לא נמצא</p>
      </Overlay>
    );
  }

  const isPosted = doc.status === "posted";
  const isRejected = doc.status === "rejected";
  const isDuplicateSuspected = doc.status === "duplicate_suspected";
  const canPost = !isPosted && !isRejected;
  const sup = doc.suppliers;

  const selectedCard = doc.parsedJson?.selectedDocumentType as UserDocumentCard | undefined;
  const typeMismatchWarning = doc.parsedJson?.typeMismatchWarning as string | undefined;
  const businessEffect = USER_CARD_BUSINESS_EFFECT[docTypeToUserCard(editedDocType)];

  return (
    <Overlay onClose={onClose}>
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${DOCUMENT_STATUS_COLORS[doc.status]}`}>
              {DOCUMENT_STATUS_LABELS[doc.status]}
            </span>
            {isDuplicateSuspected && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                ⚠ חשד לכפילות
              </span>
            )}
          </div>
          <p className="text-base font-bold text-gray-900">
            {DOCUMENT_TYPE_LABELS[doc.documentType]} {doc.documentNumber ? `— ${doc.documentNumber}` : ""}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {doc.supplierNameRaw || sup?.name || "ספק לא מזוהה"}
            {doc.documentDate ? ` · ${new Date(doc.documentDate).toLocaleDateString("he-IL")}` : ""}
            {doc.totalAfterVat != null ? ` · ₪${doc.totalAfterVat.toLocaleString("he-IL", { minimumFractionDigits: 2 })}` : ""}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 mt-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* OCR low-confidence warning */}
      {doc.extractionConfidence != null && doc.extractionConfidence < 0.5 && (
        <div className="mx-5 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-semibold text-amber-800">
            תוצאות OCR בלתי ודאיות — יש לאמת נתונים
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            ביטחון חילוץ: {Math.round((doc.extractionConfidence ?? 0) * 100)}%
            {doc.extractionNotes ? ` · ${doc.extractionNotes}` : ""}
          </p>
        </div>
      )}

      {/* Type mismatch warning */}
      {typeMismatchWarning && (
        <div className="mx-5 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-semibold text-amber-800">אי-התאמה בסוג מסמך</p>
          <p className="text-xs text-amber-700 mt-0.5">{typeMismatchWarning} — יש לאמת ולתקן אם נדרש</p>
        </div>
      )}

      <div className="flex gap-0 h-full overflow-hidden" style={{ maxHeight: "calc(90vh - 80px)" }}>
        {/* Left: file preview */}
        <div className="w-72 shrink-0 border-l border-gray-100 bg-gray-50 p-4 overflow-y-auto">
          {doc.fileUrl ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">מסמך מקורי</p>
              {doc.fileType?.includes("pdf") ? (
                <iframe
                  src={doc.fileUrl}
                  className="w-full h-96 rounded-lg border border-gray-200"
                  title="מסמך ספק"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={doc.fileUrl ?? ""}
                  alt="מסמך ספק"
                  className="w-full rounded-lg border border-gray-200 object-contain"
                />
              )}
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline block"
              >
                פתח בחלון חדש
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <svg className="w-10 h-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-xs">אין קובץ מצורף</p>
              <p className="text-xs mt-1">הזנה ידנית</p>
            </div>
          )}

          {/* Supplier info */}
          {sup && (
            <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
              <p className="text-xs font-semibold text-gray-700 mb-2">פרטי ספק</p>
              <div className="space-y-1 text-xs text-gray-600">
                <p><span className="font-medium">שם:</span> {sup.name}</p>
                {sup.vat_number && <p><span className="font-medium">ח.פ:</span> {sup.vat_number}</p>}
                {sup.phone && <p><span className="font-medium">טל׳:</span> {sup.phone}</p>}
                {sup.email && <p><span className="font-medium">מייל:</span> {sup.email}</p>}
                {sup.whatsapp && <p><span className="font-medium">WhatsApp:</span> {sup.whatsapp}</p>}
                {sup.address && <p><span className="font-medium">כתובת:</span> {sup.address} {sup.city}</p>}
              </div>
              {(!sup.phone && !sup.whatsapp) && (
                <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded px-2 py-1">⚠ ספק ללא פרטי קשר</p>
              )}
            </div>
          )}

          {!doc.supplierId && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-xs font-semibold text-red-700">ספק לא מקושר</p>
              <p className="text-xs text-red-600 mt-1">חשוב: יש לקשר ספק לפני רישום</p>
            </div>
          )}

          {/* Duplicate checks */}
          {doc.duplicateChecks && doc.duplicateChecks.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-xs font-semibold text-red-700 mb-1">אזהרות כפילות</p>
              {doc.duplicateChecks.map(dc => (
                <p key={dc.id} className="text-xs text-red-600">
                  {dc.check_type === "file_hash" ? "קובץ זהה" :
                   dc.check_type === "supplier_doc_number" ? "מספר מסמך זהה" :
                   "ספק + תאריך + סכום"} · ציון: {Math.round(dc.match_score * 100)}%
                </p>
              ))}
            </div>
          )}

          {/* Collapsible raw OCR text */}
          {doc.rawText && (
            <div className="mt-4">
              <button
                onClick={() => setShowRawText(p => !p)}
                className="text-xs text-gray-500 hover:text-gray-800 font-medium flex items-center gap-1"
              >
                <svg className={`w-3 h-3 transition-transform ${showRawText ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                טקסט גולמי מ-OCR
              </button>
              {showRawText && (
                <pre className="mt-2 p-3 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-700 whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono leading-relaxed" dir="ltr">
                  {doc.rawText}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Right: fields + lines */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Document header fields */}
          <Section title="פרטי מסמך">
            {/* User pre-selection + business effect */}
            <div className="flex flex-wrap items-center gap-3 mb-3 pb-3 border-b border-gray-100">
              {selectedCard && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">נבחר ע&quot;י המשתמש:</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                    {USER_CARD_LABELS[selectedCard]}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded-full font-medium ${businessEffect.createsExpense === true ? "bg-red-100 text-red-700" : businessEffect.createsExpense === false ? "bg-gray-100 text-gray-500" : "bg-amber-100 text-amber-700"}`}>
                  {businessEffect.createsExpense === true ? "יוצר הוצאה" : businessEffect.createsExpense === false ? "ללא הוצאה" : "הוצאה אפשרית"}
                </span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${businessEffect.updatesInventory === true ? "bg-green-100 text-green-700" : businessEffect.updatesInventory === false ? "bg-gray-100 text-gray-500" : "bg-amber-100 text-amber-700"}`}>
                  {businessEffect.updatesInventory === true ? "עדכון מלאי" : businessEffect.updatesInventory === false ? "ללא השפעת מלאי" : "מלאי אפשרי"}
                </span>
                {businessEffect.awaitInvoiceMatch && (
                  <span className="px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">ממתין להתאמת חשבונית</span>
                )}
              </div>
            </div>
            {!isPosted && (
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Field label="סוג מסמך">
                  <select className={SELECT} value={editedDocType} onChange={e => setEditedDocType(e.target.value as SupplierDocumentType)}>
                    {DOCUMENT_TYPE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="מספר מסמך">
                  <input className={INPUT} value={editedDocNumber} onChange={e => setEditedDocNumber(e.target.value)} />
                </Field>
                <Field label="תאריך">
                  <input type="date" className={INPUT} value={editedDocDate} onChange={e => setEditedDocDate(e.target.value)} />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              {isPosted ? (
                <>
                  <ReadField label="סוג מסמך" value={DOCUMENT_TYPE_LABELS[doc.documentType]} />
                  <ReadField label="מספר מסמך" value={doc.documentNumber || "—"} />
                  <ReadField label="תאריך" value={doc.documentDate ? new Date(doc.documentDate).toLocaleDateString("he-IL") : "—"} />
                </>
              ) : null}
              <Field label="סה״כ לפני מע״מ">
                {isPosted
                  ? <ReadField label="" value={doc.subtotalBeforeVat != null ? `₪${doc.subtotalBeforeVat.toLocaleString("he-IL")}` : "—"} />
                  : <input type="number" className={INPUT} value={editedSubtotal} onChange={e => setEditedSubtotal(e.target.value)} placeholder="0.00" />
                }
              </Field>
              <Field label="מע״מ">
                {isPosted
                  ? <ReadField label="" value={doc.vatAmount != null ? `₪${doc.vatAmount.toLocaleString("he-IL")}` : "—"} />
                  : <input type="number" className={INPUT} value={editedVat} onChange={e => setEditedVat(e.target.value)} placeholder="0.00" />
                }
              </Field>
              <Field label="סה״כ כולל מע״מ">
                {isPosted
                  ? <ReadField label="" value={doc.totalAfterVat != null ? `₪${doc.totalAfterVat.toLocaleString("he-IL")}` : "—"} />
                  : <input type="number" className={INPUT} value={editedTotal} onChange={e => setEditedTotal(e.target.value)} placeholder="0.00" />
                }
              </Field>
            </div>
            {!isPosted && (
              <>
                <Field label="הערות">
                  <input className={INPUT} value={editedNotes} onChange={e => setEditedNotes(e.target.value)} />
                </Field>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={saveHeaderChanges}
                    disabled={saving}
                    className="px-4 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                  >
                    {saving ? "שומר..." : "שמור שינויים"}
                  </button>
                  {successMsg && <span className="text-xs text-green-600 font-medium">{successMsg}</span>}
                </div>
              </>
            )}
          </Section>

          {/* Lines table */}
          <Section title={`שורות מסמך (${doc.lines?.length ?? 0})`}>
            {(!doc.lines || doc.lines.length === 0) ? (
              <p className="text-sm text-gray-400 text-center py-4">אין שורות</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-right p-2 font-medium">תיאור</th>
                      <th className="text-right p-2 font-medium w-20">כמות</th>
                      <th className="text-right p-2 font-medium w-16">יחידה</th>
                      <th className="text-right p-2 font-medium w-24">מחיר יחידה</th>
                      <th className="text-right p-2 font-medium w-24">סה״כ</th>
                      <th className="text-right p-2 font-medium w-36">קטגוריה</th>
                      <th className="text-right p-2 font-medium w-36">השפעת מלאי</th>
                      <th className="text-right p-2 font-medium w-28">מוצר קיים</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {doc.lines.map((line) => {
                      const catItem = line.catalog_items;
                      const hasWarning = line.warningFlags && line.warningFlags.length > 0;
                      return (
                        <tr key={line.id} className={`${hasWarning ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                          <td className="p-2">
                            <p className="font-medium text-gray-900">{line.originalDescription}</p>
                            {line.supplierSku && <p className="text-gray-400">מק״ט: {line.supplierSku}</p>}
                            {hasWarning && line.warningFlags.map((w, wi) => (
                              <p key={wi} className="text-amber-600 text-xs">⚠ {w}</p>
                            ))}
                          </td>
                          <td className="p-2 text-gray-700">{line.quantity ?? "—"}</td>
                          <td className="p-2 text-gray-700">{line.unitOfMeasure || "—"}</td>
                          <td className="p-2 text-gray-700">
                            {line.unitPrice != null ? `₪${line.unitPrice.toLocaleString("he-IL")}` : "—"}
                          </td>
                          <td className="p-2 font-medium text-gray-900">
                            {line.lineTotal != null ? `₪${line.lineTotal.toLocaleString("he-IL")}` : "—"}
                          </td>
                          <td className="p-2">
                            {isPosted ? (
                              <span className="text-gray-600">{line.category || "—"}</span>
                            ) : (
                              <select
                                className="w-full text-xs border border-gray-200 rounded px-1 py-1 bg-white"
                                value={line.category}
                                onChange={e => updateLine(line.id, "category", e.target.value)}
                              >
                                <option value="">— בחר —</option>
                                {DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            )}
                          </td>
                          <td className="p-2">
                            {isPosted ? (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${INVENTORY_ACTION_COLORS[line.inventoryAction]}`}>
                                {INVENTORY_ACTION_LABELS[line.inventoryAction]}
                              </span>
                            ) : (
                              <select
                                className="w-full text-xs border border-gray-200 rounded px-1 py-1 bg-white"
                                value={line.inventoryAction}
                                onChange={e => updateLine(line.id, "inventoryAction", e.target.value as InventoryLineAction)}
                              >
                                {INVENTORY_ACTION_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                            )}
                          </td>
                          <td className="p-2">
                            {catItem ? (
                              <div>
                                <p className="font-medium text-gray-900 truncate max-w-24">{catItem.name}</p>
                                <p className={`text-xs ${catItem.current_quantity < catItem.minimum_quantity ? "text-red-600" : "text-gray-500"}`}>
                                  מלאי: {catItem.current_quantity} / מינ׳: {catItem.minimum_quantity}
                                </p>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">לא מקושר</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Posting preview */}
          {showPostingPreview && preview && (
            <Section title="תצוגת רישום מקדימה">
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <PreviewRow label="הוצאה כספית" value={preview.willCreateExpense ? "כן" : "לא"} ok={true} />
                <PreviewRow label="תנועות מלאי" value={`${preview.inventoryLineCount} שורות`} ok={preview.inventoryLineCount >= 0} />
                <PreviewRow label="שורות שירות" value={`${preview.serviceLinesCount}`} ok={true} />
                <PreviewRow label="טיוטות מוצר" value={`${preview.productDraftCount}`} ok={true} />
                <PreviewRow label="טיוטת ספק" value={preview.willCreateSupplierDraft ? "כן — נדרש אישור ידני" : "לא"} ok={!preview.willCreateSupplierDraft} />
                <PreviewRow label="חשד לכפילות" value={preview.duplicateRisk ? "כן" : "לא"} ok={!preview.duplicateRisk} />
                {preview.totalAmount != null && <PreviewRow label="סה״כ לרישום" value={`₪${preview.totalAmount.toLocaleString("he-IL")}`} ok={true} />}
              </div>
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1">⚠ {w}</p>
              ))}
              {preview.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mb-1">✕ {e}</p>
              ))}
              {preview.canPost && (
                <button
                  onClick={handleApproveAndPost}
                  disabled={posting}
                  className="mt-2 w-full py-2.5 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white"
                >
                  {posting ? "מרשם..." : "אשר ורשום"}
                </button>
              )}
            </Section>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Action bar */}
          {canPost && (
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              {!showPostingPreview ? (
                <button
                  onClick={handleShowPreview}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white"
                >
                  תצוגת רישום מקדימה
                </button>
              ) : (
                <button
                  onClick={() => setShowPostingPreview(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  סגור תצוגה מקדימה
                </button>
              )}
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {rejecting ? "דוחה..." : "דחה מסמך"}
              </button>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// ── Small layout helpers ──────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
          dir="rtl"
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!label) return <>{children}</>;
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  if (!label) return <p className="text-sm text-gray-900">{value}</p>;
  return (
    <div>
      {label && <p className="text-xs text-gray-500 mb-0.5">{label}</p>}
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function PreviewRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`text-xs font-semibold ${ok ? "text-green-700" : "text-amber-700"}`}>{value}</span>
    </div>
  );
}

const INPUT = "w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300";
const SELECT = "w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-300";
