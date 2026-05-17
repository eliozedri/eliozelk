"use client";

import type { PipelineStageKPI } from "./useDashboardKPIs";

interface Props {
  stages: PipelineStageKPI[];
  bottleneck: string | null;
  onStageClick: (label: string, status: string) => void;
}

function SlaBar({ red, yellow, green }: { red: number; yellow: number; green: number }) {
  const total = red + yellow + green;
  if (total === 0) return null;
  return (
    <div className="flex gap-0.5 h-1 mt-1.5 rounded-full overflow-hidden">
      {red > 0    && <div className="bg-red-400 rounded-full"    style={{ flex: red }} />}
      {yellow > 0 && <div className="bg-amber-400 rounded-full" style={{ flex: yellow }} />}
      {green > 0  && <div className="bg-emerald-400 rounded-full" style={{ flex: green }} />}
    </div>
  );
}

export function PipelineHealth({ stages, bottleneck, onStageClick }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-navy-900">בריאות צנרת ייצור</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">לחץ לפירוט · SLA: ירוק תקין · צהוב מאחר · אדום קריטי</p>
        </div>
        {bottleneck && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100 shrink-0 whitespace-nowrap">
            צוואר בקבוק: {bottleneck}
          </span>
        )}
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stages.map(stage => {
          const worst =
            stage.redCount > 0    ? "red" :
            stage.yellowCount > 0 ? "yellow" :
            stage.count > 0       ? "green" :
                                    "gray";
          const containerCls =
            worst === "red"    ? "bg-red-50 border-red-200" :
            worst === "yellow" ? "bg-amber-50 border-amber-200" :
            worst === "green"  ? "bg-green-50 border-green-100" :
                                 "bg-gray-50 border-gray-100";
          const countCls =
            worst === "red"    ? "text-red-600" :
            worst === "yellow" ? "text-amber-600" :
            worst === "green"  ? "text-green-700" :
                                 "text-gray-300";

          return (
            <button
              key={stage.status}
              onClick={() => onStageClick(stage.label, stage.status)}
              className={`rounded-xl border p-3 text-right flex flex-col gap-1.5 hover:opacity-90 transition-opacity cursor-pointer ${containerCls}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={`text-2xl font-black leading-none ${countCls}`}>
                  {stage.count}
                </span>
                {stage.maxAgeDays > 0 && (
                  <span className="text-[9px] text-gray-400 font-medium">{stage.maxAgeDays}י׳</span>
                )}
              </div>
              <div className="text-xs font-medium text-gray-700 leading-tight">{stage.label}</div>
              {stage.count > 0 ? (
                <>
                  <SlaBar red={stage.redCount} yellow={stage.yellowCount} green={stage.greenCount} />
                  <div className="flex items-center gap-1 flex-wrap">
                    {stage.redCount > 0 && (
                      <span className="text-[9px] font-bold text-red-600 bg-red-100 rounded px-1.5 py-0.5">
                        {stage.redCount} קריטי
                      </span>
                    )}
                    {stage.yellowCount > 0 && (
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-100 rounded px-1.5 py-0.5">
                        {stage.yellowCount} מאחר
                      </span>
                    )}
                    {stage.greenCount > 0 && (
                      <span className="text-[9px] font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5">
                        {stage.greenCount} תקין
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <span className="text-[10px] text-gray-300">ריק</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
