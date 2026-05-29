"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ScanLine, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { authedFetch } from "@/lib/clientApi";
import type { Equipment, OperationalDocType } from "@/types/equipment";
import { OPERATIONAL_DOC_TYPE_LABELS } from "@/types/equipment";
import { USER_CARD_LABELS, type UserDocumentCard } from "@/types/supplierDocument";

interface ScanAnalysis {
  fileName: string;
  header?: {
    supplierName?: string; supplierVat?: string; documentNumber?: string;
    documentDate?: string; totalAfterVat?: number; vatAmount?: number;
    subtotalBeforeVat?: number; confidence?: number;
  };
  vehicle: { plateNumber?: string; chassisNumber?: string; licenseValidUntil?: string; insuranceValidUntil?: string; mileage?: number };
  fieldWarnings: string[];
  lowConfidenceTerms: string[];
  pageConfidence: number | null;
  scanned: boolean;
  engine: string | null;
  provider?: string | null;
  fallbackUsed?: boolean;
  userError?: string | null;
  manualReviewReason?: string | null;
  documentClass: string;
  operationalType: OperationalDocType | null;
  classConfidence: number;
  classReason: string;
  equipmentMatches: { id: string; displayName: string; licenseNumber: string | null; score: number; reason: string }[];
  contradictions: string[];
}

type Step = "pick" | "analyzing" | "review" | "saving" | "done";
type Route = "financial" | "operational";

const CARD_OPTIONS: UserDocumentCard[] = ["invoice", "delivery_note", "receipt", "other"];
const OP_OPTIONS: OperationalDocType[] = ["license", "insurance", "test", "manual", "technical", "warranty", "other"];

export function FleetScanModal({
  equipment,
  onClose,
  onDone,
}: {
  equipment: Equipment[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ScanAnalysis | null>(null);
  const [error, setError] = useState("");

  const [route, setRoute] = useState<Route>("financial");
  const [card, setCard] = useState<UserDocumentCard>("invoice");
  const [opType, setOpType] = useState<OperationalDocType>("license");
  const [equipmentId, setEquipmentId] = useState("");
  const [resultDocId, setResultDocId] = useState("");

  async function analyze(f: File) {
    setFile(f);
    setStep("analyzing");
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await authedFetch("/api/fleet/scan-document", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "ניתוח המסמך נכשל"); setStep("pick"); return; }
      const a = j as ScanAnalysis;
      setAnalysis(a);
      // Pre-fill routing decision from classifier
      const isOperational = a.documentClass.startsWith("vehicle_") && a.documentClass !== "vehicle_maintenance";
      setRoute(isOperational ? "operational" : "financial");
      if (a.operationalType) setOpType(a.operationalType);
      if (a.equipmentMatches[0] && a.equipmentMatches[0].score >= 0.9) setEquipmentId(a.equipmentMatches[0].id);
      setStep("review");
    } catch {
      setError("שגיאת רשת — נסה שוב");
      setStep("pick");
    }
  }

  async function confirm() {
    if (!file) return;
    if (route === "operational" && !equipmentId) { setError("יש לבחור כלי לשיוך המסמך התפעולי"); return; }
    setStep("saving");
    setError("");
    try {
      if (route === "financial") {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("selectedDocumentType", card);
        fd.append("uploadSource", "fleet_scan");
        fd.append("businessArea", "fleet");
        if (equipmentId) fd.append("equipmentId", equipmentId);
        const res = await authedFetch("/api/supplier-documents/upload", { method: "POST", body: fd });
        const j = await res.json();
        if (res.status === 409) { setError(`קובץ זהה כבר קיים (${j.existingDocNumber || j.existingDocumentId})`); setStep("review"); return; }
        if (!res.ok) { setError(j.error ?? "שמירה נכשלה"); setStep("review"); return; }
        setResultDocId(j.id ?? "");
      } else {
        const expiry =
          opType === "insurance" ? analysis?.vehicle.insuranceValidUntil
          : analysis?.vehicle.licenseValidUntil;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", opType);
        fd.append("label", `${OPERATIONAL_DOC_TYPE_LABELS[opType]} — ${analysis?.fileName ?? ""}`);
        if (expiry) fd.append("expiry_date", expiry);
        const res = await authedFetch(`/api/equipment/${equipmentId}/document`, { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok) { setError(j.error ?? "שמירה נכשלה"); setStep("review"); return; }
      }
      setStep("done");
      onDone();
    } catch {
      setError("שגיאת רשת");
      setStep("review");
    }
  }

  const a = analysis;
  const confPct = a?.pageConfidence != null ? Math.round(a.pageConfidence * 100) : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Panel: fixed header (close button always visible) + scrolling body. */}
        <div dir="rtl" className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex shrink-0 items-center gap-3 p-5 border-b border-gray-100">
            <span className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><ScanLine className="w-5 h-5" /></span>
            <p className="text-base font-bold text-gray-900 flex-1">סרוק מסמך — צי רכב ומכונות</p>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="סגור"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-5 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
            {/* ── Pick ── */}
            {step === "pick" && (
              <div>
                <p className="text-sm text-gray-500 mb-4">העלה חשבונית, רישיון רכב, ביטוח, טסט או מסמך טיפול. המנוע יזהה את הסוג וינסה לשייך לכלי.</p>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) analyze(f); }}
                >
                  <ScanLine className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">גרור קובץ לכאן או לחץ לבחירה</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPEG, PNG, HEIC — עד 20MB</p>
                  <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff,.heic,.heif" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) analyze(f); }} />
                </div>
                {error && <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
              </div>
            )}

            {/* ── Analyzing ── */}
            {step === "analyzing" && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-sm font-semibold text-gray-800">מנתח מסמך…</p>
                <p className="text-xs text-gray-500 text-center">זיהוי טקסט וחילוץ שדות — עד 30 שניות.</p>
              </div>
            )}

            {/* ── Review ── */}
            {step === "review" && a && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{a.classReason}</span>
                  {confPct != null && <span className={`px-2 py-0.5 rounded-full ${confPct < 50 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>ביטחון OCR: {confPct}%</span>}
                  {a.scanned && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">PDF סרוק (OCR)</span>}
                  {a.engine && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{a.engine}</span>}
                  {a.fallbackUsed && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">גיבוי OCR</span>}
                  {a.manualReviewReason && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{a.manualReviewReason}</span>}
                </div>

                {a.contradictions.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-semibold text-red-800 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> סתירות שזוהו</p>
                    <ul className="text-xs text-red-700 mt-1 list-disc pr-4 space-y-0.5">{a.contradictions.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  </div>
                )}
                {a.fieldWarnings.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <ul className="text-xs text-amber-700 list-disc pr-4 space-y-0.5">{a.fieldWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  </div>
                )}

                {/* Extracted summary */}
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                  {a.header?.supplierName && <div><span className="text-gray-500">ספק:</span> <b>{a.header.supplierName}</b></div>}
                  {a.header?.supplierVat && <div><span className="text-gray-500">ח.פ/עוסק:</span> <b>{a.header.supplierVat}</b></div>}
                  {a.header?.documentNumber && <div><span className="text-gray-500">מס׳ מסמך:</span> <b>{a.header.documentNumber}</b></div>}
                  {a.header?.documentDate && <div><span className="text-gray-500">תאריך:</span> <b>{a.header.documentDate}</b></div>}
                  {a.header?.totalAfterVat != null && <div><span className="text-gray-500">סה״כ:</span> <b>₪{a.header.totalAfterVat.toLocaleString("he-IL")}</b></div>}
                  {a.vehicle.plateNumber && <div><span className="text-gray-500">מס׳ רכב:</span> <b>{a.vehicle.plateNumber}</b></div>}
                  {a.vehicle.chassisNumber && <div><span className="text-gray-500">שלדה:</span> <b>{a.vehicle.chassisNumber}</b></div>}
                  {a.vehicle.licenseValidUntil && <div><span className="text-gray-500">תוקף רישיון:</span> <b>{a.vehicle.licenseValidUntil}</b></div>}
                  {a.vehicle.insuranceValidUntil && <div><span className="text-gray-500">תוקף ביטוח:</span> <b>{a.vehicle.insuranceValidUntil}</b></div>}
                  {a.vehicle.mileage != null && <div><span className="text-gray-500">ק״מ:</span> <b>{a.vehicle.mileage.toLocaleString("he-IL")}</b></div>}
                </div>

                {/* Routing */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">ניתוב המסמך</p>
                  <div className="flex gap-2">
                    <button onClick={() => setRoute("financial")} className={`flex-1 py-2 rounded-lg text-sm border ${route === "financial" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>כספים + כרטיס כלי</button>
                    <button onClick={() => setRoute("operational")} className={`flex-1 py-2 rounded-lg text-sm border ${route === "operational" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>מסמך תפעולי (רישיון/ביטוח/טסט)</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {route === "financial" ? (
                    <label className="flex flex-col gap-1 text-sm"><span className="text-xs text-gray-500">סוג מסמך</span>
                      <select value={card} onChange={e => setCard(e.target.value as UserDocumentCard)} className="border border-gray-200 rounded px-2 py-1.5 bg-white">
                        {CARD_OPTIONS.map(c => <option key={c} value={c}>{USER_CARD_LABELS[c]}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label className="flex flex-col gap-1 text-sm"><span className="text-xs text-gray-500">סוג מסמך תפעולי</span>
                      <select value={opType} onChange={e => setOpType(e.target.value as OperationalDocType)} className="border border-gray-200 rounded px-2 py-1.5 bg-white">
                        {OP_OPTIONS.map(t => <option key={t} value={t}>{OPERATIONAL_DOC_TYPE_LABELS[t]}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="flex flex-col gap-1 text-sm"><span className="text-xs text-gray-500">שיוך לכלי {route === "operational" ? "(חובה)" : "(אופציונלי)"}</span>
                    <select value={equipmentId} onChange={e => setEquipmentId(e.target.value)} className="border border-gray-200 rounded px-2 py-1.5 bg-white">
                      <option value="">— ללא שיוך —</option>
                      {a.equipmentMatches.length > 0 && (
                        <optgroup label="התאמות שזוהו">
                          {a.equipmentMatches.map(m => <option key={m.id} value={m.id}>{m.displayName} · {m.reason} ({Math.round(m.score * 100)}%)</option>)}
                        </optgroup>
                      )}
                      <optgroup label="כל הכלים">
                        {equipment.map(e => <option key={e.id} value={e.id}>{e.display_name}{e.license_number ? ` · ${e.license_number}` : ""}</option>)}
                      </optgroup>
                    </select>
                  </label>
                </div>

                {a.lowConfidenceTerms.length > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2" dir="rtl">מילים בביטחון נמוך — לאמת: {a.lowConfidenceTerms.join(" · ")}</p>
                )}

                <p className="text-[11px] text-gray-400">
                  {route === "financial"
                    ? "המסמך יישמר כטיוטה לאימות בהנהלת חשבונות. שום נתון כספי לא נרשם סופית ללא אישור."
                    : "המסמך יצורף לכרטיס הכלי תחת מסמכים, כולל תאריך תוקף אם זוהה."}
                </p>

                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

                <div className="flex gap-2">
                  <button onClick={confirm} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white">אשר ושמור</button>
                  <button onClick={() => { setStep("pick"); setAnalysis(null); setFile(null); }} className="px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">החלף קובץ</button>
                </div>
              </div>
            )}

            {/* ── Saving ── */}
            {step === "saving" && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
                <p className="text-sm font-semibold text-gray-800">שומר…</p>
                {route === "financial" && <p className="text-xs text-gray-500 text-center">מעבד ושומר את המסמך הכספי — עד 30 שניות.</p>}
              </div>
            )}

            {/* ── Done ── */}
            {step === "done" && (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <p className="text-sm font-semibold text-gray-800">המסמך נשמר בהצלחה</p>
                {route === "financial" ? (
                  <>
                    <p className="text-xs text-gray-500">המסמך ממתין לאימות בהנהלת חשבונות{equipmentId ? " ומשויך לכלי" : ""}.</p>
                    <div className="flex gap-2 mt-2">
                      {resultDocId && (
                        <button onClick={() => router.push(`/financial-management?doc=${encodeURIComponent(resultDocId)}`)} className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white">פתח בהנהלת חשבונות</button>
                      )}
                      <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600">סגור</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">המסמך צורף לכרטיס הכלי תחת מסמכים.</p>
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 mt-2">סגור</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
