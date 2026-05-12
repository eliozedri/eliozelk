"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { useCostRatesContext } from "@/context/CostRatesContext";
import {
  calculateProfitability,
  aggregateProfitability,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_DOT,
} from "@/lib/profitability";
import type { ProfitabilityStatus } from "@/lib/profitability";
import { DIARY_STATUS_LABELS } from "@/types/workDiary";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
  small,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  small?: boolean;
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

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProfitabilityStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowData {
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

function TableRow({ row }: { row: RowData }) {
  const isLoss = row.netProfit < 0;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 text-xs">{row.diaryNumber}</span>
          <span className={`text-[10px] font-bold px-1 py-0.5 rounded-full bg-gray-100 text-gray-500`}>
            {DIARY_STATUS_LABELS[row.diaryStatus as "draft" | "submitted"] ?? row.diaryStatus}
          </span>
        </div>
        <div className="text-[10px] text-gray-400 truncate">
          {row.customerName || "—"}{row.siteName ? ` · ${row.siteName}` : ""}
        </div>
      </div>
      <div className="text-xs text-gray-500 shrink-0 w-16 text-center">
        {formatDate(row.executionDate)}
      </div>
      <div className="text-xs text-gray-500 shrink-0 w-12 text-center">
        {row.totalWorkers > 0 ? row.totalWorkers : "—"}
      </div>
      <div className="text-xs text-gray-700 shrink-0 w-20 text-left" dir="ltr">
        {row.billedAmount > 0 ? fmt(row.billedAmount) : "—"}
      </div>
      <div className="text-xs text-gray-700 shrink-0 w-20 text-left" dir="ltr">
        {row.totalCost > 0 ? fmt(row.totalCost) : "—"}
      </div>
      <div className={`text-xs font-bold shrink-0 w-20 text-left ${isLoss ? "text-red-700" : "text-green-700"}`} dir="ltr">
        {row.billedAmount > 0 ? `${isLoss ? "-" : "+"}${fmt(Math.abs(row.netProfit))}` : "—"}
      </div>
      <div className="shrink-0">
        <StatusBadge status={row.profitStatus} />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ProfitabilityPage() {
  const { diaries } = useWorkDiaryContext();
  const { rates } = useCostRatesContext();

  const [filterStatus, setFilterStatus] = useState<ProfitabilityStatus | "all">("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const rows = useMemo<RowData[]>(() =>
    diaries.map((d) => {
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
    if (filterStatus !== "all") res = res.filter((r) => r.profitStatus === filterStatus);
    if (filterFrom) res = res.filter((r) => r.executionDate >= filterFrom);
    if (filterTo) res = res.filter((r) => r.executionDate <= filterTo);
    return [...res].sort((a, b) => b.executionDate.localeCompare(a.executionDate));
  }, [rows, filterStatus, filterFrom, filterTo]);

  const agg = useMemo(() => {
    const results = diaries.map((d) => calculateProfitability(d, rates));
    return aggregateProfitability(results);
  }, [diaries, rates]);

  const filteredAgg = useMemo(() => {
    const results = filtered.map((r) => {
      const d = diaries.find((x) => x.id === r.id)!;
      return calculateProfitability(d, rates);
    });
    return aggregateProfitability(results);
  }, [filtered, diaries, rates]);

  const STATUSES: ProfitabilityStatus[] = ["profitable", "marginal", "breakeven", "loss", "no_data"];

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
              <h1 className="text-xl font-bold text-gray-900">דשבורד רווחיות</h1>
              <p className="text-xs text-gray-400">ניתוח כדאיות עבודה לפי ימי שטח</p>
            </div>
          </div>
          <Link
            href="/cost-settings"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            עדכן תעריפים
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 mt-4 space-y-4">
        {/* Global KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="סה״כ ימי עבודה" value={String(agg.totalDays)} accent="bg-blue-500" />
          <KpiCard label="ימים רווחיים" value={String(agg.profitableDays)} accent="bg-green-500" sub={agg.totalDays > 0 ? pct((agg.profitableDays / agg.totalDays) * 100) : undefined} />
          <KpiCard label="ימי הפסד" value={String(agg.lossDays)} accent="bg-red-500" sub={agg.totalDays > 0 ? pct((agg.lossDays / agg.totalDays) * 100) : undefined} />
          <KpiCard label="סה״כ הכנסות" value={agg.totalRevenue > 0 ? fmt(agg.totalRevenue) : "—"} accent="bg-teal-500" small />
          <KpiCard label="סה״כ עלויות" value={agg.totalCost > 0 ? fmt(agg.totalCost) : "—"} accent="bg-orange-500" small />
          <KpiCard
            label="רווח נקי כולל"
            value={agg.totalNetProfit !== 0 ? `${agg.totalNetProfit >= 0 ? "+" : ""}${fmt(agg.totalNetProfit)}` : "—"}
            accent={agg.totalNetProfit >= 0 ? "bg-green-600" : "bg-red-600"}
            sub={agg.totalRevenue > 0 ? `${pct(agg.avgMarginPercentage)} מרווח` : undefined}
            small
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-500 font-medium">סטטוס:</span>
              <button
                type="button"
                onClick={() => setFilterStatus("all")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === "all" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                הכל
              </button>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilterStatus(s)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === s ? STATUS_COLORS[s] + " ring-1 ring-current" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mr-auto">
              <span className="text-xs text-gray-500">מ-</span>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="px-2 py-1 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                dir="ltr"
              />
              <span className="text-xs text-gray-500">עד</span>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="px-2 py-1 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                dir="ltr"
              />
              {(filterFrom || filterTo || filterStatus !== "all") && (
                <button
                  type="button"
                  onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterStatus("all"); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  נקה
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filtered summary */}
        {filtered.length > 0 && (filterStatus !== "all" || filterFrom || filterTo) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="תוצאות מסוננות" value={String(filteredAgg.totalDays)} accent="bg-blue-400" />
            <KpiCard label="הכנסות בסינון" value={filteredAgg.totalRevenue > 0 ? fmt(filteredAgg.totalRevenue) : "—"} accent="bg-teal-400" small />
            <KpiCard label="עלויות בסינון" value={filteredAgg.totalCost > 0 ? fmt(filteredAgg.totalCost) : "—"} accent="bg-orange-400" small />
            <KpiCard
              label="רווח נקי (מסונן)"
              value={filteredAgg.totalNetProfit !== 0 ? `${filteredAgg.totalNetProfit >= 0 ? "+" : ""}${fmt(filteredAgg.totalNetProfit)}` : "—"}
              accent={filteredAgg.totalNetProfit >= 0 ? "bg-green-500" : "bg-red-500"}
              small
            />
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700">פירוט ימי עבודה</span>
            <span className="text-xs text-gray-400">{filtered.length} יומנים</span>
          </div>

          {/* Column headers */}
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
              <div className="text-3xl mb-2">📊</div>
              <p className="text-sm text-gray-500">אין יומנים מתאימים לסינון</p>
              {diaries.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  צור יומני עבודה ב
                  <Link href="/work-diary" className="text-blue-500 hover:underline mr-1">יומן עבודה</Link>
                  להתחיל לנתח רווחיות
                </p>
              )}
            </div>
          ) : (
            filtered.map((row) => <TableRow key={row.id} row={row} />)
          )}
        </div>

        {/* Footer note */}
        <div className="text-xs text-gray-400 text-center px-4 py-2">
          הנתונים מבוססים על יומני עבודה שמולאו ·{" "}
          <Link href="/cost-settings" className="text-blue-500 hover:underline">עדכן תעריפי עלות</Link>
        </div>
      </div>
    </div>
  );
}
