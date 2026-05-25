"use client";

import { useMemo } from "react";
import type { WorkDiary } from "@/types/workDiary";
import { useCostRatesContext } from "@/context/CostRatesContext";
import {
  calculateProfitability,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_DOT,
} from "@/lib/profitability";

function fmt(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

interface Props {
  diary: WorkDiary;
}

function MetricRow({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "green" | "red" | "orange" | "gray";
}) {
  const colors = {
    green: "text-green-700",
    red: "text-red-700",
    orange: "text-orange-700",
    gray: "text-gray-400",
  };
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-bold ${highlight ? colors[highlight] : "text-gray-900"}`}>
          {value}
        </span>
        {sub && <div className="text-xs text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

export function ProfitabilityPanel({ diary }: Props) {
  const { rates } = useCostRatesContext();

  const result = useMemo(
    () => calculateProfitability(diary, rates),
    [diary, rates]
  );

  const isLoss = result.netProfit < 0;
  const isNoData = result.status === "no_data";

  return (
    <div className="space-y-5 pb-6">
      {/* Status banner */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700">תוצאה פיננסית יומית</h3>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[result.status]}`}>
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[result.status]}`} />
            {STATUS_LABELS[result.status]}
          </span>
        </div>

        {isNoData ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <div className="text-3xl mb-2">📊</div>
            <p>הזן סכום לחיוב בלשונית &quot;פרטי עבודה&quot;</p>
            <p className="text-xs mt-1">ניתוח רווחיות ידרוש גם עלויות ושעות</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">הכנסה</div>
              <div className="text-xl font-black text-gray-900">{fmt(result.billedAmount)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">עלות כוללת</div>
              <div className="text-xl font-black text-gray-900">{fmt(result.totalCost)}</div>
            </div>
            <div className={`rounded-lg p-3 ${isLoss ? "bg-red-50" : "bg-green-50"}`}>
              <div className="text-xs text-gray-400 mb-1">רווח/הפסד</div>
              <div className={`text-xl font-black ${isLoss ? "text-red-700" : "text-green-700"}`}>
                {isLoss ? "-" : "+"}{fmt(Math.abs(result.netProfit))}
              </div>
              <div className={`text-xs font-semibold ${isLoss ? "text-red-500" : "text-green-600"}`}>
                {pct(Math.abs(result.marginPercentage))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cost breakdown */}
      {!isNoData && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">פירוט עלויות</h3>
          <MetricRow label="עלות עבודה" value={fmt(result.laborCost)}
            sub={result.totalWorkers > 0 ? `${result.totalWorkers} עובדים` : undefined} />
          <MetricRow label="עלות רכב + דלק" value={fmt(result.vehicleCost)} />
          <MetricRow label="עלות ציוד" value={fmt(result.equipmentCost)} />
          <MetricRow label="עלות חומרים" value={fmt(result.materialCost)} />
          <MetricRow label="תקורה" value={fmt(result.overheadCost)}
            sub={`${rates.overheadPercentage}% + ₪${rates.fixedDailyOverhead} קבוע`} />
          <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between">
            <span className="text-sm font-bold text-gray-700">סה״כ עלויות</span>
            <span className="text-sm font-bold text-gray-900">{fmt(result.totalCost)}</span>
          </div>
        </div>
      )}

      {/* Planning */}
      {!isNoData && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">נקודות איזון ויעדים</h3>
          <MetricRow
            label="מינימום חיוב לנקודת איזון"
            value={fmt(result.breakEvenBilling)}
            highlight={result.billedAmount < result.breakEvenBilling ? "red" : "green"}
          />
          <MetricRow
            label={`חיוב לפי יעד ${pct(rates.targetMarginPercentage)} רווח`}
            value={fmt(result.targetBilling)}
            highlight={result.billedAmount >= result.targetBilling ? "green" : "orange"}
          />
          <MetricRow
            label="הפרש מנקודת האיזון"
            value={`${result.surplusOrDeficit >= 0 ? "+" : ""}${fmt(result.surplusOrDeficit)}`}
            highlight={result.surplusOrDeficit >= 0 ? "green" : "red"}
          />
        </div>
      )}

      {/* Time analysis */}
      {result.totalHours > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">ניתוח זמנים</h3>
          <MetricRow label="סה״כ שעות ביום" value={`${result.totalHours.toFixed(1)} שעות`} />
          <MetricRow label="זמן ביצוע בפועל" value={`${result.executionHours.toFixed(1)} שעות`}
            highlight={result.timeEfficiencyPct < 50 ? "orange" : undefined}
            sub={`${pct(result.timeEfficiencyPct)} מהיום`} />
          <MetricRow label="זמן נסיעה" value={`${result.travelHours.toFixed(1)} שעות`}
            highlight={result.travelTimePct > 35 ? "orange" : undefined}
            sub={result.totalHours > 0 ? `${pct(result.travelTimePct)} מהיום` : undefined} />
          {result.waitingHours > 0 && (
            <MetricRow label="המתנה באתר" value={`${result.waitingHours.toFixed(1)} שעות`} highlight="orange" />
          )}
          {result.setupHours > 0 && (
            <MetricRow label="הכנה ופירוק" value={`${result.setupHours.toFixed(1)} שעות`} />
          )}
        </div>
      )}

      {/* Alerts */}
      {result.alerts.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">התראות</h3>
          <div className="space-y-2">
            {result.alerts.map((a, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                  a.severity === "error"
                    ? "bg-red-50 text-red-800 border border-red-100"
                    : a.severity === "warn"
                    ? "bg-amber-50 text-amber-800 border border-amber-100"
                    : "bg-blue-50 text-blue-800 border border-blue-100"
                }`}
              >
                <span className="text-base leading-none mt-0.5">
                  {a.severity === "error" ? "🔴" : a.severity === "warn" ? "⚠️" : "ℹ️"}
                </span>
                <span>{a.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-blue-700 mb-3">המלצות תפעוליות</h3>
          <ul className="space-y-2">
            {result.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-blue-500 shrink-0 mt-0.5">→</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cost rates note */}
      <div className="px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-400 text-center">
        החישוב מבוסס על תעריפי עלות מוגדרים במערכת ·{" "}
        <a href="/cost-settings" className="text-blue-500 hover:underline">עדכן תעריפים</a>
      </div>
    </div>
  );
}
