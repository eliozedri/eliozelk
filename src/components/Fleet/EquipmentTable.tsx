"use client";

import { AlertTriangle } from "lucide-react";
import {
  EQUIPMENT_CATEGORY_LABELS, EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_COLORS,
  type Equipment,
} from "@/types/equipment";

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("he-IL") : "—";
}

export function EquipmentTable({
  equipment, openIncidentsByAsset, onOpen,
}: {
  equipment: Equipment[];
  openIncidentsByAsset: Record<string, number>;
  onOpen: (e: Equipment) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto" dir="rtl">
      <table className="w-full text-sm text-right min-w-[760px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
            <th className="px-3 py-2 font-semibold">שם הכלי</th>
            <th className="px-3 py-2 font-semibold">קטגוריה</th>
            <th className="px-3 py-2 font-semibold">רישוי / סידורי</th>
            <th className="px-3 py-2 font-semibold">סטטוס</th>
            <th className="px-3 py-2 font-semibold">טיפול הבא</th>
            <th className="px-3 py-2 font-semibold">טסט</th>
            <th className="px-3 py-2 font-semibold">תקלות</th>
          </tr>
        </thead>
        <tbody>
          {equipment.map(e => (
            <tr
              key={e.id}
              onClick={() => onOpen(e)}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
            >
              <td className="px-3 py-2 font-medium text-navy-900">{e.display_name}</td>
              <td className="px-3 py-2 text-slate-500">{EQUIPMENT_CATEGORY_LABELS[e.category_key] ?? e.category_key}</td>
              <td className="px-3 py-2 text-slate-500">{e.license_number || e.serial_number || "—"}</td>
              <td className="px-3 py-2">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${EQUIPMENT_STATUS_COLORS[e.status]}`}>
                  {EQUIPMENT_STATUS_LABELS[e.status]}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-500">{fmt(e.next_maintenance_date)}</td>
              <td className="px-3 py-2 text-slate-500">{fmt(e.next_inspection_date)}</td>
              <td className="px-3 py-2">
                {(openIncidentsByAsset[e.id] ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" /> {openIncidentsByAsset[e.id]}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
