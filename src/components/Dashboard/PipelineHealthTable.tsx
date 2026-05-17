"use client";

import type { PipelineStageKPI } from "./useDashboardKPIs";

interface Props {
  stages: PipelineStageKPI[];
  bottleneck: string | null;
  onStageClick: (label: string, status: string) => void;
}

function CountCell({ n, type }: { n: number; type: "green" | "yellow" | "red" }) {
  if (n === 0) return <td className="px-3 py-2 text-center text-xs text-gray-300 tabular-nums">—</td>;
  const colors = {
    green:  "text-emerald-600 font-semibold",
    yellow: "text-amber-600 font-semibold",
    red:    "text-red-600 font-bold",
  };
  return (
    <td className={`px-3 py-2 text-center text-sm tabular-nums ${colors[type]}`}>{n}</td>
  );
}

export function PipelineHealthTable({ stages, bottleneck, onStageClick }: Props) {
  const hasOrders = stages.some(s => s.count > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">בריאות צנרת</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">מצב SLA לפי שלב · לחץ לקידוח</p>
        </div>
        {bottleneck && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            עומס: {bottleneck}
          </span>
        )}
      </div>
      {!hasOrders ? (
        <div className="px-4 py-8 text-center text-xs text-gray-400">אין הזמנות פעילות בצנרת</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide">שלב</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">תקין</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-amber-600 uppercase tracking-wide">בינוני</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-red-600 uppercase tracking-wide">קריטי</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide">סה״כ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stages.map((stage) => {
                const isBottleneck = bottleneck === stage.label;
                return (
                  <tr
                    key={stage.status}
                    onClick={() => onStageClick(stage.label, stage.status)}
                    className={`
                      cursor-pointer transition-colors hover:bg-gray-50
                      ${isBottleneck ? "bg-amber-50/60 border-r-2 border-r-amber-400" : ""}
                      ${stage.count === 0 ? "opacity-40" : ""}
                    `}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-800">{stage.label}</span>
                        {isBottleneck && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">עומס</span>
                        )}
                      </div>
                    </td>
                    <CountCell n={stage.greenCount} type="green" />
                    <CountCell n={stage.yellowCount} type="yellow" />
                    <CountCell n={stage.redCount} type="red" />
                    <td className="px-3 py-2 text-center text-sm font-semibold text-gray-700 tabular-nums">
                      {stage.count > 0 ? stage.count : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
