"use client";

import { Search, X } from "lucide-react";
import {
  EQUIPMENT_CATEGORY_ORDER, EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS,
  type EquipmentCategory, type EquipmentStatus,
} from "@/types/equipment";

export interface FleetFilterState {
  search: string;
  category: EquipmentCategory | "all";
  status: EquipmentStatus | "all";
  onlyOpenFaults: boolean;
  onlyUpcomingMaintenance: boolean;
  onlyUpcomingInspection: boolean;
  onlyUnidentified: boolean;
}

export const EMPTY_FILTERS: FleetFilterState = {
  search: "",
  category: "all",
  status: "all",
  onlyOpenFaults: false,
  onlyUpcomingMaintenance: false,
  onlyUpcomingInspection: false,
  onlyUnidentified: false,
};

const STATUS_ORDER: EquipmentStatus[] = ["active", "pending_approval", "in_repair", "unserviceable"];

const TOGGLES: { key: keyof FleetFilterState; label: string }[] = [
  { key: "onlyOpenFaults",          label: "תקלות פתוחות" },
  { key: "onlyUpcomingMaintenance", label: "טיפול קרוב" },
  { key: "onlyUpcomingInspection",  label: "טסט קרוב" },
  { key: "onlyUnidentified",        label: "ציוד לא מזוהה" },
];

export function FleetFilters({
  filters, onChange,
}: {
  filters: FleetFilterState;
  onChange: (next: FleetFilterState) => void;
}) {
  const set = <K extends keyof FleetFilterState>(key: K, value: FleetFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  const hasActive =
    filters.search !== "" || filters.category !== "all" || filters.status !== "all" ||
    filters.onlyOpenFaults || filters.onlyUpcomingMaintenance ||
    filters.onlyUpcomingInspection || filters.onlyUnidentified;

  return (
    <div className="glass-card p-3 flex flex-col gap-3" dir="rtl">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.search}
            onChange={e => set("search", e.target.value)}
            placeholder="חיפוש: שם, מספר רישוי, מספר סידורי, יצרן/דגם"
            className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-ek-blue/40"
          />
        </div>
        <select
          value={filters.category}
          onChange={e => set("category", e.target.value as FleetFilterState["category"])}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
        >
          <option value="all">כל הקטגוריות</option>
          {EQUIPMENT_CATEGORY_ORDER.map(c => (
            <option key={c} value={c}>{EQUIPMENT_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={e => set("status", e.target.value as FleetFilterState["status"])}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
        >
          <option value="all">כל הסטטוסים</option>
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>{EQUIPMENT_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TOGGLES.map(t => {
          const active = filters[t.key] as boolean;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => set(t.key, !active as never)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? "bg-ek-blue text-white border-ek-blue"
                  : "bg-white text-slate-600 border-slate-200 hover:border-ek-blue/50"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        {hasActive && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="px-2.5 py-1.5 rounded-full text-xs text-slate-500 hover:text-red-600 flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> נקה
          </button>
        )}
      </div>
    </div>
  );
}
