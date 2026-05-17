"use client";

import { DEPT_LABELS } from "@/hooks/useWorkflowAlerts";
import type { WorkflowAlert } from "@/hooks/useWorkflowAlerts";

function AlertIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

const SEVERITY_STYLE = {
  critical: { icon: "text-red-500",   hover: "hover:bg-red-50",   badge: "bg-red-100 text-red-700"    },
  warn:     { icon: "text-amber-500", hover: "hover:bg-amber-50", badge: "bg-amber-100 text-amber-700" },
};

interface Props {
  alerts: WorkflowAlert[];
  onAlertClick: (alert: WorkflowAlert) => void;
}

export function AlertsSection({ alerts, onAlertClick }: Props) {
  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy-900">התראות לטיפול</h2>
        <div className="flex items-center gap-1.5">
          {criticalCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {criticalCount} קריטי
            </span>
          )}
          {alerts.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {alerts.length}
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {alerts.length === 0 ? (
          <div className="px-5 py-5 text-center">
            <div className="text-2xl mb-1">✓</div>
            <p className="text-xs text-gray-400">אין התראות — הכל תקין</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const style = SEVERITY_STYLE[alert.severity];
            return (
              <button
                key={alert.id}
                onClick={() => onAlertClick(alert)}
                className={`flex items-start gap-3 px-4 py-3 ${style.hover} transition-colors w-full text-right`}
              >
                <span className={`${style.icon} mt-0.5 shrink-0`}><AlertIcon /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 leading-relaxed">{alert.message}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badge}`}>
                      {DEPT_LABELS[alert.department]}
                    </span>
                    {alert.orderNumbers && alert.orderNumbers.length > 0 && (
                      <span className="text-[10px] text-gray-400">
                        {alert.orderNumbers.slice(0, 3).join(", ")}
                        {alert.orderNumbers.length > 3 && ` +${alert.orderNumbers.length - 3}`}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
