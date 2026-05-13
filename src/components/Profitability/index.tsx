"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { useCostRatesContext } from "@/context/CostRatesContext";
import { useOperationalKPIs } from "@/hooks/useOperationalKPIs";
import {
  calculateProfitability,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_DOT,
} from "@/lib/profitability";
import type { ProfitabilityStatus } from "@/lib/profitability";
import type { CrewMetrics, OrderProfitabilitySummary, WeeklyBucket } from "@/lib/operationalKPIs";
import { DIARY_STATUS_LABELS } from "@/types/workDiary";

// ── Shared helpers ────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}
function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}
function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("he-IL", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, small }: {
  label: string; value: string; sub?: string; accent: string; small?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${accent}`} />
      <div className="px-4 py-4">
        <div className={`font-black leading-none ${small ? "text-2xl" : "text-3xl"} text-gray-900`}>{value}</div>
        <div className="text-xs font-medium text-gray-600 mt-1">{label}</div>
        {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProfitabilityStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

type Tab = "diaries" | "orders" | "crews" | "trends";
const TABS: { id: Tab; label: string }[] = [
  { id: "diaries", label: "יומנים" },
  { id: "orders",  label: "עבודות" },
  { id: "crews",   label: "צוותים" },
  { id: "trends",  label: "מגמות" },
];

// ── Diaries tab ───────────────────────────────────────────────────────────────

interface DiaryRow {
  id: string;
  diaryNumber: string;
  executionDate: string;
  customerName: string;
  siteName: string;
  diaryStatus: string;
  profitStatus: ProfitabilityStatus;
  billedAmount: number;
  totalCost: number;
  netProfit: number;
  marginPercentage: number;
  totalWorkers: number;
}

function DiaryTableRow({ row }: { row: DiaryRow }) {
  const isLoss = row.netProfit < 0;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 text-xs">{row.diaryNumber}</span>
          <span className="text-[10px] font-bold px-1 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {DIARY_STATUS_LABELS[row.diaryStatus as "draft" | "submitted"] ?? row.diaryStatus}
          </span>
        </div>
        <div className="text-[10px] text-gray-400 truncate">
          {row.customerName || "—"}{row.siteName ? ` · ${row.siteName}` : ""}
        </div>
      </div>
      <div className="text-xs text-gray-500 shrink-0 w-16 text-center">{formatDate(row.executionDate)}</div>
      <div className="text-xs text-gray-500 shrink-0 w-12 text-center">{row.totalWorkers > 0 ? row.totalWorkers : "—"}</div>
      <div className="text-xs text-gray-700 shrink-0 w-20 text-left" dir="ltr">
        {row.billedAmount > 0 ? fmt(row.billedAmount) : "—"}
      </div>
      <div className="text-xs text-gray-700 shrink-0 w-20 text-left" dir="ltr">
        {row.totalCost > 0 ? fmt(row.totalCost) : "—"}
      </div>
      <div className={`text-xs font-bold shrink-0 w-20 text-left ${isLoss ? "text-red-700" : "text-green-700"}`} dir="ltr">
        {row.billedAmount > 0 ? `${isLoss ? "-" : "+"}${fmt(Math.abs(row.netProfit))}` : "—"}
      </div>
      <div className="shrink-0"><StatusBadge status={row.profitStatus} /></div>
    </div>
  );
}

function DiariesTab({ filterStatus, filterFrom, filterTo, setFilterStatus, setFilterFrom, setFilterTo }: {
  filterStatus: ProfitabilityStatus | "all";
  filterFrom: string;
  filterTo: string;
  setFilterStatus: (s: ProfitabilityStatus | "all") => void;
  setFilterFrom: (s: string) => void;
  setFilterTo: (s: string) => void;
}) {
  const { diaries } = useWorkDiaryContext();
  const { rates } = useCostRatesContext();
  const STATUSES: ProfitabilityStatus[] = ["profitable", "marginal", "breakeven", "loss", "no_data"];

  const rows = useMemo<DiaryRow[]>(() =>
    diaries.map(d => {
      const r = calculateProfitability(d, rates);
      return {
        id: d.id,
        diaryNumber: d.diaryNumber,
        executionDate: d.executionDate,
        customerName: d.customerName,
        siteName: d.siteName,
        diaryStatus: d.status,
        profitStatus: r.status,
        billedAmount: r.billedAmount,
        totalCost: r.totalCost,
        netProfit: r.netProfit,
        marginPercentage: r.marginPercentage,
        totalWorkers: r.totalWorkers,
      };
    }), [diaries, rates]);

  const filtered = useMemo(() => {
    let res = rows;
    if (filterStatus !== "all") res = res.filter(r => r.profitStatus === filterStatus);
    if (filterFrom) res = res.filter(r => r.executionDate >= filterFrom);
    if (filterTo) res = res.filter(r => r.executionDate <= filterTo);
    return [...res].sort((a, b) => b.executionDate.localeCompare(a.executionDate));
  }, [rows, filterStatus, filterFrom, filterTo]);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">סטטוס:</span>
            <button type="button" onClick={() => setFilterStatus("all")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === "all" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              הכל
            </button>
            {STATUSES.map(s => (
              <button key={s} type="button" onClick={() => setFilterStatus(s)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === s ? STATUS_COLORS[s] + " ring-1 ring-current" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-xs text-gray-500">מ-</span>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              className="px-2 py-1 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" dir="ltr" />
            <span className="text-xs text-gray-500">עד</span>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              className="px-2 py-1 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" dir="ltr" />
            {(filterFrom || filterTo || filterStatus !== "all") && (
              <button type="button" onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterStatus("all"); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline">נקה</button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-700">פירוט ימי עבודה</span>
          <span className="text-xs text-gray-400">{filtered.length} יומנים</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          <div className="flex-1">יומן / לקוח</div>
          <div className="w-16 text-center shrink-0">תאריך</div>
          <div className="w-12 text-center shrink-0">צוות</div>
          <div className="w-20 text-left shrink-0">הכנסה</div>
          <div className="w-20 text-left shrink-0">עלות</div>
          <div className="w-20 text-left shrink-0">רווח</div>
          <div className="shrink-0 w-24">סטטוס</div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-gray-500">אין יומנים מתאימים לסינון</p>
            {rows.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                צור יומני עבודה ב<Link href="/work-diary" className="text-blue-500 hover:underline mr-1">יומן עבודה</Link>
              </p>
            )}
          </div>
        ) : (
          filtered.map(row => <DiaryTableRow key={row.id} row={row} />)
        )}
      </div>
    </div>
  );
}

// ── Orders tab ────────────────────────────────────────────────────────────────

function OrderRow({ o }: { o: OrderProfitabilitySummary }) {
  const isLoss = o.netProfit < 0;
  const varSign = o.hoursVariance !== null ? (o.hoursVariance > 0 ? "+" : "") : "";
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors text-xs">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900">{o.orderNumber}</div>
        <div className="text-gray-400 truncate">{o.customerName}</div>
      </div>
      <div className="shrink-0 w-14 text-center text-gray-500">{o.diaryCount} יומנים</div>
      <div className="shrink-0 w-20 text-gray-400 text-center">
        {o.approvedDiaryCount}/{o.diaryCount}
        <div className="text-[9px] text-gray-300">אושרו</div>
      </div>
      <div className="shrink-0 w-20 text-gray-700 text-left" dir="ltr">
        {o.totalRevenue > 0 ? fmt(o.totalRevenue) : "—"}
      </div>
      <div className="shrink-0 w-20 text-gray-700 text-left" dir="ltr">
        {o.totalCost > 0 ? fmt(o.totalCost) : "—"}
      </div>
      <div className={`shrink-0 w-20 font-bold text-left ${isLoss ? "text-red-700" : "text-green-700"}`} dir="ltr">
        {o.totalRevenue > 0 ? `${isLoss ? "-" : "+"}${fmt(Math.abs(o.netProfit))}` : "—"}
      </div>
      <div className="shrink-0 w-20 text-center">
        {o.hoursVariance !== null ? (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${o.hoursVariance > 0 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
            {varSign}{o.hoursVariance.toFixed(1)}h
          </span>
        ) : <span className="text-gray-300">—</span>}
      </div>
    </div>
  );
}

function OrdersTab({ byOrder }: { byOrder: OrderProfitabilitySummary[] }) {
  if (byOrder.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-sm text-gray-400">
        קשר יומני עבודה להזמנות כדי לראות רווחיות לפי פרויקט
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">רווחיות לפי הזמנה</span>
        <span className="text-xs text-gray-400">{byOrder.length} הזמנות</span>
      </div>
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
        <div className="flex-1">הזמנה</div>
        <div className="w-14 text-center shrink-0">ימים</div>
        <div className="w-20 text-center shrink-0">אישורים</div>
        <div className="w-20 text-left shrink-0">הכנסה</div>
        <div className="w-20 text-left shrink-0">עלות</div>
        <div className="w-20 text-left shrink-0">רווח</div>
        <div className="w-20 text-center shrink-0">שעות ∆</div>
      </div>
      {byOrder.map(o => <OrderRow key={o.orderId} o={o} />)}
    </div>
  );
}

// ── Crews tab ─────────────────────────────────────────────────────────────────

function CrewCard({ c }: { c: CrewMetrics }) {
  const isLoss = c.totalNetProfit < 0;
  const hasData = c.totalRevenue > 0;
  const revenueWidth = hasData && c.totalCost > 0
    ? Math.min(100, Math.round((c.totalCost / c.totalRevenue) * 100))
    : 0;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isLoss ? "border-red-200" : "border-gray-200"}`}>
      <div className={`h-1 ${isLoss ? "bg-red-400" : c.avgMarginPct > 20 ? "bg-green-400" : "bg-amber-400"}`} />
      <div className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-gray-900">{c.crewName}</div>
            <div className="text-[11px] text-gray-400">{c.leaderName}</div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-black ${isLoss ? "text-red-700" : "text-green-700"}`}>
              {hasData ? `${isLoss ? "-" : "+"}${fmt(Math.abs(c.totalNetProfit))}` : "—"}
            </div>
            <div className="text-[10px] text-gray-400">
              {hasData ? pct(c.avgMarginPct) + " מרווח" : "אין נתונים"}
            </div>
          </div>
        </div>

        {/* Revenue vs Cost bar */}
        {hasData && (
          <div className="space-y-0.5">
            <div className="flex justify-between text-[9px] text-gray-400">
              <span>עלות vs הכנסה</span>
              <span dir="ltr">{fmt(c.totalCost)} / {fmt(c.totalRevenue)}</span>
            </div>
            <div className="h-2 bg-green-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${revenueWidth > 90 ? "bg-red-400" : revenueWidth > 75 ? "bg-amber-400" : "bg-green-400"}`}
                style={{ width: `${revenueWidth}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-base font-bold text-gray-800">{c.totalDays}</div>
            <div className="text-[9px] text-gray-400">ימי עבודה</div>
          </div>
          <div className="text-center">
            <div className="text-base font-bold text-gray-800">{Math.round(c.avgTimeEfficiencyPct)}%</div>
            <div className="text-[9px] text-gray-400">יעילות זמן</div>
          </div>
          <div className="text-center">
            <div className="text-base font-bold text-gray-800">{Math.round(c.avgTravelTimePct)}%</div>
            <div className="text-[9px] text-gray-400">זמן נסיעה</div>
          </div>
        </div>

        {/* Profit/loss days */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-green-600 font-semibold">{c.profitableDays} רווחיים</span>
          <span className="text-gray-300">·</span>
          <span className="text-red-500 font-semibold">{c.lossDays} הפסד</span>
          {c.totalWorkerDays > 0 && (
            <>
              <span className="text-gray-300 mr-auto">·</span>
              <span className="text-gray-500">{fmt(Math.round(c.revenuePerWorkerDay))} לעובד/יום</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CrewsTab({ byCrew }: { byCrew: CrewMetrics[] }) {
  if (byCrew.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-sm text-gray-400">
        מלא יומני עבודה עם שם ראש צוות כדי לראות ביצועי צוות
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {byCrew.map(c => (
        <CrewCard key={c.crewId ?? c.leaderName} c={c} />
      ))}
    </div>
  );
}

// ── Trends tab ────────────────────────────────────────────────────────────────

function TrendsTab({ byWeek, labor, executionVariance }: {
  byWeek: WeeklyBucket[];
  labor: ReturnType<typeof useOperationalKPIs>["labor"];
  executionVariance: ReturnType<typeof useOperationalKPIs>["executionVariance"];
}) {
  if (byWeek.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-sm text-gray-400">
        אין נתונים לתצוגת מגמות. מלא יומנים עם תאריך ביצוע.
      </div>
    );
  }

  const maxRevenue = Math.max(...byWeek.map(b => b.totalRevenue), 1);

  return (
    <div className="space-y-4">
      {/* Weekly bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-gray-700">מגמת הכנסות שבועית</span>
          <span className="text-xs text-gray-400">{byWeek.length} שבועות</span>
        </div>
        <div className="flex items-end gap-1.5" style={{ height: 100 }}>
          {byWeek.map(b => {
            const revH = Math.max(4, Math.round((b.totalRevenue / maxRevenue) * 100));
            const costH = b.totalRevenue > 0
              ? Math.max(2, Math.round((b.totalCost / maxRevenue) * 100))
              : 0;
            const isLoss = b.netProfit < 0;
            return (
              <div key={b.weekKey} className="flex-1 flex flex-col items-center justify-end gap-0.5"
                title={`${b.label}\nהכנסה: ${fmt(b.totalRevenue)}\nעלות: ${fmt(b.totalCost)}\nרווח: ${fmt(b.netProfit)}\n${b.diaryCount} יומנים`}>
                <div className="w-full relative" style={{ height: revH }}>
                  {/* Revenue bar (background) */}
                  <div className={`absolute inset-0 rounded-t-sm ${isLoss ? "bg-red-200" : "bg-green-200"}`} />
                  {/* Cost bar (foreground, from bottom) */}
                  <div
                    className={`absolute bottom-0 left-0 right-0 rounded-t-sm ${isLoss ? "bg-red-500" : "bg-green-500"}`}
                    style={{ height: Math.min(costH, revH) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {/* X-axis labels */}
        <div className="flex gap-1.5 mt-1">
          {byWeek.map(b => (
            <div key={b.weekKey} className="flex-1 text-center text-[8px] text-gray-400 truncate">{b.label}</div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
          <div className="flex items-center gap-1"><div className="w-3 h-2 rounded-sm bg-green-500" />הכנסות</div>
          <div className="flex items-center gap-1"><div className="w-3 h-2 rounded-sm bg-green-200" />הפרש (רווח)</div>
        </div>
      </div>

      {/* Labor utilization panel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="text-sm font-bold text-gray-700 mb-4">ניצולת כוח אדם</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-2xl font-black text-gray-900">{labor.totalWorkerDays}</div>
            <div className="text-xs text-gray-500">ימי עובד כולל</div>
          </div>
          <div>
            <div className="text-2xl font-black text-gray-900">{Math.round(labor.avgTimeEfficiencyPct)}%</div>
            <div className="text-xs text-gray-500">יעילות ביצוע ממוצעת</div>
          </div>
          <div>
            <div className="text-2xl font-black text-gray-900">{Math.round(labor.avgTravelTimePct)}%</div>
            <div className="text-xs text-gray-500">נסיעה ממוצע</div>
          </div>
          <div>
            <div className="text-2xl font-black text-gray-900">{labor.revenuePerWorkerDay > 0 ? fmt(Math.round(labor.revenuePerWorkerDay)) : "—"}</div>
            <div className="text-xs text-gray-500">הכנסה לעובד/יום</div>
          </div>
        </div>

        {/* Time efficiency bar */}
        {labor.totalFieldHours > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs text-gray-500 font-medium">פירוט שעות שטח</div>
            <div className="flex rounded-full overflow-hidden h-3">
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${(labor.totalExecutionHours / labor.totalFieldHours) * 100}%` }}
                title={`ביצוע: ${labor.totalExecutionHours.toFixed(0)}h`}
              />
              <div
                className="bg-amber-400 transition-all"
                style={{ width: `${(labor.totalNonProductiveHours / labor.totalFieldHours) * 100}%` }}
                title={`לא יצרני: ${labor.totalNonProductiveHours.toFixed(0)}h`}
              />
              <div className="bg-gray-200 flex-1" title="שעות לא מתועדות" />
            </div>
            <div className="flex items-center gap-4 text-[10px] text-gray-500">
              <div className="flex items-center gap-1"><div className="w-3 h-2 rounded-sm bg-green-500" />ביצוע ({labor.totalExecutionHours.toFixed(0)}h)</div>
              <div className="flex items-center gap-1"><div className="w-3 h-2 rounded-sm bg-amber-400" />נסיעה/המתנה ({labor.totalNonProductiveHours.toFixed(0)}h)</div>
            </div>
          </div>
        )}
      </div>

      {/* Execution variance panel */}
      {executionVariance.measurableOrders > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-bold text-gray-700 mb-4">שעות מתוכנן vs בפועל</div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-2xl font-black text-gray-900">{executionVariance.measurableOrders}</div>
              <div className="text-xs text-gray-500">הזמנות ניתנות למדידה</div>
            </div>
            <div>
              <div className={`text-2xl font-black ${executionVariance.avgVarianceHours > 0 ? "text-orange-700" : "text-green-700"}`}>
                {executionVariance.avgVarianceHours > 0 ? "+" : ""}{executionVariance.avgVarianceHours.toFixed(1)}h
              </div>
              <div className="text-xs text-gray-500">חריגה ממוצעת</div>
            </div>
            <div>
              <div className="text-2xl font-black text-orange-700">{executionVariance.overrunCount}</div>
              <div className="text-xs text-gray-500">חרגו מהתכנון &gt;20%</div>
            </div>
          </div>

          {executionVariance.worstOverruns.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 font-medium mb-2">חריגות גדולות</div>
              <div className="flex flex-col gap-1">
                {executionVariance.worstOverruns.map(o => (
                  <div key={o.orderNumber} className="flex items-center justify-between text-xs bg-orange-50 rounded-lg px-3 py-1.5">
                    <span className="font-semibold text-gray-700">{o.orderNumber}</span>
                    <span className="text-gray-500 truncate mx-2">{o.customerName}</span>
                    <span className="font-bold text-orange-700 shrink-0">+{o.varianceHours.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfitabilityPage() {
  const [activeTab, setActiveTab] = useState<Tab>("diaries");
  const [filterStatus, setFilterStatus] = useState<ProfitabilityStatus | "all">("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const kpis = useOperationalKPIs();

  const { global: agg, byCrew, byOrder, byWeek, labor, executionVariance, dataQuality } = kpis;

  return (
    <div className="min-h-screen bg-[#f0f2f5] pb-10">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">מודיעין תפעולי</h1>
              <p className="text-xs text-gray-400">רווחיות · צוותים · מגמות · ניתוח ביצוע</p>
            </div>
          </div>
          <Link href="/cost-settings" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            עדכן תעריפים
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 mt-4 space-y-4">
        {/* Global KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="סה״כ ימי עבודה" value={String(agg.totalDays)} accent="bg-blue-500" />
          <KpiCard label="ימים רווחיים" value={String(agg.profitableDays)} accent="bg-green-500"
            sub={agg.totalDays > 0 ? pct((agg.profitableDays / agg.totalDays) * 100) : undefined} />
          <KpiCard label="ימי הפסד" value={String(agg.lossDays)} accent="bg-red-500"
            sub={agg.totalDays > 0 ? pct((agg.lossDays / agg.totalDays) * 100) : undefined} />
          <KpiCard label="סה״כ הכנסות" value={agg.totalRevenue > 0 ? fmt(agg.totalRevenue) : "—"} accent="bg-teal-500" small />
          <KpiCard
            label="רווח נקי כולל"
            value={agg.totalNetProfit !== 0 ? `${agg.totalNetProfit >= 0 ? "+" : ""}${fmt(agg.totalNetProfit)}` : "—"}
            accent={agg.totalNetProfit >= 0 ? "bg-green-600" : "bg-red-600"}
            sub={agg.totalRevenue > 0 ? `${pct(agg.avgMarginPercentage)} מרווח` : undefined}
            small
          />
          <KpiCard
            label="איכות נתונים"
            value={`${dataQuality.completenessScore}%`}
            accent={dataQuality.completenessScore >= 80 ? "bg-emerald-400" : dataQuality.completenessScore >= 60 ? "bg-amber-400" : "bg-red-400"}
            sub={dataQuality.missingBilling > 0 ? `${dataQuality.missingBilling} חסרי חיוב` : undefined}
          />
        </div>

        {/* Data quality warning */}
        {dataQuality.completenessScore < 70 && dataQuality.totalDiaries > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm">
            <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <span className="font-semibold text-amber-800">איכות נתונים נמוכה</span>
              <span className="text-amber-700 mr-1">—</span>
              {dataQuality.missingBilling > 0 && <span className="text-amber-700">{dataQuality.missingBilling} יומנים ללא סכום חיוב · </span>}
              {dataQuality.missingCrew > 0 && <span className="text-amber-700">{dataQuality.missingCrew} ללא פרטי צוות · </span>}
              {dataQuality.missingOrderLink > 0 && <span className="text-amber-700">{dataQuality.missingOrderLink} לא מקושרים להזמנה</span>}
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 shadow-sm p-1 w-fit">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === t.id ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "diaries" && (
          <DiariesTab
            filterStatus={filterStatus}
            filterFrom={filterFrom}
            filterTo={filterTo}
            setFilterStatus={setFilterStatus}
            setFilterFrom={setFilterFrom}
            setFilterTo={setFilterTo}
          />
        )}
        {activeTab === "orders" && <OrdersTab byOrder={byOrder} />}
        {activeTab === "crews" && <CrewsTab byCrew={byCrew} />}
        {activeTab === "trends" && <TrendsTab byWeek={byWeek} labor={labor} executionVariance={executionVariance} />}

        <div className="text-xs text-gray-400 text-center px-4 py-2">
          הנתונים מבוססים על יומני עבודה שמולאו ·{" "}
          <Link href="/cost-settings" className="text-blue-500 hover:underline">עדכן תעריפי עלות</Link>
        </div>
      </div>
    </div>
  );
}
