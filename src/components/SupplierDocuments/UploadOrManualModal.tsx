"use client";

import { useState, useRef } from "react";
import { getSupabase } from "@/lib/supabase/client";

async function getToken(): Promise<string> {
  const db = getSupabase();
  if (!db) return "";
  const { data: { session } } = await db.auth.getSession();
  return session?.access_token ?? "";
}
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_CATEGORIES,
  INVENTORY_ACTION_LABELS,
  USER_CARD_LABELS,
  USER_CARD_DESCRIPTIONS,
  USER_CARD_DEFAULT_TYPE,
} from "@/types/supplierDocument";
import type {
  SupplierDocumentType,
  InventoryLineAction,
  UserDocumentCard,
} from "@/types/supplierDocument";

interface Supplier { id: string; name: string; vat_number: string; }

interface LineInput {
  lineNumber: number;
  originalDescription: string;
  supplierSku: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  lineTotal: string;
  category: string;
  inventoryAction: InventoryLineAction;
}

const BLANK_LINE = (): LineInput => ({
  lineNumber: 1,
  originalDescription: "",
  supplierSku: "",
  quantity: "",
  unitOfMeasure: "יחידה",
  unitPrice: "",
  lineTotal: "",
  category: "",
  inventoryAction: "requires_review",
});

const CURRENCY_OPTIONS = ["ILS", "USD", "EUR"];

export function UploadOrManualModal({
  suppliers,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"type-select" | "choose" | "upload" | "manual" | "camera">("type-select");
  const [userCard, setUserCard] = useState<UserDocumentCard | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Manual form state
  const [docType, setDocType] = useState<SupplierDocumentType>("unknown");
  const [supplierId, setSupplierId] = useState("");
  const [supplierNameRaw, setSupplierNameRaw] = useState("");
  const [supplierVatRaw, setSupplierVatRaw] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [subtotal, setSubtotal] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [totalAfterVat, setTotalAfterVat] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineInput[]>([BLANK_LINE()]);

  async function handleCameraCapture(file: File) {
    setMode("camera");
    setError("");
    try {
      const tok = await getToken();
      const form = new FormData();
      form.append("file", file);
      if (userCard) form.append("selectedDocumentType", userCard);
      const res = await fetch("/api/supplier-documents/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בעיבוד המסמך");
        setMode("choose");
        return;
      }
      onCreated(data.id);
    } catch {
      setError("שגיאת רשת — נסה שוב");
      setMode("choose");
    }
  }

  async function handleUpload() {
    if (!selectedFile) { setError("יש לבחור קובץ"); return; }
    setUploading(true);
    setError("");
    try {
      const tok = await getToken();
      const form = new FormData();
      form.append("file", selectedFile);
      if (userCard) form.append("selectedDocumentType", userCard);
      const res = await fetch("/api/supplier-documents/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.existingDocumentId) {
          setError(`קובץ זהה כבר קיים (${data.existingDocNumber || data.existingDocumentId})`);
        } else {
          setError(data.error ?? "שגיאה בהעלאה");
        }
        return;
      }
      onCreated(data.id);
    } catch {
      setError("שגיאת רשת");
    } finally {
      setUploading(false);
    }
  }

  async function handleManualSave() {
    setSaving(true);
    setError("");
    try {
      const linesPayload = lines
        .filter(l => l.originalDescription.trim())
        .map((l, i) => ({
          lineNumber: i + 1,
          originalDescription: l.originalDescription,
          normalizedDescription: l.originalDescription,
          supplierSku: l.supplierSku,
          quantity: l.quantity ? parseFloat(l.quantity) : undefined,
          unitOfMeasure: l.unitOfMeasure,
          unitPrice: l.unitPrice ? parseFloat(l.unitPrice) : undefined,
          lineTotal: l.lineTotal ? parseFloat(l.lineTotal) : undefined,
          category: l.category,
          inventoryAction: l.inventoryAction,
        }));

      const tok = await getToken();
      const res = await fetch("/api/supplier-documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({
          documentType: docType,
          selectedDocumentType: userCard ?? undefined,
          supplierId: supplierId || undefined,
          supplierNameRaw,
          supplierVatRaw,
          documentNumber,
          documentDate: documentDate || undefined,
          dueDate: dueDate || undefined,
          currency,
          subtotalBeforeVat: subtotal ? parseFloat(subtotal) : undefined,
          vatAmount: vatAmount ? parseFloat(vatAmount) : undefined,
          totalAfterVat: totalAfterVat ? parseFloat(totalAfterVat) : undefined,
          notes,
          lines: linesPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "שגיאה"); return; }
      onCreated(data.id);
    } catch {
      setError("שגיאת רשת");
    } finally {
      setSaving(false);
    }
  }

  function addLine() {
    setLines(prev => [...prev, { ...BLANK_LINE(), lineNumber: prev.length + 1 }]);
  }

  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Document type pre-selection (4 cards) ────────────────────────────────
  if (mode === "type-select") {
    const cards: { id: UserDocumentCard; color: string; iconPath: string }[] = [
      {
        id: "invoice",
        color: "border-orange-300 hover:border-orange-500 hover:bg-orange-50",
        iconPath: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
      },
      {
        id: "delivery_note",
        color: "border-blue-300 hover:border-blue-500 hover:bg-blue-50",
        iconPath: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
      },
      {
        id: "receipt",
        color: "border-green-300 hover:border-green-500 hover:bg-green-50",
        iconPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      },
      {
        id: "other",
        color: "border-gray-300 hover:border-gray-500 hover:bg-gray-50",
        iconPath: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      },
    ];
    const iconColors: Record<UserDocumentCard, string> = {
      invoice: "bg-orange-100 text-orange-600",
      delivery_note: "bg-blue-100 text-blue-600",
      receipt: "bg-green-100 text-green-600",
      other: "bg-gray-100 text-gray-600",
    };
    return (
      <ModalShell onClose={onClose} title="הוסף מסמך ספק">
        <p className="text-sm text-gray-500 mb-4">מה סוג המסמך שברצונך לקלוט?</p>
        <div className="grid grid-cols-2 gap-3">
          {cards.map(card => (
            <button
              key={card.id}
              onClick={() => {
                setUserCard(card.id);
                setDocType(USER_CARD_DEFAULT_TYPE[card.id]);
                setMode("choose");
              }}
              className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl transition-colors text-center ${card.color}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColors[card.id]}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={card.iconPath} />
                </svg>
              </div>
              <p className="font-semibold text-sm text-gray-900">{USER_CARD_LABELS[card.id]}</p>
              <p className="text-xs text-gray-500 leading-snug">{USER_CARD_DESCRIPTIONS[card.id]}</p>
            </button>
          ))}
        </div>
      </ModalShell>
    );
  }

  // ── Camera processing screen ──────────────────────────────────────────────
  if (mode === "camera") {
    return (
      <ModalShell onClose={onClose} title="מעבד מסמך">
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm font-semibold text-gray-800">מעבד מסמך...</p>
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            מזהה טקסט ומכין טיוטה לבדיקה.<br />
            אנא המתן — תהליך זה עשוי לקחת עד 30 שניות.
          </p>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 text-center">
              {error}
              <br />
              <button onClick={() => { setError(""); setMode("choose"); }} className="text-blue-600 underline mt-1">
                חזור
              </button>
            </div>
          )}
        </div>
      </ModalShell>
    );
  }

  // ── Mode chooser ──────────────────────────────────────────────────────────
  if (mode === "choose") {
    return (
      <ModalShell onClose={onClose} title="הוסף מסמך ספק" onBack={() => setMode("type-select")}>
        {userCard && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-gray-500">סוג נבחר:</span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              {USER_CARD_LABELS[userCard]}
            </span>
          </div>
        )}
        <p className="text-sm text-gray-500 mb-4">בחר אופן הזנת המסמך</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setMode("upload")}
            className="w-full flex items-center gap-4 p-4 border-2 border-dashed border-blue-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors text-right"
          >
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">העלאת קובץ</p>
              <p className="text-xs text-gray-500">PDF, JPEG, PNG, HEIC — עד 20MB</p>
            </div>
          </button>
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="w-full flex items-center gap-4 p-4 border-2 border-dashed border-green-300 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors text-right"
          >
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">צלם מסמך</p>
              <p className="text-xs text-gray-500">iPhone / Android — זיהוי טקסט אוטומטי</p>
            </div>
          </button>
          <button
            onClick={() => setMode("manual")}
            className="w-full flex items-center gap-4 p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors text-right"
          >
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">הזנה ידנית</p>
              <p className="text-xs text-gray-500">הזן שדות ידנית ללא קובץ</p>
            </div>
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleCameraCapture(f);
          }}
        />
      </ModalShell>
    );
  }

  // ── Upload mode ───────────────────────────────────────────────────────────
  if (mode === "upload") {
    return (
      <ModalShell onClose={onClose} title="העלאת מסמך ספק" onBack={() => setMode("choose")}>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) setSelectedFile(f);
          }}
        >
          <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {selectedFile ? (
            <p className="text-sm font-medium text-blue-700">{selectedFile.name}</p>
          ) : (
            <>
              <p className="text-sm text-gray-600">גרור קובץ לכאן או לחץ לבחירה</p>
              <p className="text-xs text-gray-400 mt-1">PDF, JPEG, PNG, WEBP, HEIC — עד 20MB</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff,.heic,.heif"
            className="hidden"
            onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {error && <p className="text-xs text-red-600 mt-2 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
          >
            {uploading ? "מעבד מסמך..." : "העלה מסמך"}
          </button>
          <button onClick={onClose} disabled={uploading} className="px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">ביטול</button>
        </div>
      </ModalShell>
    );
  }

  // ── Manual entry mode ─────────────────────────────────────────────────────
  return (
    <ModalShell onClose={onClose} title="הזנה ידנית — מסמך ספק" onBack={() => setMode("choose")} wide>
      <div className="space-y-4">
        {/* Row 1: doc type + supplier */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="סוג מסמך">
            <select className={SELECT} value={docType} onChange={e => setDocType(e.target.value as SupplierDocumentType)}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="ספק">
            <select className={SELECT} value={supplierId} onChange={e => {
              setSupplierId(e.target.value);
              const s = suppliers.find(x => x.id === e.target.value);
              if (s) setSupplierNameRaw(s.name);
            }}>
              <option value="">— בחר ספק קיים —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="שם ספק (כפי שמופיע במסמך)">
            <input className={INPUT} value={supplierNameRaw} onChange={e => setSupplierNameRaw(e.target.value)} placeholder="שם הספק" />
          </Field>
          <Field label="ח.פ / ע.מ">
            <input className={INPUT} value={supplierVatRaw} onChange={e => setSupplierVatRaw(e.target.value)} placeholder="מספר עוסק" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="מספר מסמך">
            <input className={INPUT} value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} placeholder="מס׳ חשבונית / תעודה" />
          </Field>
          <Field label="תאריך מסמך">
            <input type="date" className={INPUT} value={documentDate} onChange={e => setDocumentDate(e.target.value)} />
          </Field>
          <Field label="תאריך פירעון">
            <input type="date" className={INPUT} value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Field label="מטבע">
            <select className={SELECT} value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="סה״כ לפני מע״מ">
            <input type="number" className={INPUT} value={subtotal} onChange={e => setSubtotal(e.target.value)} placeholder="0.00" min={0} />
          </Field>
          <Field label="מע״מ">
            <input type="number" className={INPUT} value={vatAmount} onChange={e => setVatAmount(e.target.value)} placeholder="0.00" min={0} />
          </Field>
          <Field label="סה״כ כולל מע״מ">
            <input type="number" className={INPUT} value={totalAfterVat} onChange={e => setTotalAfterVat(e.target.value)} placeholder="0.00" min={0} />
          </Field>
        </div>
        <Field label="הערות">
          <input className={INPUT} value={notes} onChange={e => setNotes(e.target.value)} placeholder="הערות כלליות" />
        </Field>

        {/* Lines */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">שורות מסמך</p>
            <button onClick={addLine} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ הוסף שורה</button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {lines.map((line, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="grid grid-cols-6 gap-2 mb-2">
                  <div className="col-span-2">
                    <input
                      className={INPUT}
                      placeholder="תיאור"
                      value={line.originalDescription}
                      onChange={e => updateLine(idx, "originalDescription", e.target.value)}
                    />
                  </div>
                  <input className={INPUT} placeholder="מק״ט" value={line.supplierSku} onChange={e => updateLine(idx, "supplierSku", e.target.value)} />
                  <input type="number" className={INPUT} placeholder="כמות" value={line.quantity} onChange={e => updateLine(idx, "quantity", e.target.value)} min={0} />
                  <input className={INPUT} placeholder="יחידה" value={line.unitOfMeasure} onChange={e => updateLine(idx, "unitOfMeasure", e.target.value)} />
                  <input type="number" className={INPUT} placeholder="מחיר יחידה" value={line.unitPrice} onChange={e => updateLine(idx, "unitPrice", e.target.value)} min={0} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select className={SELECT} value={line.category} onChange={e => updateLine(idx, "category", e.target.value)}>
                    <option value="">— קטגוריה —</option>
                    {DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className={SELECT} value={line.inventoryAction} onChange={e => updateLine(idx, "inventoryAction", e.target.value)}>
                    {Object.entries(INVENTORY_ACTION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button onClick={() => removeLine(idx)} className="text-xs text-red-500 hover:text-red-700">מחק שורה</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleManualSave}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white"
        >
          {saving ? "שומר..." : "שמור טיוטה"}
        </button>
        <button onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">ביטול</button>
      </div>
    </ModalShell>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const INPUT = "w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300";
const SELECT = "w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-300";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ModalShell({
  children,
  title,
  onClose,
  onBack,
  wide,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  onBack?: () => void;
  wide?: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4`}>
        <div
          className={`bg-white rounded-2xl shadow-2xl ${wide ? "w-full max-w-3xl" : "w-full max-w-md"} max-h-[90dvh] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]`}
          dir="rtl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 p-5 border-b border-gray-100">
            {onBack && (
              <button onClick={onBack} className="text-gray-400 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <p className="text-base font-bold text-gray-900 flex-1">{title}</p>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </>
  );
}
