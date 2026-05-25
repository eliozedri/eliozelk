"use client";

import { Truck, CheckCircle2, Wrench, AlertTriangle, CalendarClock, ClipboardCheck } from "lucide-react";
import type { FleetKpis } from "./fleetUtils";

interface KpiDef {
  key: keyof FleetKpis;
  label: string;
  icon: React.ReactNode;
  tone: string;
}

const KPIS: KpiDef[] = [
  { key: "total",               label: 'סה"כ כלים',      icon: <Truck className="w-4 h-4" />,         tone: "text-navy-900 bg-slate-100" },
  { key: "active",              label: "פעילים",         icon: <CheckCircle2 className="w-4 h-4" />,   tone: "text-green-700 bg-green-100" },
  { key: "inRepair",            label: "בשיפוץ",         icon: <Wrench className="w-4 h-4" />,         tone: "text-orange-700 bg-orange-100" },
  { key: "openFaults",          label: "תקלות פתוחות",   icon: <AlertTriangle className="w-4 h-4" />,  tone: "text-red-700 bg-red-100" },
  { key: "upcomingMaintenance", label: "טיפולים קרובים", icon: <CalendarClock className="w-4 h-4" />,  tone: "text-amber-700 bg-amber-100" },
  { key: "upcomingInspection",  label: "טסטים קרובים",   icon: <ClipboardCheck className="w-4 h-4" />, tone: "text-blue-700 bg-blue-100" },
];

export function FleetKpiRow({ kpis }: { kpis: FleetKpis }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {KPIS.map(k => (
        <div key={k.key} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${k.tone}`}>{k.icon}</span>
          <div className="min-w-0">
            <div className="text-xl font-bold text-navy-900 leading-none">{kpis[k.key]}</div>
            <div className="text-[11px] text-slate-500 truncate mt-1">{k.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
