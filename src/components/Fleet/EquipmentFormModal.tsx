"use client";

import { useState } from "react";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import {
  EQUIPMENT_CATEGORY_ORDER, EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS, IDENTIFICATION_CONFIDENCE_LABELS,
  VEHICLE_CATEGORIES,
  type Equipment, type EquipmentCategory, type EquipmentStatus, type IdentificationConfidence,
} from "@/types/equipment";

const STATUSES: EquipmentStatus[] = ["active", "pending_approval", "in_repair", "unserviceable"];
const CONFIDENCES: IdentificationConfidence[] = ["confirmed", "partial", "unidentified"];

type SpecRow = { key: string; value: string };

function toSpecRows(specs: Record<string, unknown> | undefined): SpecRow[] {
  if (!specs) return [];
  return Object.entries(specs).map(([key, value]) => ({ key, value: String(value) }));
}

export function EquipmentFormModal({
  initial, onClose, onSubmit,
}: {
  initial: Equipment | null;
  onClose: () => void;
  onSubmit: (payload: Partial<Equipment>) => Promise<void>;
}) {
  const isEdit = !!initial;
  const [f, setF] = useState({
    display_name: initial?.display_name ?? "",
    category_key: (initial?.category_key ?? "trucks") as EquipmentCategory,
    equipment_type: initial?.equipment_type ?? "",
    manufacturer: initial?.manufacturer ?? "",
    model: initial?.model ?? "",
    year: initial?.year != null ? String(initial.year) : "",
    license_number: initial?.license_number ?? "",
    serial_number: initial?.serial_number ?? "",
    chassis_number: initial?.chassis_number ?? "",
    engine_number: initial?.engine_number ?? "",
    mileage: initial?.mileage != null ? String(initial.mileage) : "",
    status: (initial?.status ?? "active") as EquipmentStatus,
    identification_confidence: (initial?.identification_confidence ?? "confirmed") as IdentificationConfidence,
    out_of_service_reason: initial?.out_of_service_reason ?? "",
    current_location: initial?.current_location ?? "",
    business_use: initial?.business_use ?? "",
    next_maintenance_date: initial?.next_maintenance_date ?? "",
    next_inspection_date: initial?.next_inspection_date ?? "",
    next_insurance_date: initial?.next_insurance_date ?? "",
    license_expiry_date: initial?.license_expiry_date ?? "",
    notes: initial?.notes ?? "",
  });
  const [specs, setSpecs] = useState<SpecRow[]>(toSpecRows(initial?.technical_specs));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isVehicle = VEHICLE_CATEGORIES.has(f.category_key);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }));

  async function save() {
    if (!f.display_name.trim()) { setErr("יש להזין שם כלי"); return; }
    setSaving(true); setErr(null);
    try {
      const technical_specs: Record<string, string> = {};
      for (const r of specs) { if (r.key.trim()) technical_specs[r.key.trim()] = r.value; }
      const payload: Partial<Equipment> = {
        display_name: f.display_name.trim(),
        category_key: f.category_key,
        equipment_type: f.equipment_type || null,
        manufacturer: f.manufacturer || null,
        model: f.model || null,
        year: f.year ? Number(f.year) : null,
        license_number: f.license_number || null,
        serial_number: f.serial_number || null,
        chassis_number: f.chassis_number || null,
        engine_number: f.engine_number || null,
        mileage: f.mileage ? Number(f.mileage) : null,
        status: f.status,
        identification_confidence: f.identification_confidence,
        out_of_service_reason: f.status === "unserviceable" ? (f.out_of_service_reason || null) : null,
        current_location: f.current_location || null,
        business_use: f.business_use || null,
        next_maintenance_date: f.next_maintenance_date || null,
        next_inspection_date: f.next_inspection_date || null,
        next_insurance_date: f.next_insurance_date || null,
        license_expiry_date: f.license_expiry_date || null,
        notes: f.notes || null,
        technical_specs,
      };
      await onSubmit(payload);
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "שמירה נכשלה"); }
    finally { setSaving(false); }
  }

  const inputCls = "border border-slate-200 rounded px-2 py-1.5 text-sm w-full";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-navy-900">{isEdit ? "עריכת כלי" : "הוספת כלי חדש"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-xs text-slate-500">שם הכלי *</span>
            <input value={f.display_name} onChange={e => set("display_name", e.target.value)} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">קטגוריה</span>
            <select value={f.category_key} onChange={e => set("category_key", e.target.value as EquipmentCategory)} className={`${inputCls} bg-white`}>
              {EQUIPMENT_CATEGORY_ORDER.map(c => <option key={c} value={c}>{EQUIPMENT_CATEGORY_LABELS[c]}</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">סוג כלי</span>
            <input value={f.equipment_type} onChange={e => set("equipment_type", e.target.value)} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">יצרן</span>
            <input value={f.manufacturer} onChange={e => set("manufacturer", e.target.value)} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">דגם</span>
            <input value={f.model} onChange={e => set("model", e.target.value)} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">שנת ייצור</span>
            <input type="number" value={f.year} onChange={e => set("year", e.target.value)} className={inputCls} /></label>

          {isVehicle ? (
            <>
              <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">מספר רישוי</span>
                <input value={f.license_number} onChange={e => set("license_number", e.target.value)} className={inputCls} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">מספר שלדה</span>
                <input value={f.chassis_number} onChange={e => set("chassis_number", e.target.value)} className={inputCls} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">מספר מנוע</span>
                <input value={f.engine_number} onChange={e => set("engine_number", e.target.value)} className={inputCls} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">קילומטראז'</span>
                <input type="number" value={f.mileage} onChange={e => set("mileage", e.target.value)} className={inputCls} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">תוקף רישיון</span>
                <input type="date" value={f.license_expiry_date} onChange={e => set("license_expiry_date", e.target.value)} className={inputCls} /></label>
            </>
          ) : (
            <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">מספר סידורי</span>
              <input value={f.serial_number} onChange={e => set("serial_number", e.target.value)} className={inputCls} /></label>
          )}

          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">סטטוס</span>
            <select value={f.status} onChange={e => set("status", e.target.value as EquipmentStatus)} className={`${inputCls} bg-white`}>
              {STATUSES.map(s => <option key={s} value={s}>{EQUIPMENT_STATUS_LABELS[s]}</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">רמת זיהוי</span>
            <select value={f.identification_confidence} onChange={e => set("identification_confidence", e.target.value as IdentificationConfidence)} className={`${inputCls} bg-white`}>
              {CONFIDENCES.map(c => <option key={c} value={c}>{IDENTIFICATION_CONFIDENCE_LABELS[c]}</option>)}
            </select></label>

          {f.status === "unserviceable" && (
            <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-xs text-slate-500">סיבת אי-שימוש</span>
              <input value={f.out_of_service_reason} onChange={e => set("out_of_service_reason", e.target.value)} placeholder="מכירה / פירוק / מושבת / ממתין להחלטה" className={inputCls} /></label>
          )}

          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">מיקום נוכחי</span>
            <input value={f.current_location} onChange={e => set("current_location", e.target.value)} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">תיאור שימוש עסקי</span>
            <input value={f.business_use} onChange={e => set("business_use", e.target.value)} className={inputCls} /></label>

          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">טיפול הבא</span>
            <input type="date" value={f.next_maintenance_date} onChange={e => set("next_maintenance_date", e.target.value)} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">טסט הבא</span>
            <input type="date" value={f.next_inspection_date} onChange={e => set("next_inspection_date", e.target.value)} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">ביטוח</span>
            <input type="date" value={f.next_insurance_date} onChange={e => set("next_insurance_date", e.target.value)} className={inputCls} /></label>

          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-xs text-slate-500">הערות</span>
            <textarea value={f.notes} onChange={e => set("notes", e.target.value)} rows={2} className={inputCls} /></label>

          {/* Technical specs editor */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">נתונים טכניים (משקל, הספק, מתח וכו')</span>
              <button type="button" onClick={() => setSpecs([...specs, { key: "", value: "" }])} className="text-xs text-ek-blue flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> שורה</button>
            </div>
            <div className="flex flex-col gap-1.5">
              {specs.map((row, i) => (
                <div key={i} className="flex gap-1.5">
                  <input value={row.key} onChange={e => setSpecs(specs.map((r, j) => j === i ? { ...r, key: e.target.value } : r))} placeholder="מאפיין" className={`${inputCls} flex-1`} />
                  <input value={row.value} onChange={e => setSpecs(specs.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} placeholder="ערך" className={`${inputCls} flex-1`} />
                  <button type="button" onClick={() => setSpecs(specs.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-600 px-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {err && <p className="text-sm text-red-600 px-4">{err}</p>}
        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">ביטול</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-ek-blue text-white rounded-lg flex items-center gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {isEdit ? "שמור שינויים" : "צור כלי"}
          </button>
        </div>
      </div>
    </div>
  );
}
