"use client";

import { Truck, AlertTriangle, ImageOff, CalendarClock, ClipboardCheck } from "lucide-react";
import {
  EQUIPMENT_CATEGORY_LABELS, EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_COLORS,
  type Equipment,
} from "@/types/equipment";
import { daysUntil, isInspectionDueSoon, isMaintenanceDueSoon } from "./fleetUtils";

function DateLine({ icon, label, dateStr, soon }: { icon: React.ReactNode; label: string; dateStr: string | null; soon: boolean }) {
  if (!dateStr) return null;
  const d = daysUntil(dateStr);
  const overdue = d !== null && d < 0;
  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${overdue ? "text-red-600 font-semibold" : soon ? "text-amber-600" : "text-slate-500"}`}>
      {icon}
      <span>{label}: {new Date(dateStr).toLocaleDateString("he-IL")}</span>
      {overdue && <span className="font-bold">(עבר!)</span>}
    </div>
  );
}

export function EquipmentCard({
  equipment, openFaults, onOpen,
}: {
  equipment: Equipment;
  openFaults: number;
  onOpen: () => void;
}) {
  const e = equipment;
  const photo = e.photos?.[0];
  const missingData = e.identification_confidence !== "confirmed";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-right bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-ek-blue/40 transition-all flex flex-col"
      dir="rtl"
    >
      {/* Photo */}
      <div className="relative h-36 bg-slate-100 flex items-center justify-center">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={e.display_name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center text-slate-300">
            <Truck className="w-10 h-10" />
            <ImageOff className="w-4 h-4 mt-1" />
          </div>
        )}
        <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-semibold ${EQUIPMENT_STATUS_COLORS[e.status]}`}>
          {EQUIPMENT_STATUS_LABELS[e.status]}
        </span>
        {openFaults > 0 && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-600 text-white flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {openFaults}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-sm text-navy-900 leading-tight line-clamp-2">{e.display_name}</h3>
        </div>
        <div className="text-[11px] text-slate-500">{EQUIPMENT_CATEGORY_LABELS[e.category_key] ?? e.category_key}</div>
        <div className="text-[11px] text-slate-400 truncate">
          {e.license_number ? `רישוי: ${e.license_number}` : e.serial_number ? `סידורי: ${e.serial_number}` : e.id}
        </div>

        <div className="mt-1 flex flex-col gap-1">
          <DateLine icon={<CalendarClock className="w-3 h-3" />} label="טיפול הבא" dateStr={e.next_maintenance_date} soon={isMaintenanceDueSoon(e)} />
          <DateLine icon={<ClipboardCheck className="w-3 h-3" />} label="טסט" dateStr={e.next_inspection_date} soon={isInspectionDueSoon(e)} />
        </div>

        {missingData && (
          <span className="mt-auto inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
            <AlertTriangle className="w-3 h-3" /> חסרים פרטים
          </span>
        )}
      </div>
    </button>
  );
}
