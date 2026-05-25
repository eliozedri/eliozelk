"use client";

interface Props {
  activeCrews: number;
  totalCapacityHoursPerWeek: number;
  scheduledHoursThisWeek: number;
  capacityUtilizationPct: number;
}

export function CrewCapacityPanel({
  activeCrews,
  totalCapacityHoursPerWeek,
  scheduledHoursThisWeek,
  capacityUtilizationPct,
}: Props) {
  const barColor =
    capacityUtilizationPct > 90 ? "bg-red-500" :
    capacityUtilizationPct > 70 ? "bg-amber-400" :
    "bg-emerald-400";
  const pctColor =
    capacityUtilizationPct > 90 ? "text-red-600" :
    capacityUtilizationPct > 70 ? "text-amber-600" :
    "text-emerald-600";
  const barWidth = Math.min(100, capacityUtilizationPct);

  return (
    <div className="glass-card overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">כושר ייצור שבועי</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">ניצולת צוותי שדה</p>
      </div>
      <div className="flex-1 px-4 py-4 flex flex-col justify-between gap-3">
        <div className="flex flex-col items-center gap-1">
          <p className={`text-4xl font-black tabular-nums ${pctColor}`}>{capacityUtilizationPct}%</p>
          <p className="text-[11px] text-gray-500 font-medium">ניצולת השבוע</p>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>0%</span>
            <span>100%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-bold text-gray-800 tabular-nums">{scheduledHoursThisWeek}</p>
            <p className="text-[10px] text-gray-400">שעות משובצות</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-bold text-gray-800 tabular-nums">{totalCapacityHoursPerWeek}</p>
            <p className="text-[10px] text-gray-400">קיבולת שבועית</p>
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">{activeCrews} צוותים פעילים</p>
        </div>
      </div>
    </div>
  );
}
