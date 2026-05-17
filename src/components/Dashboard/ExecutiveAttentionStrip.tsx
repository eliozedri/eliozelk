"use client";

import { DEPT_LABELS } from "@/hooks/useWorkflowAlerts";
import type { WorkflowAlert } from "@/hooks/useWorkflowAlerts";

interface Props {
  alerts: WorkflowAlert[];
  onAlertClick: (alert: WorkflowAlert) => void;
}

export function ExecutiveAttentionStrip({ alerts, onAlertClick }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
        <span className="text-base">✓</span>
        <span>כל המערכות תקינות — אין פריטים הדורשים תשומת לב</span>
      </div>
    );
  }

  const visible = alerts.slice(0, 5);
  const hidden = alerts.length - visible.length;

  return (
    <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-red-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-red-700">דורשות טיפול מיידי</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold leading-none">
            {alerts.length}
          </span>
        </div>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {visible.map((alert) => (
          <button
            key={alert.id}
            onClick={() => onAlertClick(alert)}
            className="w-full text-right flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-white border border-red-100 hover:border-red-300 hover:shadow-sm transition-all group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-800 leading-snug">{alert.message}</p>
              <p className="text-[11px] text-red-500 mt-0.5">
                {DEPT_LABELS[alert.department] ?? alert.department}
              </p>
            </div>
            <span className={`
              shrink-0 inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-sm font-bold leading-none
              ${alert.severity === "critical" ? "bg-red-600 text-white" : "bg-amber-100 text-amber-700"}
            `}>
              {alert.count}
            </span>
          </button>
        ))}
        {hidden > 0 && (
          <p className="text-xs text-red-500 text-center py-1">
            + {hidden} התראות נוספות
          </p>
        )}
      </div>
    </div>
  );
}
