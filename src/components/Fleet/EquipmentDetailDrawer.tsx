"use client";

import { useEffect, useState } from "react";
import { X, Pencil, Trash2, Truck } from "lucide-react";
import {
  EQUIPMENT_CATEGORY_LABELS, EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_COLORS,
  IDENTIFICATION_CONFIDENCE_LABELS, IDENTIFICATION_CONFIDENCE_COLORS,
  VEHICLE_CATEGORIES,
  type Equipment,
} from "@/types/equipment";
import { PhotoUploader } from "./PhotoUploader";
import { MaintenancePanel } from "./panels/MaintenancePanel";
import { IncidentsPanel } from "./panels/IncidentsPanel";
import { TasksPanel } from "./panels/TasksPanel";
import { DocumentsPanel } from "./panels/DocumentsPanel";
import { FinancePanel } from "./panels/FinancePanel";

type TabKey = "overview" | "technical" | "maintenance" | "incidents" | "documents" | "finance" | "tasks";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview",    label: "סקירה כללית" },
  { key: "technical",   label: "פרטים טכניים" },
  { key: "maintenance", label: "טיפולים" },
  { key: "incidents",   label: "תקלות ואירועים" },
  { key: "documents",   label: "מסמכים" },
  { key: "finance",     label: "כספים" },
  { key: "tasks",       label: "תזכורות" },
];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className="text-sm text-navy-900">{value}</span>
    </div>
  );
}

function fmt(d: string | null): string | null {
  return d ? new Date(d).toLocaleDateString("he-IL") : null;
}

export function EquipmentDetailDrawer({
  equipment, canManage, onClose, onEdit, onPatchLocal, onDelete,
}: {
  equipment: Equipment;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onPatchLocal: (id: string, patch: Partial<Equipment>) => void;
  onDelete: (id: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [local, setLocal] = useState<Equipment>(equipment);
  useEffect(() => { setLocal(equipment); }, [equipment]);

  const e = local;
  const isVehicle = VEHICLE_CATEGORIES.has(e.category_key);
  const specs = e.technical_specs ?? {};

  return (
    <div className="fixed inset-0 z-50 flex justify-start" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative bg-surface w-full sm:w-[560px] max-w-full h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-navy-900 text-white p-4 sticky top-0 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
                {e.photos?.[0]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={e.photos[0]} alt="" className="w-full h-full object-cover" />
                  : <Truck className="w-7 h-7 text-white/50" />}
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base leading-tight">{e.display_name}</h2>
                <div className="text-xs text-white/60 mt-0.5">{EQUIPMENT_CATEGORY_LABELS[e.category_key] ?? e.category_key}</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${EQUIPMENT_STATUS_COLORS[e.status]}`}>{EQUIPMENT_STATUS_LABELS[e.status]}</span>
                  {e.identification_confidence !== "confirmed" && (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${IDENTIFICATION_CONFIDENCE_COLORS[e.identification_confidence]}`}>{IDENTIFICATION_CONFIDENCE_LABELS[e.identification_confidence]}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canManage && <button onClick={onEdit} className="p-2 rounded-lg hover:bg-white/10" title="עריכה"><Pencil className="w-4 h-4" /></button>}
              {canManage && <button onClick={() => onDelete(e.id)} className="p-2 rounded-lg hover:bg-white/10" title="מחיקה"><Trash2 className="w-4 h-4" /></button>}
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" title="סגור"><X className="w-5 h-5" /></button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-3 overflow-x-auto border-b border-slate-200 bg-white sticky top-[88px] z-10">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm whitespace-nowrap rounded-t-lg border-b-2 transition-colors ${
                tab === t.key ? "border-ek-blue text-ek-blue font-semibold" : "border-transparent text-slate-500 hover:text-navy-900"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4 flex-1">
          {tab === "overview" && (
            <div className="flex flex-col gap-4">
              {canManage && (
                <PhotoUploader
                  equipmentId={e.id}
                  photos={e.photos ?? []}
                  canManage={canManage}
                  onChange={photos => { setLocal({ ...e, photos }); onPatchLocal(e.id, { photos }); }}
                />
              )}
              {e.status === "unserviceable" && e.out_of_service_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  <span className="font-semibold">סיבת אי-שימוש: </span>{e.out_of_service_reason}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 glass-card p-3">
                <Field label="מזהה פנימי" value={e.id} />
                <Field label="יצרן" value={e.manufacturer} />
                <Field label="דגם" value={e.model} />
                <Field label="שנת ייצור" value={e.year} />
                <Field label="מספר רישוי" value={e.license_number} />
                <Field label="מספר סידורי" value={e.serial_number} />
                <Field label="מיקום נוכחי" value={e.current_location} />
                <Field label="טיפול אחרון" value={fmt(e.last_maintenance_date)} />
                <Field label="טיפול הבא" value={fmt(e.next_maintenance_date)} />
                <Field label="טסט הבא" value={fmt(e.next_inspection_date)} />
                <Field label="ביטוח" value={fmt(e.next_insurance_date)} />
                <Field label="תוקף רישיון" value={fmt(e.license_expiry_date)} />
              </div>
              {e.business_use && (
                <div className="glass-card p-3">
                  <Field label="תיאור שימוש עסקי" value={e.business_use} />
                </div>
              )}
              {e.notes && (
                <div className="glass-card p-3">
                  <Field label="הערות" value={e.notes} />
                </div>
              )}
            </div>
          )}

          {tab === "technical" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 glass-card p-3">
                <Field label="סוג כלי" value={e.equipment_type} />
                <Field label="יצרן" value={e.manufacturer} />
                <Field label="דגם" value={e.model} />
                <Field label="שנת ייצור" value={e.year} />
                {isVehicle ? (
                  <>
                    <Field label="מספר רישוי" value={e.license_number} />
                    <Field label="מספר שלדה" value={e.chassis_number} />
                    <Field label="מספר מנוע" value={e.engine_number} />
                    <Field label="קילומטראז'" value={e.mileage != null ? e.mileage.toLocaleString() : null} />
                    <Field label="תוקף רישיון" value={fmt(e.license_expiry_date)} />
                  </>
                ) : (
                  <Field label="מספר סידורי" value={e.serial_number} />
                )}
              </div>
              {Object.keys(specs).length > 0 && (
                <div className="glass-card p-3">
                  <div className="text-[11px] text-slate-400 mb-2">נתונים טכניים</div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(specs).map(([k, v]) => (
                      <Field key={k} label={k} value={String(v)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "maintenance" && <MaintenancePanel equipmentId={e.id} canManage={canManage} />}
          {tab === "incidents" && <IncidentsPanel equipmentId={e.id} canManage={canManage} />}
          {tab === "tasks" && <TasksPanel equipmentId={e.id} canManage={canManage} />}
          {tab === "documents" && (
            <DocumentsPanel
              equipmentId={e.id}
              documents={(e.documents as unknown as { type: string; label: string; url: string; storage_path: string; expiry_date?: string }[]) ?? []}
              canManage={canManage}
              onChange={docs => { setLocal({ ...e, documents: docs as unknown as Equipment["documents"] }); onPatchLocal(e.id, { documents: docs as unknown as Equipment["documents"] }); }}
            />
          )}
          {tab === "finance" && <FinancePanel equipmentId={e.id} canManage={canManage} />}
        </div>
      </aside>
    </div>
  );
}
