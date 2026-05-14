"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useOrdersContext } from "@/context/OrdersContext";
import { useCrewsContext } from "@/context/CrewsContext";
import type { WorkOrder } from "@/types/workOrder";
import { getSlaColor, SLA_COLORS, type SlaColor } from "@/lib/slaUtils";
import { extractCityCoordinates } from "@/lib/cityCoordinates";

const LOADING_PLACEHOLDER = (
  <div className="flex items-center justify-center h-full text-gray-400 text-sm bg-gray-100 rounded-xl">
    טוען מפה...
  </div>
);

// Load Leaflet map only on the client — it requires window/document
const IsraelMap = dynamic(() => import("./IsraelMap"), { ssr: false, loading: () => LOADING_PLACEHOLDER });

// Google Maps variant — loaded when API key is configured
const IsraelMapGoogle = dynamic(() => import("./IsraelMapGoogle"), { ssr: false, loading: () => LOADING_PLACEHOLDER });

// ── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  value: number;
  label: string;
  dotColor: string;
  onClick?: () => void;
  active?: boolean;
}

function KpiCard({ value, label, dotColor, onClick, active }: KpiCardProps) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-2 text-right w-full transition-colors ${
        active ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <span className="text-xs text-gray-500 truncate">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
    </button>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-wrap gap-4 text-xs">
      <span className="text-gray-500 font-semibold self-center">מקרא:</span>
      {(["green", "yellow", "red", "gray"] as SlaColor[]).map((color) => {
        const info = SLA_COLORS[color];
        return (
          <div key={color} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${info.dot}`} />
            <span className={info.text}>{info.label}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full bg-gray-400 ring-2 ring-blue-500 ring-offset-0" />
        <span className="text-gray-500">משובץ לצוות</span>
      </div>
    </div>
  );
}

// ── Filter Bar ───────────────────────────────────────────────────────────────

interface FiltersProps {
  slaFilter: SlaColor | "all";
  setSlaFilter: (v: SlaColor | "all") => void;
  showScheduled: boolean;
  setShowScheduled: (v: boolean) => void;
  showNonReady: boolean;
  setShowNonReady: (v: boolean) => void;
  totalShown: number;
}

function FilterBar({ slaFilter, setSlaFilter, showScheduled, setShowScheduled, showNonReady, setShowNonReady, totalShown }: FiltersProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold text-gray-500">סינון לפי SLA:</span>
      {(["all", "red", "yellow", "green", "gray"] as const).map((v) => {
        const label = v === "all" ? "הכל" : SLA_COLORS[v].label;
        const dotClass = v === "all" ? "bg-gray-400" : SLA_COLORS[v].dot;
        return (
          <button
            key={v}
            onClick={() => setSlaFilter(v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              slaFilter === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {v !== "all" && <div className={`w-2 h-2 rounded-full ${slaFilter === v ? "bg-white" : dotClass}`} />}
            {label}
          </button>
        );
      })}

      <div className="mr-auto flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showScheduled}
            onChange={(e) => setShowScheduled(e.target.checked)}
            className="w-3.5 h-3.5 accent-blue-600"
          />
          הצג משובצים
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showNonReady}
            onChange={(e) => setShowNonReady(e.target.checked)}
            className="w-3.5 h-3.5 accent-blue-600"
          />
          הצג לא מוכנים
        </label>
        <span className="text-xs text-gray-400">{totalShown} עבודות מוצגות</span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function WorkMap() {
  const { orders } = useOrdersContext();
  const { crews } = useCrewsContext();

  const [slaFilter, setSlaFilter] = useState<SlaColor | "all">("all");
  const [showScheduled, setShowScheduled] = useState(true);
  const [showNonReady, setShowNonReady] = useState(false);

  // Only show non-terminal orders that have a map position
  const mappableOrders = useMemo(() => {
    return orders.filter(
      (o) => o.status !== "completed" && o.status !== "cancelled" && extractCityCoordinates(o.city || o.location || "")
    );
  }, [orders]);

  // KPI counts (over ALL active, not just filtered)
  const kpi = useMemo(() => {
    const ready = mappableOrders.filter((o) => o.status === "ready_installation");
    return {
      total: mappableOrders.length,
      green: ready.filter((o) => getSlaColor(o.readyForExecutionAt) === "green").length,
      yellow: ready.filter((o) => getSlaColor(o.readyForExecutionAt) === "yellow").length,
      red: ready.filter((o) => getSlaColor(o.readyForExecutionAt) === "red").length,
      unscheduled: ready.filter((o) => !o.scheduledDate).length,
      scheduled: ready.filter((o) => !!o.scheduledDate).length,
    };
  }, [mappableOrders]);

  // Filtered orders shown on map
  const visibleOrders = useMemo<WorkOrder[]>(() => {
    return mappableOrders.filter((o) => {
      const isReady = o.status === "ready_installation";
      if (!isReady && !showNonReady) return false;
      if (isReady && !showScheduled && o.scheduledDate) return false;
      if (slaFilter !== "all") {
        if (!isReady) return slaFilter === "gray";
        return getSlaColor(o.readyForExecutionAt) === slaFilter;
      }
      return true;
    });
  }, [mappableOrders, slaFilter, showScheduled, showNonReady]);

  const totalEstHours = useMemo(() =>
    visibleOrders.reduce((sum, o) => sum + (o.estimatedExecutionHours ?? 0), 0),
    [visibleOrders]
  );

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4 flex flex-col gap-4">
      <div className="max-w-[1400px] mx-auto w-full space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">מפת עבודות</h1>
            <p className="text-sm text-gray-500 mt-0.5">בקרת עבודות ארצית — {crews.length} צוותים פעילים</p>
          </div>
          {totalEstHours > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-2 text-sm">
              <span className="text-gray-500">סה״כ שעות מוצגות: </span>
              <span className="font-bold text-gray-900">{totalEstHours.toFixed(1)} שע׳</span>
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard value={kpi.total} label="עבודות פעילות" dotColor="bg-gray-400" onClick={() => { setSlaFilter("all"); setShowNonReady(true); }} active={slaFilter === "all" && showNonReady} />
          <KpiCard value={kpi.green} label="מוכן (עד 24 שע׳)" dotColor="bg-green-500" onClick={() => { setSlaFilter("green"); setShowNonReady(false); }} active={slaFilter === "green"} />
          <KpiCard value={kpi.yellow} label="מתעכב (1–3 ימים)" dotColor="bg-amber-500" onClick={() => { setSlaFilter("yellow"); setShowNonReady(false); }} active={slaFilter === "yellow"} />
          <KpiCard value={kpi.red} label="דחוף (מעל 3 ימים)" dotColor="bg-red-500" onClick={() => { setSlaFilter("red"); setShowNonReady(false); }} active={slaFilter === "red"} />
          <KpiCard value={kpi.unscheduled} label="לא משובצים" dotColor="bg-orange-400" onClick={() => { setSlaFilter("all"); setShowScheduled(false); setShowNonReady(false); }} active={!showScheduled} />
          <KpiCard value={kpi.scheduled} label="משובצים" dotColor="bg-blue-400" onClick={() => { setSlaFilter("all"); setShowScheduled(true); setShowNonReady(false); }} active={slaFilter === "all" && showScheduled && !showNonReady} />
        </div>

        {/* Filter Bar */}
        <FilterBar
          slaFilter={slaFilter}
          setSlaFilter={setSlaFilter}
          showScheduled={showScheduled}
          setShowScheduled={setShowScheduled}
          showNonReady={showNonReady}
          setShowNonReady={setShowNonReady}
          totalShown={visibleOrders.length}
        />

        {/* Legend */}
        <Legend />

        {/* Map */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" style={{ height: "600px" }}>
          {visibleOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <div className="text-4xl">🗺️</div>
              <p className="text-sm font-medium">אין עבודות להצגה בפילטרים הנוכחיים</p>
              <p className="text-xs">שנה את הסינון או ודא שלהזמנות יש שדה מיקום תקין</p>
            </div>
          ) : process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            ? <IsraelMapGoogle orders={visibleOrders} />
            : <IsraelMap orders={visibleOrders} />
          }
        </div>

        {/* Unmappable notice */}
        {(() => {
          const unmappable = orders.filter(
            (o) => o.status === "ready_installation" && !extractCityCoordinates(o.city || o.location || "")
          );
          if (unmappable.length === 0) return null;
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <span className="font-bold">{unmappable.length} הזמנות מוכנות</span> לא מוצגות במפה כי שדה המיקום שלהן לא כולל שם עיר מוכר.
              עדכן את שדה ה״עיר״ בהזמנה כדי שתופיע במפה.
            </div>
          );
        })()}

      </div>
    </div>
  );
}
