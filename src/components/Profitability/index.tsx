"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { useCostRatesContext } from "@/context/CostRatesContext";
import { useOperationalKPIs } from "@/hooks/useOperationalKPIs";
import { useOrdersContext } from "@/context/OrdersContext";
import { useAuth } from "@/context/AuthContext";
import {
  calculateProfitability,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_DOT,
  CONFIDENCE_LABELS,
  CONFIDENCE_COLORS,
  MISSING_DATA_LABELS,
  MISSING_DATA_ACTIONS,
  MARGIN_STATUS_LABELS,
  MARGIN_STATUS_COLORS,
  getMarginStatus,
} from "@/lib/profitability";
import type { ProfitabilityStatus, ConfidenceLevel, MissingDataTag, MarginStatus } from "@/lib/profitability";
import type { CrewMetrics, OrderProfitabilitySummary, WeeklyBucket, CustomerMetrics } from "@/lib/operationalKPIs";
import type { DiagnosticFinding } from "@/hooks/useOperationalKPIs";
import { DIARY_STATUS_LABELS } from "@/types/workDiary";
import { getSupabase } from "@/lib/supabase/client";

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

type Tab = "diaries" | "orders" | "crews" | "trends" | "management" | "cfo";
const TABS: { id: Tab; label: string }[] = [
  { id: "diaries",    label: "יומנים" },
  { id: "orders",     label: "עבודות" },
  { id: "crews",      label: "צוותים" },
  { id: "trends",     label: "מגמות" },
  { id: "management", label: "ניהול" },
  { id: "cfo",        label: "CFO ליי" },
];

// ── Trend indicator ───────────────────────────────────────────────────────────

function TrendArrow({ direction, changePct }: { direction: "up" | "flat" | "down"; changePct: number }) {
  if (direction === "up") return (
    <span className="text-green-600 text-[10px] font-bold">▲ {Math.abs(changePct).toFixed(0)}%</span>
  );
  if (direction === "down") return (
    <span className="text-red-600 text-[10px] font-bold">▼ {Math.abs(changePct).toFixed(0)}%</span>
  );
  return <span className="text-gray-400 text-[10px]">→ יציב</span>;
}

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

// ── Management tab ────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<DiagnosticFinding["severity"], { border: string; badge: string; icon: string }> = {
  critical: { border: "border-red-200 bg-red-50",    badge: "bg-red-100 text-red-700",    icon: "text-red-500" },
  warn:     { border: "border-amber-200 bg-amber-50", badge: "bg-amber-100 text-amber-700", icon: "text-amber-500" },
  info:     { border: "border-blue-200 bg-blue-50",   badge: "bg-blue-100 text-blue-700",   icon: "text-blue-400" },
};
const SEVERITY_LABELS: Record<DiagnosticFinding["severity"], string> = {
  critical: "קריטי", warn: "אזהרה", info: "מידע",
};

function DiagnosticCard({ f }: { f: DiagnosticFinding }) {
  const styles = SEVERITY_STYLES[f.severity];
  return (
    <div className={`rounded-xl border p-4 ${styles.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${styles.badge}`}>
              {SEVERITY_LABELS[f.severity]}
            </span>
            <span className="text-sm font-bold text-gray-900">{f.title}</span>
          </div>
          <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{f.explanation}</p>
          <div className="mt-2 flex items-start gap-1.5">
            <span className="text-[10px] font-semibold text-gray-400 shrink-0 mt-0.5">→</span>
            <p className="text-[11px] text-gray-500 italic">{f.recommendation}</p>
          </div>
          {f.evidence.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {f.evidence.slice(0, 4).map((e, i) => (
                <span key={i} className="text-[9px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 font-mono">{e}</span>
              ))}
              {f.evidence.length > 4 && (
                <span className="text-[9px] text-gray-400">+{f.evidence.length - 4}</span>
              )}
            </div>
          )}
        </div>
        {f.estimatedImpact != null && f.estimatedImpact > 0 && (
          <div className="shrink-0 text-right">
            <div className="text-base font-black text-gray-800" dir="ltr">{`₪${Math.round(f.estimatedImpact).toLocaleString("he-IL")}`}</div>
            <div className="text-[9px] text-gray-400">השפעה מוערכת</div>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerTable({ byCustomer }: { byCustomer: CustomerMetrics[] }) {
  if (byCustomer.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
        קשר יומני עבודה להזמנות כדי לראות רווחיות לפי לקוח
      </div>
    );
  }
  const RISK_COLORS = { green: "bg-green-100 text-green-700", amber: "bg-amber-100 text-amber-700", red: "bg-red-100 text-red-700" };
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">רווחיות לפי לקוח</span>
        <span className="text-xs text-gray-400">{byCustomer.length} לקוחות</span>
      </div>
      <div className="flex gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase">
        <div className="flex-1">לקוח</div>
        <div className="w-14 text-center shrink-0">עבודות</div>
        <div className="w-20 text-left shrink-0">הכנסה</div>
        <div className="w-20 text-left shrink-0">עלות</div>
        <div className="w-20 text-left shrink-0">רווח</div>
        <div className="w-16 text-center shrink-0">מרווח</div>
        <div className="w-14 text-center shrink-0">סיכון</div>
      </div>
      {byCustomer.map(c => {
        const isLoss = c.netProfit < 0;
        return (
          <div key={c.customerName} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors text-xs">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate">{c.customerName}</div>
              {c.lastActivity && <div className="text-gray-400 text-[10px]">{formatDate(c.lastActivity)}</div>}
            </div>
            <div className="w-14 text-center text-gray-500 shrink-0">{c.orderCount}</div>
            <div className="w-20 text-left text-gray-700 shrink-0" dir="ltr">{c.totalRevenue > 0 ? `₪${Math.round(c.totalRevenue).toLocaleString("he-IL")}` : "—"}</div>
            <div className="w-20 text-left text-gray-700 shrink-0" dir="ltr">{c.totalCost > 0 ? `₪${Math.round(c.totalCost).toLocaleString("he-IL")}` : "—"}</div>
            <div className={`w-20 font-bold text-left shrink-0 ${isLoss ? "text-red-700" : "text-green-700"}`} dir="ltr">
              {c.totalRevenue > 0 ? `${isLoss ? "-" : "+"}₪${Math.round(Math.abs(c.netProfit)).toLocaleString("he-IL")}` : "—"}
            </div>
            <div className={`w-16 text-center font-bold shrink-0 text-xs ${isLoss ? "text-red-600" : c.avgMarginPct < 15 ? "text-amber-600" : "text-green-600"}`}>
              {c.totalRevenue > 0 ? `${c.avgMarginPct.toFixed(1)}%` : "—"}
            </div>
            <div className="w-14 text-center shrink-0">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${RISK_COLORS[c.riskLevel]}`}>
                {c.riskLevel === "green" ? "תקין" : c.riskLevel === "amber" ? "שולי" : "הפסד"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ManagementTab({ diagnostics, byCustomer, billingLeakage }: {
  diagnostics: DiagnosticFinding[];
  byCustomer: CustomerMetrics[];
  billingLeakage: ReturnType<typeof useOperationalKPIs>["billingLeakage"];
}) {
  const critical = diagnostics.filter(d => d.severity === "critical").length;
  const warnings = diagnostics.filter(d => d.severity === "warn").length;
  const totalImpact = diagnostics.reduce((s, d) => s + (d.estimatedImpact ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {diagnostics.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="text-2xl font-black text-gray-900">{diagnostics.length}</div>
            <div className="text-xs text-gray-500">ממצאים</div>
          </div>
          {critical > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-sm font-bold text-red-700">{critical} קריטי</span>
            </div>
          )}
          {warnings > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-sm font-bold text-amber-700">{warnings} אזהרה</span>
            </div>
          )}
          {totalImpact > 0 && (
            <div className="mr-auto text-right">
              <div className="text-lg font-black text-gray-800" dir="ltr">{`₪${Math.round(totalImpact).toLocaleString("he-IL")}`}</div>
              <div className="text-[10px] text-gray-400">סה״כ חשיפה / הזדמנות מוערכת</div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 text-sm font-medium text-emerald-700">
          ✓ לא זוהו ממצאים תפעוליים בסיס הנתונים הנוכחי
        </div>
      )}

      {/* Billing leakage urgent callout */}
      {billingLeakage.uninvoicedCompletedOrders > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-red-800">
              {billingLeakage.uninvoicedCompletedOrders} הזמנות מושלמות ממתינות לחיוב
              {billingLeakage.uninvoicedEstimatedRevenue > 0 && ` — ${`₪${Math.round(billingLeakage.uninvoicedEstimatedRevenue).toLocaleString("he-IL")}`} מוערך`}
            </div>
            <div className="text-xs text-red-600 mt-0.5">
              ההזמנה הוותיקה ביותר ממתינה {billingLeakage.oldestUninvoicedDays} ימים
            </div>
          </div>
          <Link href="/accounting"
            className="shrink-0 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors">
            לדף חשבונות
          </Link>
        </div>
      )}

      {/* Diagnostic findings */}
      {diagnostics.length > 0 && (
        <div className="flex flex-col gap-3">
          {diagnostics.map(f => <DiagnosticCard key={f.id} f={f} />)}
        </div>
      )}

      {/* Customer profitability */}
      <CustomerTable byCustomer={byCustomer} />
    </div>
  );
}

// ── CFO Lite Tab ──────────────────────────────────────────────────────────────

interface CfoSnapshot {
  order_id: string;
  revenue: number;
  total_cost: number;
  gross_profit: number;
  gross_margin_percent: number;
  confidence_level: ConfidenceLevel;
  missing_data: MissingDataTag[];
  updated_at: string;
}

interface CustomerStat {
  customer: string;
  orderCount: number;
  revenue: number;
  totalCost: number;
  grossProfit: number;
  avgMargin: number;
  negativeCount: number;
  lowConfidenceCount: number;
}

function CfoTab() {
  const { orders: contextOrders, updateOrderFields, addOrderActivity } = useOrdersContext();
  const { profile } = useAuth();
  const { rates } = useCostRatesContext();

  const [snapshots, setSnapshots] = useState<CfoSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-order revenue input state
  const [revenueInputs, setRevenueInputs] = useState<Record<string, string>>({});
  const [savingRevenue, setSavingRevenue] = useState<string | null>(null);
  // Missing cost_price count (loaded once)
  const [missingCostPriceCount, setMissingCostPriceCount] = useState<number | null>(null);
  // Customer drill-down state
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [drillSortAsc, setDrillSortAsc] = useState(true);

  const fetchSnapshots = useCallback(async () => {
    const db = getSupabase();
    if (!db) return;
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/profitability/snapshots", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json() as { snapshots?: CfoSnapshot[]; error?: string };
      if (json.error) { setError(json.error); return; }
      setSnapshots(json.snapshots ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshots();
    const db = getSupabase();
    if (db) {
      db.from("catalog_items")
        .select("id", { count: "exact", head: true })
        .in("type", ["material", "product"])
        .eq("is_active", true)
        .is("cost_price", null)
        .then(({ count }) => setMissingCostPriceCount(count ?? 0));
    }
  }, [fetchSnapshots]);

  async function generateSnapshot(orderId: string) {
    const db = getSupabase();
    if (!db) return;
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) return;
    setGenerating(orderId);
    setError(null);
    try {
      const res = await fetch("/api/profitability/snapshots/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json() as { error?: string };
      if (json.error) { setError(json.error); return; }
      await fetchSnapshots();
    } finally {
      setGenerating(null);
    }
  }

  async function handleSaveRevenue(orderId: string) {
    const raw = (revenueInputs[orderId] ?? "").trim();
    const value = raw === "" ? null : parseFloat(raw);
    if (value !== null && isNaN(value)) return;
    setSavingRevenue(orderId);
    try {
      // billed_amount is read by both accounting workflow and profitability analytics;
      // this write is analytics-only and does not advance accountingStatus
      await updateOrderFields(orderId, { billedAmount: value });
      addOrderActivity(
        orderId,
        "revenue_set",
        value !== null
          ? `סכום לחישוב רווחיות הוזן: ₪${Math.round(value).toLocaleString("he-IL")}`
          : "סכום לחישוב רווחיות נמחק",
        { by: profile?.name ?? "משתמש" },
      );
      setRevenueInputs(prev => { const n = { ...prev }; delete n[orderId]; return n; });
      await generateSnapshot(orderId);
    } finally {
      setSavingRevenue(null);
    }
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    setError(null);
    const db = getSupabase();
    if (!db) { setGeneratingAll(false); return; }
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) { setGeneratingAll(false); return; }
    try {
      const res = await fetch("/api/profitability/snapshots/generate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json() as { error?: string; generated?: number; failed?: number };
      if (json.error) { setError(json.error); }
      else if ((json.failed ?? 0) > 0) { setError(`חישוב נכשל ל-${json.failed} הזמנות`); }
      await fetchSnapshots();
    } finally {
      setGeneratingAll(false);
    }
  }

  const snapshotMap = useMemo(() => new Map(snapshots.map(s => [s.order_id, s])), [snapshots]);

  // ── Derived stats ──
  const activeOrders = contextOrders.filter(o => o.status !== "cancelled");
  const missingRevenue = activeOrders.filter(o => !o.billedAmount).length;
  const snapsWithMissingData = snapshots.filter(s => s.confidence_level === "missing_data").length;
  const snapsWithLow = snapshots.filter(s => s.confidence_level === "low").length;
  const noSnapshotCount = activeOrders.filter(o => !snapshotMap.has(o.id)).length;

  const totalRevenue = snapshots.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = snapshots.reduce((s, r) => s + r.gross_profit, 0);
  const avgMargin = snapshots.length > 0
    ? snapshots.reduce((s, r) => s + r.gross_margin_percent, 0) / snapshots.length
    : 0;
  const losingCount = snapshots.filter(s => s.gross_profit < 0).length;

  // ── Customer-level aggregation (Phase 4.6) ──
  const customerStats = useMemo<CustomerStat[]>(() => {
    const map = new Map<string, Omit<CustomerStat, "avgMargin"> & { marginSum: number }>();
    for (const order of activeOrders) {
      const snap = snapshotMap.get(order.id);
      if (!snap) continue;
      const name = order.customer?.trim() || "לא ידוע";
      const existing = map.get(name) ?? {
        customer: name, orderCount: 0, revenue: 0, totalCost: 0,
        grossProfit: 0, marginSum: 0, negativeCount: 0, lowConfidenceCount: 0,
      };
      existing.orderCount++;
      existing.revenue += snap.revenue;
      existing.totalCost += snap.total_cost;
      existing.grossProfit += snap.gross_profit;
      existing.marginSum += snap.gross_margin_percent;
      if (snap.gross_profit < 0) existing.negativeCount++;
      if (snap.confidence_level === "low" || snap.confidence_level === "missing_data") existing.lowConfidenceCount++;
      map.set(name, existing);
    }
    return Array.from(map.values())
      .map(({ marginSum, ...c }) => ({ ...c, avgMargin: c.orderCount > 0 ? marginSum / c.orderCount : 0 }))
      .sort((a, b) => b.grossProfit - a.grossProfit);
  }, [snapshots, activeOrders, snapshotMap]);

  return (
    <div className="space-y-5" dir="rtl">

      {/* ── Missing data dashboard ── */}
      {(missingRevenue > 0 || (missingCostPriceCount ?? 0) > 0 || snapsWithMissingData > 0 || noSnapshotCount > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-amber-800 mb-2">⚠ חסרי נתונים — יש להשלים לקבלת רווחיות מהימנה</p>
          <div className="flex flex-wrap gap-2">
            {missingRevenue > 0 && (
              <span className="text-xs bg-red-100 text-red-700 border border-red-200 rounded-full px-2.5 py-1 font-medium">
                {missingRevenue} הזמנות ללא סכום הכנסה
              </span>
            )}
            {(missingCostPriceCount ?? 0) > 0 && (
              <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2.5 py-1 font-medium">
                {missingCostPriceCount} פריטי קטלוג ללא מחיר עלות
              </span>
            )}
            {snapsWithMissingData > 0 && (
              <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-2.5 py-1 font-medium">
                {snapsWithMissingData} סנאפשוטים — נתונים חסרים
              </span>
            )}
            {snapsWithLow > 0 && (
              <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2.5 py-1 font-medium">
                {snapsWithLow} סנאפשוטים — ביטחון נמוך
              </span>
            )}
            {noSnapshotCount > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 font-medium">
                {noSnapshotCount} הזמנות ללא חישוב
              </span>
            )}
          </div>
          <p className="text-[10px] text-amber-600 mt-2">
            הזן סכום הכנסה לכל הזמנה ← מחיר עלות בקטלוג ← לחץ &quot;חשב&quot; לחישוב רווחיות
          </p>
        </div>
      )}

      {/* ── KPI summary (only when snapshots with revenue exist) ── */}
      {snapshots.some(s => s.revenue > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="הכנסה כוללת" value={fmt(totalRevenue)} accent="bg-blue-500" />
          <KpiCard label="רווח ברוטו" value={fmt(totalProfit)} accent={totalProfit >= 0 ? "bg-green-500" : "bg-red-500"} />
          <KpiCard label="מרווח ממוצע" value={pct(avgMargin)} accent={avgMargin >= 20 ? "bg-emerald-400" : avgMargin >= 0 ? "bg-amber-400" : "bg-red-400"} />
          <KpiCard label="הזמנות מפסידות" value={String(losingCount)} sub={`מתוך ${snapshots.length}`} accent={losingCount > 0 ? "bg-red-500" : "bg-gray-300"} />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* ── Orders table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-800">רווחיות הזמנות</h3>
          <div className="flex items-center gap-2">
            {loading && <span className="text-xs text-gray-400 animate-pulse">טוען…</span>}
            <button
              type="button"
              disabled={generatingAll || activeOrders.length === 0}
              onClick={handleGenerateAll}
              className="px-3 py-1.5 text-[11px] font-medium rounded-lg border border-teal-400 text-teal-700 hover:bg-teal-50 disabled:opacity-50 transition-colors"
            >
              {generatingAll ? "מחשב הכל…" : "חשב מחדש הכל"}
            </button>
          </div>
        </div>
        {activeOrders.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">אין הזמנות</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-3 py-2 text-right">הזמנה</th>
                  <th className="px-3 py-2 text-right">לקוח</th>
                  <th className="px-3 py-2 text-right w-40">
                    סכום לחישוב רווחיות
                    <div className="text-[9px] text-amber-600 font-normal normal-case leading-tight mt-0.5">
                      לחישוב פנימי בלבד · לא חשבונית
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right">עלות</th>
                  <th className="px-3 py-2 text-right">רווח</th>
                  <th className="px-3 py-2 text-right">
                    מרווח
                    <div className="text-[9px] text-gray-400 font-normal normal-case leading-tight mt-0.5">
                      יעד {rates.targetMarginPercentage}%
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right">ביטחון</th>
                  <th className="px-3 py-2 text-right">חשב</th>
                </tr>
              </thead>
              <tbody>
                {activeOrders.map(order => {
                  const snap = snapshotMap.get(order.id);
                  const isGenerating = generating === order.id;
                  const isSaving = savingRevenue === order.id;
                  const inputVal = revenueInputs[order.id] ?? "";
                  const hasInput = inputVal !== "";
                  const currentRevenue = order.billedAmount;

                  return (
                    <tr key={order.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{order.orderNumber || order.id.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-gray-700 text-xs max-w-[120px] truncate">{order.customer}</td>

                      {/* Revenue input cell */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            placeholder={currentRevenue != null ? String(Math.round(currentRevenue)) : "0"}
                            value={inputVal}
                            onChange={e => setRevenueInputs(prev => ({ ...prev, [order.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") handleSaveRevenue(order.id); }}
                            className={`w-24 px-2 py-1 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-blue-400 dir-ltr ${
                              currentRevenue == null && !hasInput
                                ? "border-amber-300 bg-amber-50"
                                : "border-gray-300 bg-white"
                            }`}
                            dir="ltr"
                          />
                          {currentRevenue != null && !hasInput && (
                            <span className="text-xs text-green-700 font-medium whitespace-nowrap">₪{Math.round(currentRevenue).toLocaleString()}</span>
                          )}
                          {hasInput && (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleSaveRevenue(order.id)}
                              className="px-1.5 py-0.5 text-[10px] rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                              {isSaving ? "…" : "שמור"}
                            </button>
                          )}
                        </div>
                      </td>

                      {snap ? (
                        <>
                          <td className="px-3 py-2 text-gray-600 text-xs">{fmt(snap.total_cost)}</td>
                          <td className={`px-3 py-2 text-xs font-semibold ${snap.gross_profit >= 0 ? "text-green-700" : "text-red-600"}`}>
                            {fmt(snap.gross_profit)}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {(() => {
                              const ms = getMarginStatus(snap, rates);
                              const gap = snap.gross_margin_percent - rates.targetMarginPercentage;
                              return (
                                <>
                                  <span className={`font-bold ${snap.gross_profit >= 0 ? "text-green-700" : "text-red-600"}`}>
                                    {pct(snap.gross_margin_percent)}
                                  </span>
                                  <span className={`ml-1 inline-flex items-center text-[9px] font-bold px-1 py-0.5 rounded-full ${MARGIN_STATUS_COLORS[ms]}`}>
                                    {MARGIN_STATUS_LABELS[ms]}
                                  </span>
                                  {ms !== "missing_data" && (
                                    <div className={`text-[9px] mt-0.5 ${gap >= 0 ? "text-green-600" : "text-red-500"}`}>
                                      {gap >= 0 ? `+${gap.toFixed(1)}%` : `${gap.toFixed(1)}%`} מהיעד
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CONFIDENCE_COLORS[snap.confidence_level]}`}>
                              {CONFIDENCE_LABELS[snap.confidence_level]}
                            </span>
                            {snap.missing_data.length > 0 && (
                              <div className="mt-0.5 text-[10px] text-amber-600 leading-tight font-medium">
                                → {MISSING_DATA_ACTIONS[snap.missing_data[0] as keyof typeof MISSING_DATA_ACTIONS] ?? MISSING_DATA_LABELS[snap.missing_data[0] as keyof typeof MISSING_DATA_LABELS]}
                              </div>
                            )}
                          </td>
                        </>
                      ) : (
                        <td colSpan={4} className="px-3 py-2 text-gray-400 text-xs italic">לא חושב עדיין</td>
                      )}

                      <td className="px-3 py-2">
                        <button
                          type="button"
                          disabled={isGenerating || generatingAll}
                          onClick={() => generateSnapshot(order.id)}
                          className="px-2 py-1 text-[10px] font-medium rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                        >
                          {isGenerating ? "…" : snap ? "עדכן" : "חשב"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Customer profitability section with drill-down (Phase 4.8) ── */}
      {customerStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">רווחיות לפי לקוח</h3>
            <span className="text-xs text-gray-400">{customerStats.length} לקוחות · לחץ לקוח לפירוט עבודות</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" dir="rtl">
              <thead className="bg-gray-50 text-gray-500 text-right">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">לקוח</th>
                  <th className="px-3 py-2 text-right font-medium">עבודות</th>
                  <th className="px-3 py-2 text-right font-medium">הכנסה</th>
                  <th className="px-3 py-2 text-right font-medium">עלות כוללת</th>
                  <th className="px-3 py-2 text-right font-medium">רווח גולמי</th>
                  <th className="px-3 py-2 text-right font-medium">
                    מרווח ממוצע
                    <div className="text-[9px] text-gray-400 font-normal mt-0.5">יעד {rates.targetMarginPercentage}%</div>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">הפסדיות</th>
                  <th className="px-3 py-2 text-right font-medium">חסרי נתונים</th>
                  <th className="px-3 py-2 w-6" />
                </tr>
              </thead>
              <tbody>
                {customerStats.slice(0, 20).map(c => {
                  const isExpanded = expandedCustomer === c.customer;
                  const isProfit = c.grossProfit >= 0;
                  let marginColor = "text-green-700";
                  if (c.avgMargin < 0) marginColor = "text-red-600";
                  else if (c.avgMargin < rates.warningMarginPercentage) marginColor = "text-orange-600";
                  else if (c.avgMargin < rates.targetMarginPercentage) marginColor = "text-yellow-600";

                  const drillOrders = isExpanded
                    ? activeOrders
                        .filter(o => (o.customer?.trim() || "לא ידוע") === c.customer)
                        .map(o => ({ order: o, snap: snapshotMap.get(o.id) }))
                        .sort((a, b) => {
                          const pa = a.snap?.gross_profit ?? -Infinity;
                          const pb = b.snap?.gross_profit ?? -Infinity;
                          return drillSortAsc ? pa - pb : pb - pa;
                        })
                    : [];

                  return (
                    <Fragment key={c.customer}>
                      <tr
                        className="border-t border-gray-50 hover:bg-blue-50/40 cursor-pointer transition-colors select-none"
                        onClick={() => setExpandedCustomer(isExpanded ? null : c.customer)}
                      >
                        <td className="px-3 py-2 font-medium text-gray-800 max-w-[140px] truncate">{c.customer}</td>
                        <td className="px-3 py-2 text-gray-600 text-center">{c.orderCount}</td>
                        <td className="px-3 py-2 text-gray-600">{fmt(c.revenue)}</td>
                        <td className="px-3 py-2 text-gray-600">{fmt(c.totalCost)}</td>
                        <td className={`px-3 py-2 font-semibold ${isProfit ? "text-green-700" : "text-red-600"}`}>
                          {fmt(c.grossProfit)}
                        </td>
                        <td className={`px-3 py-2 font-bold ${marginColor}`}>
                          {pct(c.avgMargin)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.negativeCount > 0 ? (
                            <span className="inline-flex items-center bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              {c.negativeCount}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.lowConfidenceCount > 0 ? (
                            <span className="inline-flex items-center bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              {c.lowConfidenceCount}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-400 text-[11px]">
                          {isExpanded ? "▾" : "▸"}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="p-0 bg-slate-50 border-t border-slate-100">
                            <div className="px-6 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold text-slate-600">פירוט עבודות לקוח — {c.customer}</span>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setDrillSortAsc(v => !v); }}
                                  className="text-[10px] text-slate-500 hover:text-slate-700 underline"
                                >
                                  {drillSortAsc ? "מיין: גרוע → טוב ▲" : "מיין: טוב → גרוע ▼"}
                                </button>
                              </div>

                              {drillOrders.length === 0 ? (
                                <p className="text-[11px] text-gray-400 italic">
                                  אין הזמנות ללקוח זה עם חישוב רווחיות. לחץ &quot;חשב מחדש הכל&quot; למעלה.
                                </p>
                              ) : (
                                <table className="w-full text-[11px]" dir="rtl">
                                  <thead>
                                    <tr className="text-gray-400 font-medium">
                                      <th className="pb-1.5 text-right pr-3">הזמנה</th>
                                      <th className="pb-1.5 text-right">הכנסה</th>
                                      <th className="pb-1.5 text-right">עלות</th>
                                      <th className="pb-1.5 text-right">רווח גולמי</th>
                                      <th className="pb-1.5 text-right">מרווח</th>
                                      <th className="pb-1.5 text-right">ביטחון</th>
                                      <th className="pb-1.5 text-right">פעולה נדרשת</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {drillOrders.map(({ order, snap }) => {
                                      const hasSnap = snap != null;
                                      const isNeg = hasSnap && snap.gross_profit < 0;
                                      const isMissing = hasSnap && snap.confidence_level === "missing_data";
                                      const rowBg = isNeg ? "bg-red-50" : isMissing ? "bg-amber-50/60" : "";
                                      const ms = hasSnap ? getMarginStatus(snap, rates) : null;
                                      return (
                                        <tr key={order.id} className={`border-t border-slate-100 ${rowBg}`}>
                                          <td className="py-1.5 pr-3 font-mono text-gray-600 whitespace-nowrap">
                                            {order.orderNumber || order.id.slice(0, 8)}
                                          </td>
                                          {hasSnap ? (
                                            <>
                                              <td className="py-1.5 text-gray-600 whitespace-nowrap">{fmt(snap.revenue)}</td>
                                              <td className="py-1.5 text-gray-600 whitespace-nowrap">{fmt(snap.total_cost)}</td>
                                              <td className={`py-1.5 font-semibold whitespace-nowrap ${isNeg ? "text-red-600" : "text-green-700"}`}>
                                                {fmt(snap.gross_profit)}
                                              </td>
                                              <td className="py-1.5 whitespace-nowrap">
                                                {ms && (
                                                  <span className={`inline-flex text-[9px] font-bold px-1 py-0.5 rounded-full ${MARGIN_STATUS_COLORS[ms]}`}>
                                                    {pct(snap.gross_margin_percent)}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-1.5">
                                                <span className={`inline-flex text-[9px] font-bold px-1 py-0.5 rounded-full ${CONFIDENCE_COLORS[snap.confidence_level]}`}>
                                                  {CONFIDENCE_LABELS[snap.confidence_level]}
                                                </span>
                                              </td>
                                              <td className="py-1.5 text-amber-600 text-[10px]">
                                                {snap.missing_data.length > 0
                                                  ? (MISSING_DATA_ACTIONS[snap.missing_data[0] as keyof typeof MISSING_DATA_ACTIONS] ?? MISSING_DATA_LABELS[snap.missing_data[0] as keyof typeof MISSING_DATA_LABELS])
                                                  : <span className="text-green-600 font-bold">✓</span>}
                                              </td>
                                            </>
                                          ) : (
                                            <td colSpan={6} className="py-1.5 text-gray-400 italic">לא חושב עדיין</td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 text-center">
        נתונים אנליטיים בלבד · אינם משפיעים על חיוב לקוח או מצב חשבונאי ·{" "}
        <Link href="/catalog" className="text-blue-400 hover:underline">עדכן מחירי עלות בקטלוג</Link>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfitabilityPage() {
  const [activeTab, setActiveTab] = useState<Tab>("diaries");
  const [filterStatus, setFilterStatus] = useState<ProfitabilityStatus | "all">("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const intel = useOperationalKPIs();
  const {
    global: agg, byCrew, byOrder, byCustomer, byWeek,
    labor, executionVariance, dataQuality,
    billingLeakage, trendSummary, diagnostics,
  } = intel;

  const criticalCount = diagnostics.filter(d => d.severity === "critical").length;

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
              <p className="text-xs text-gray-400">רווחיות · צוותים · מגמות · ניתוח ביצוע · ניהול</p>
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
          <KpiCard label="סה״כ ימי עבודה" value={String(agg.totalDays)} accent="bg-blue-500"
            sub={trendSummary.dataWeeks > 0 ? `${trendSummary.dataWeeks} שבועות נתונים` : undefined} />
          <KpiCard label="ימים רווחיים" value={String(agg.profitableDays)} accent="bg-green-500"
            sub={agg.totalDays > 0 ? pct((agg.profitableDays / agg.totalDays) * 100) : undefined} />
          <KpiCard label="ימי הפסד" value={String(agg.lossDays)} accent="bg-red-500"
            sub={agg.totalDays > 0 ? pct((agg.lossDays / agg.totalDays) * 100) : undefined} />
          <KpiCard
            label="סה״כ הכנסות"
            value={agg.totalRevenue > 0 ? `₪${Math.round(agg.totalRevenue).toLocaleString("he-IL")}` : "—"}
            accent={trendSummary.revenueDirection === "up" ? "bg-teal-500" : trendSummary.revenueDirection === "down" ? "bg-red-400" : "bg-teal-500"}
            sub={trendSummary.dataWeeks >= 4 ? `${trendSummary.revenueDirection === "up" ? "▲" : trendSummary.revenueDirection === "down" ? "▼" : "→"} ${Math.abs(trendSummary.revenueChangePct).toFixed(0)}% vs קודם` : undefined}
            small
          />
          <KpiCard
            label="רווח נקי כולל"
            value={agg.totalNetProfit !== 0 ? `${agg.totalNetProfit >= 0 ? "+" : ""}₪${Math.round(Math.abs(agg.totalNetProfit)).toLocaleString("he-IL")}` : "—"}
            accent={agg.totalNetProfit >= 0 ? "bg-green-600" : "bg-red-600"}
            sub={agg.totalRevenue > 0 ? `${pct(agg.avgMarginPercentage)} מרווח` : undefined}
            small
          />
          <KpiCard
            label={criticalCount > 0 ? `${criticalCount} ממצאים קריטיים` : "איכות נתונים"}
            value={criticalCount > 0 ? String(criticalCount) : `${dataQuality.completenessScore}%`}
            accent={criticalCount > 0 ? "bg-red-500" : dataQuality.completenessScore >= 80 ? "bg-emerald-400" : dataQuality.completenessScore >= 60 ? "bg-amber-400" : "bg-red-400"}
            sub={criticalCount > 0 ? "לחץ על ניהול לפרטים" : dataQuality.missingBilling > 0 ? `${dataQuality.missingBilling} ללא סכום הכנסה` : undefined}
          />
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 shadow-sm p-1 w-fit">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === t.id ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
              {t.label}
              {t.id === "management" && criticalCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {criticalCount}
                </span>
              )}
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
        {activeTab === "management" && (
          <ManagementTab diagnostics={diagnostics} byCustomer={byCustomer} billingLeakage={billingLeakage} />
        )}
        {activeTab === "cfo" && <CfoTab />}

        <div className="text-xs text-gray-400 text-center px-4 py-2">
          הנתונים מבוססים על יומני עבודה שמולאו ·{" "}
          <Link href="/cost-settings" className="text-blue-500 hover:underline">עדכן תעריפי עלות</Link>
        </div>
      </div>
    </div>
  );
}
