"use client";

import Link from "next/link";

interface Props {
  activeCrews: number;
  totalCapacityHoursPerWeek: number;
  scheduledHoursThisWeek: number;
  capacityUtilizationPct: number;
}

function CapacityBar({ pct }: { pct: number }) {
  const barColor =
    pct >= 90 ? "bg-red-500" :
    pct >= 70 ? "bg-amber-400" :
    pct >= 30 ? "bg-emerald-500" : "bg-gray-300";
  const textColor =
    pct >= 90 ? "text-red-600" :
    pct >= 70 ? "text-amber-600" : "text-emerald-700";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className={`text-sm font-black tabular-nums w-12 text-right ${textColor}`}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

export function CrewCapacityWidget({
  activeCrews,
  totalCapacityHoursPerWeek,
  scheduledHoursThisWeek,
  capacityUtilizationPct,
}: Props) {
  const available = Math.max(0, totalCapacityHoursPerWeek - scheduledHoursThisWeek);
  const statusLabel =
    capacityUtilizationPct >= 90 ? "עומס קריטי" :
    capacityUtilizationPct >= 70 ? "עמוס" :
    capacityUtilizationPct >= 30 ? "תקין" : "פנוי";
  const statusColor =
    capacityUtilizationPct >= 90 ? "text-red-600 bg-red-50 border-red-100" :
    capacityUtilizationPct >= 70 ? "text-amber-600 bg-amber-50 border-amber-100" :
    capacityUtilizationPct >= 30 ? "text-green-700 bg-green-50 border-green-100" :
                                   "text-gray-500 bg-gray-50 border-gray-100";

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-navy-900">קיבולת צוותים</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">ניצול שבועי</p>
        </div>
        <Link href="/schedule" className="text-xs text-blue-500 hover:underline">
          לוח
        </Link>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">צוותים פעילים</span>
          <span className="text-lg font-black text-navy-900">{activeCrews}</span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">ניצול קיבולת</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
          <CapacityBar pct={capacityUtilizationPct} />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <div className="text-lg font-black text-navy-900">{scheduledHoursThisWeek}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">שעות מתוכננות</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <div className={`text-lg font-black ${available > 0 ? "text-green-700" : "text-red-600"}`}>
              {available}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">שעות פנויות</div>
          </div>
        </div>

        <div className="text-[10px] text-gray-400 text-center">
          סה״כ קיבולת: {totalCapacityHoursPerWeek} שע׳ בשבוע
        </div>
      </div>
    </div>
  );
}
