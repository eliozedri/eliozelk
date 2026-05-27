"use client";

import { useMemo, useState, useCallback } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useCrewsContext } from "@/context/CrewsContext";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import type { WorkOrder } from "@/types/workOrder";
import type { Crew } from "@/types/crew";
import { getSlaColor, SLA_COLORS, formatWaitingDuration } from "@/lib/slaUtils";
import { diaryCompletionStatus, type DiaryCompletionStatus } from "@/lib/executionUtils";
import { openWorkOrderPDF } from "@/lib/pdfExport";
import { isSchedulingCandidate } from "@/lib/workflowEngine";

// ── Week helpers ─────────────────────────────────────────────────────────────

const WEEK_DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"];
const MONTH_NAMES_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function getWeekDates(weekOffset: number): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek + weekOffset * 7);
  sunday.setHours(0, 0, 0, 0);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDayHeader(d: Date): string {
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

// ── Multi-day span helpers ────────────────────────────────────────────────────

interface JobSlot {
  order: WorkOrder;
  dayIndex: number;  // 1-based: which day of the job's span this slot represents
  totalDays: number; // total duration (estimatedDurationDays)
}

// Returns all ISO dates covered by a job (scheduledDate + estimatedDurationDays days).
// Does NOT skip Saturdays — the board simply has no Saturday column, so those dates
// fall outside the grid automatically.
function getJobSpanDates(order: WorkOrder): string[] {
  if (!order.scheduledDate) return [];
  const n = Math.max(1, order.estimatedDurationDays ?? 1);
  const start = new Date(order.scheduledDate + "T00:00:00");
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISODate(d);
  });
}

// Returns the best display title for a job — prefers jobName over customer/order number
function jobDisplayTitle(order: WorkOrder): string {
  if (order.jobName?.trim()) return order.jobName.trim();
  if (order.customer?.trim()) return order.customer.trim();
  return order.orderNumber;
}

// ── Job Detail Modal (click existing scheduled job) ──────────────────────────

interface JobDetailModalProps {
  order: WorkOrder;
  crews: Crew[];
  onEdit: () => void;
  onCancelAssignment: () => void;
  onClose: () => void;
}

function JobDetailModal({ order, crews, onEdit, onCancelAssignment, onClose }: JobDetailModalProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handleViewPDF() {
    setPdfLoading(true);
    try {
      await openWorkOrderPDF(order);
    } finally {
      setPdfLoading(false);
    }
  }

  const crewName = crews.find((c) => c.id === order.assignedCrewId)?.name ?? "לא ידוע";
  const title = jobDisplayTitle(order);
  const subtitle = order.location?.trim() || order.city?.trim() || "";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" dir="rtl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">פרטי שיבוץ</p>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Details — scrollable if content is long */}
        <div className="px-6 py-4 space-y-2.5 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] max-h-[55dvh]">

          {/* Order identity */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">מספר הזמנה</span>
            <span className="font-semibold text-gray-800 font-mono">{order.orderNumber}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">לקוח</span>
            <span className="font-semibold text-gray-800">{order.customer}</span>
          </div>
          {order.location && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">מקום עבודה</span>
              <span className="font-semibold text-gray-800 text-right max-w-[220px]">{order.location}</span>
            </div>
          )}

          <div className="h-px bg-gray-100" />

          {/* Order items */}
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">פירוט הזמנה</p>
          {(() => {
            const signs = (order.signRows ?? []).filter((r) => r.signNumber?.trim());
            const accessories = (order.accessoryRows ?? []).filter((r) => r.description?.trim());
            const misc = (order.miscRows ?? []).filter((r) => r.description?.trim());
            const hasItems = signs.length > 0 || accessories.length > 0 || misc.length > 0;
            if (!hasItems) return (
              <p className="text-sm text-gray-400 italic">אין פריטים מפורטים בהזמנה</p>
            );
            return (
              <div className="space-y-1">
                {signs.map((r) => (
                  <div key={r.id} className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 truncate max-w-[60%]">
                      תמרור {r.signNumber}{r.size ? ` · ${r.size}` : ""}{r.type ? ` · ${r.type}` : ""}
                    </span>
                    <span className="font-semibold text-gray-800 shrink-0">× {r.quantity || 1}</span>
                  </div>
                ))}
                {accessories.map((r) => (
                  <div key={r.id} className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 truncate max-w-[60%]">{r.description}</span>
                    <span className="font-semibold text-gray-800 shrink-0">× {r.quantity || 1}</span>
                  </div>
                ))}
                {misc.map((r) => (
                  <div key={r.id} className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 truncate max-w-[60%]">{r.description}</span>
                    <span className="font-semibold text-gray-800 shrink-0">× {r.quantity || 1}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="h-px bg-gray-100" />

          {/* Assignment details */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">צוות משובץ</span>
            <span className="font-semibold text-gray-800">{crewName}</span>
          </div>
          {order.scheduledDate && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">תאריך מתוכנן</span>
              <span className="font-semibold text-gray-800">{order.scheduledDate}</span>
            </div>
          )}
          {order.estimatedExecutionHours != null && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">זמן ביצוע משוער</span>
              <span className="font-semibold text-gray-800">{order.estimatedExecutionHours} שעות</span>
            </div>
          )}
          {order.requiredWorkers != null && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">כמות עובדים נדרשת</span>
              <span className="font-semibold text-gray-800">{order.requiredWorkers} עובדים</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
          {!confirmCancel ? (
            <>
              <button
                onClick={handleViewPDF}
                disabled={pdfLoading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>📄</span>
                <span>{pdfLoading ? "טוען..." : "הצג הזמנה PDF"}</span>
              </button>
              <button
                onClick={onEdit}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                ✏️ עריכת שיבוץ
              </button>
              <button
                onClick={() => setConfirmCancel(true)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
              >
                🚫 ביטול שיבוץ
              </button>
              <button
                onClick={onClose}
                className="w-full py-2 rounded-xl text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              >
                סגור
              </button>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                <p className="text-sm font-semibold text-amber-800">
                  האם לבטל את השיבוץ ולהחזיר את העבודה להמתנה לשיבוץ מחדש?
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  ההזמנה לא תימחק. היא תחזור לרשימת הממתינות לשיבוץ.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onCancelAssignment}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
                >
                  כן, בטל שיבוץ
                </button>
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  חזור
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Assign / Edit Modal ───────────────────────────────────────────────────────

interface AssignModalProps {
  order: WorkOrder;
  crews: Crew[];
  weekDates: Date[];
  onAssign: (orderId: string, crewId: string, date: string, hours: number, workers: number, durationDays: number) => void;
  onClose: () => void;
}

function AssignModal({ order, crews, weekDates, onAssign, onClose }: AssignModalProps) {
  const activeCrews = crews.filter((c) => c.active);
  const [crewId, setCrewId] = useState(order.assignedCrewId ?? activeCrews[0]?.id ?? "");
  const [dateStr, setDateStr] = useState(order.scheduledDate ?? toISODate(weekDates[0]));
  const [hours, setHours] = useState(order.estimatedExecutionHours ?? 4);
  const [workers, setWorkers] = useState(order.requiredWorkers ?? 2);
  const [durationDays, setDurationDays] = useState(order.estimatedDurationDays ?? 1);

  const title = jobDisplayTitle(order);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4" dir="rtl">
        <div>
          <h2 className="text-lg font-bold text-gray-900">שיבוץ לצוות ותאריך</h2>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{order.orderNumber} · {title}</p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">צוות</label>
            {activeCrews.length === 0 ? (
              <p className="text-sm text-amber-600">אין צוותים פעילים. הוסף צוות קודם בדף ״צוותי שטח״.</p>
            ) : (
              <select
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                value={crewId}
                onChange={(e) => setCrewId(e.target.value)}
              >
                {activeCrews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.leader})</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">תאריך ביצוע</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            >
              {weekDates.map((d, i) => (
                <option key={toISODate(d)} value={toISODate(d)}>
                  {WEEK_DAYS_HE[i]} {formatDayHeader(d)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">זמן ביצוע משוער (שעות)</label>
            <input
              type="number" min={0.5} max={24} step={0.5}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">כמות עובדים נדרשת</label>
            <input
              type="number" min={1} max={50} step={1}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              value={workers}
              onChange={(e) => setWorkers(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">מספר ימי עבודה</label>
            <input
              type="number" min={1} max={30} step={1}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              value={durationDays}
              onChange={(e) => setDurationDays(Math.max(1, parseInt(e.target.value) || 1))}
            />
            {durationDays > 1 && (
              <p className="text-[10px] text-blue-600 mt-0.5">
                העבודה תוצג ב-{durationDays} ימים החל מהתאריך שנבחר
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ביטול
          </button>
          <button
            disabled={!crewId || activeCrews.length === 0}
            onClick={() => { onAssign(order.id, crewId, dateStr, hours, workers, durationDays); onClose(); }}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            שמור שיבוץ
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job chip for the board ───────────────────────────────────────────────────

const DIARY_STATUS_CHIP: Record<DiaryCompletionStatus, { label: string; cls: string } | null> = {
  none:      { label: "אין יומן", cls: "text-amber-600" },
  draft:     { label: "טיוטה", cls: "text-gray-400" },
  submitted: { label: "יומן נשלח", cls: "text-blue-600" },
  approved:  { label: "יומן אושר", cls: "text-emerald-600" },
  rejected:  { label: "יומן נדחה", cls: "text-red-500" },
};

function JobChip({ order, diaryStatus, onClick, dayIndex = 1, totalDays = 1 }: {
  order: WorkOrder;
  diaryStatus: DiaryCompletionStatus;
  onClick: () => void;
  dayIndex?: number;
  totalDays?: number;
}) {
  const slaColor = getSlaColor(order.readyForExecutionAt);
  const { dot } = SLA_COLORS[slaColor];
  const chip = DIARY_STATUS_CHIP[diaryStatus];
  const title = jobDisplayTitle(order);
  const sub = order.location?.trim() || order.city?.trim() || order.customer;
  const isMultiDay = totalDays > 1;
  // Continuation days (not the first) are visually distinguished
  const chipBg = isMultiDay && dayIndex > 1
    ? "bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
    : "bg-blue-50 border-blue-200 hover:bg-blue-100";

  return (
    <button
      onClick={onClick}
      className={`w-full text-right px-2 py-1.5 rounded-lg border transition-colors flex items-start gap-1.5 text-xs group ${chipBg}`}
    >
      <div className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="font-bold text-gray-900 truncate">{title}</div>
        {sub && <div className="text-gray-500 truncate text-[10px]">{sub}</div>}
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {isMultiDay && (
            <span className="text-[9px] font-bold text-indigo-600 bg-indigo-100 px-1 rounded">
              יום {dayIndex}/{totalDays}
            </span>
          )}
          {order.estimatedExecutionHours && !isMultiDay && (
            <span className="text-blue-600">{order.estimatedExecutionHours}h</span>
          )}
          {order.requiredWorkers && (
            <span className="text-gray-500">{order.requiredWorkers} עובדים</span>
          )}
          {chip && (
            <span className={`text-[9px] font-semibold ${chip.cls}`}>{chip.label}</span>
          )}
        </div>
      </div>
      <span className="text-gray-300 group-hover:text-gray-400 text-[10px] shrink-0 mt-0.5">✏️</span>
    </button>
  );
}

// ── Unscheduled job card ─────────────────────────────────────────────────────

function UnscheduledJobCard({ order, onAssign }: { order: WorkOrder; onAssign: () => void }) {
  const slaColor = getSlaColor(order.readyForExecutionAt);
  const { bg, text, dot } = SLA_COLORS[slaColor];
  const title = jobDisplayTitle(order);
  const sub = order.location?.trim() || order.city?.trim() || "";

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3 flex flex-col gap-2 ${slaColor === "red" ? "border-red-200" : "border-gray-200"}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
          <span className="font-bold text-sm text-gray-900 truncate">{title}</span>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${bg} ${text}`}>
          {formatWaitingDuration(order.readyForExecutionAt)}
        </span>
      </div>
      <div className="text-[10px] font-mono text-gray-400">{order.orderNumber}</div>
      {sub && <div className="text-xs text-gray-400 truncate">{sub}</div>}
      {order.estimatedExecutionHours ? (
        <div className="text-xs text-gray-600 font-medium">{order.estimatedExecutionHours} שע׳ משוערות</div>
      ) : (
        <div className="text-xs text-amber-600">⚠ זמן ביצוע לא הוזן</div>
      )}
      <button
        onClick={onAssign}
        className="w-full py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
      >
        שבץ לצוות
      </button>
    </div>
  );
}

// ── Monthly View ─────────────────────────────────────────────────────────────

interface MonthlyViewProps {
  orders: WorkOrder[];
  onJobClick: (o: WorkOrder) => void;
  showCompleted: boolean;
}

function MonthlyView({ orders, onJobClick, showCompleted }: MonthlyViewProps) {
  const [monthOffset, setMonthOffset] = useState(0);

  const visibleOrders = useMemo(
    () => showCompleted ? orders : orders.filter(o => o.status !== "completed"),
    [orders, showCompleted]
  );

  const { year, month, label, days } = useMemo(() => {
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + monthOffset);
    const y = base.getFullYear();
    const m = base.getMonth();
    const firstDay = new Date(y, m, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    // Build calendar grid: pad start with nulls so day 1 falls on correct column
    const grid: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(d);
    // Pad end to full rows (multiple of 6 for Sun-Fri)
    while (grid.length % 6 !== 0) grid.push(null);
    // Remove trailing rows that are all null AND all days in them are > daysInMonth
    return { year: y, month: m, label: `${MONTH_NAMES_HE[m]} ${y}`, days: grid };
  }, [monthOffset]);

  const scheduledByDay = useMemo(() => {
    const map: Record<string, JobSlot[]> = {};
    for (const o of visibleOrders) {
      if (!o.scheduledDate) continue;
      const totalDays = Math.max(1, o.estimatedDurationDays ?? 1);
      getJobSpanDates(o).forEach((date, idx) => {
        const d = new Date(date + "T00:00:00");
        if (d.getFullYear() === year && d.getMonth() === month) {
          const key = String(d.getDate());
          if (!map[key]) map[key] = [];
          map[key].push({ order: o, dayIndex: idx + 1, totalDays });
        }
      });
    }
    return map;
  }, [visibleOrders, year, month]);

  const todayStr = toISODate(new Date());
  const todayDay = (() => {
    const t = new Date();
    return t.getFullYear() === year && t.getMonth() === month ? t.getDate() : -1;
  })();

  return (
    <div className="glass-card overflow-hidden">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <button
          onClick={() => setMonthOffset((v) => v - 1)}
          className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-800">{label}</span>
          {monthOffset !== 0 && (
            <button
              onClick={() => setMonthOffset(0)}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              החודש הנוכחי
            </button>
          )}
        </div>
        <button
          onClick={() => setMonthOffset((v) => v + 1)}
          className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-6 border-b border-gray-100">
        {WEEK_DAYS_HE.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 bg-gray-50 border-l border-gray-100 first:border-l-0">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {Array.from({ length: days.length / 6 }, (_, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-6 border-b border-gray-100 last:border-b-0">
          {days.slice(rowIdx * 6, rowIdx * 6 + 6).map((dayNum, colIdx) => {
            if (dayNum === null) {
              return <div key={colIdx} className="min-h-[90px] border-l border-gray-100 first:border-l-0 bg-gray-50/50" />;
            }
            const jobs = scheduledByDay[String(dayNum)] ?? [];
            const isToday = dayNum === todayDay;
            const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            const isPast = isoDate < todayStr;
            return (
              <div
                key={colIdx}
                className={`min-h-[90px] border-l border-gray-100 first:border-l-0 p-1.5 flex flex-col gap-1 ${isToday ? "bg-blue-50/60" : isPast ? "bg-gray-50/30" : ""}`}
              >
                <div className={`text-xs font-bold self-end px-1 rounded ${isToday ? "bg-blue-600 text-white px-1.5 py-0.5 rounded-full" : "text-gray-500"}`}>
                  {dayNum}
                </div>
                {jobs.map((slot) => {
                  const title = jobDisplayTitle(slot.order);
                  const isMultiDay = slot.totalDays > 1;
                  const chipBg = isMultiDay && slot.dayIndex > 1
                    ? "bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
                    : "bg-blue-50 border-blue-200 hover:bg-blue-100";
                  return (
                    <button
                      key={`${slot.order.id}-${slot.dayIndex}`}
                      onClick={() => onJobClick(slot.order)}
                      className={`w-full text-right px-1.5 py-1 rounded border transition-colors flex flex-col gap-0.5 text-[10px] ${chipBg}`}
                    >
                      <span className="font-bold text-gray-900 truncate leading-tight">{title}</span>
                      {isMultiDay ? (
                        <span className="text-indigo-600 font-bold">יום {slot.dayIndex}/{slot.totalDays}</span>
                      ) : slot.order.estimatedExecutionHours != null ? (
                        <span className="text-blue-600 font-medium">{slot.order.estimatedExecutionHours}h</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function WeeklySchedule() {
  const { orders, updateOrderFields } = useOrdersContext();
  const { crews } = useCrewsContext();
  const { diaries } = useWorkDiaryContext();

  const [weekOffset, setWeekOffset] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  // viewingOrder: an already-scheduled job the user clicked → shows JobDetailModal
  const [viewingOrder, setViewingOrder] = useState<WorkOrder | null>(null);
  // assigningOrder: job being assigned/re-assigned → shows AssignModal
  const [assigningOrder, setAssigningOrder] = useState<WorkOrder | null>(null);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekLabel = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[5];
    return `${formatDayHeader(start)} – ${formatDayHeader(end)} ${start.getFullYear()}`;
  }, [weekDates]);

  const readyOrders = useMemo(() =>
    orders.filter((o) => isSchedulingCandidate(o)),
    [orders]
  );

  const unscheduled = useMemo(() =>
    readyOrders.filter((o) => !o.scheduledDate).sort((a, b) => {
      const ca = getSlaColor(a.readyForExecutionAt);
      const cb = getSlaColor(b.readyForExecutionAt);
      const order = { red: 0, yellow: 1, green: 2, gray: 3 };
      return order[ca] - order[cb];
    }),
    [readyOrders]
  );

  const weekDateStrings = useMemo(() => weekDates.map(toISODate), [weekDates]);

  const scheduledThisWeek = useMemo(() =>
    readyOrders.filter((o) =>
      o.scheduledDate && getJobSpanDates(o).some(d => weekDateStrings.includes(d))
    ),
    [readyOrders, weekDateStrings]
  );

  const handleAssign = useCallback((orderId: string, crewId: string, date: string, hours: number, workers: number, durationDays: number) => {
    updateOrderFields(orderId, {
      assignedCrewId: crewId,
      scheduledDate: date,
      estimatedExecutionHours: hours,
      requiredWorkers: workers,
      estimatedDurationDays: durationDays,
    });
  }, [updateOrderFields]);

  const handleCancelAssignment = useCallback((orderId: string) => {
    updateOrderFields(orderId, {
      assignedCrewId: null,
      scheduledDate: null,
      requiredWorkers: null,
    });
    setViewingOrder(null);
  }, [updateOrderFields]);

  const completedThisWeek = useMemo(() => {
    if (!showCompleted) return [];
    return orders.filter(
      (o) => o.status === "completed" && o.scheduledDate &&
        getJobSpanDates(o).some(d => weekDateStrings.includes(d))
    );
  }, [orders, showCompleted, weekDateStrings]);

  // Per crew/day workload — each entry is a JobSlot so we know day index/total for multi-day jobs
  const workloadMap = useMemo(() => {
    const map: Record<string, Record<string, JobSlot[]>> = {};
    for (const crew of crews) {
      map[crew.id] = {};
      for (const d of weekDateStrings) map[crew.id][d] = [];
    }
    for (const o of [...scheduledThisWeek, ...completedThisWeek]) {
      if (!o.assignedCrewId || !map[o.assignedCrewId]) continue;
      const totalDays = Math.max(1, o.estimatedDurationDays ?? 1);
      getJobSpanDates(o).forEach((date, idx) => {
        if (map[o.assignedCrewId!]?.[date] !== undefined) {
          map[o.assignedCrewId!][date].push({ order: o, dayIndex: idx + 1, totalDays });
        }
      });
    }
    return map;
  }, [scheduledThisWeek, completedThisWeek, crews, weekDateStrings]);

  const activeCrews = useMemo(() => crews.filter((c) => c.active), [crews]);

  const urgentCount = useMemo(
    () => unscheduled.filter((o) => getSlaColor(o.readyForExecutionAt) === "red").length,
    [unscheduled]
  );

  const todayStr = toISODate(new Date());

  return (
    <div className="min-h-screen py-6 px-4">
      <div className="max-w-[1400px] mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold scene-title">{viewMode === "month" ? "סידור חודשי" : "סידור שבועי"}</h1>
            <p className="text-sm scene-subtitle mt-0.5">שיבוץ עבודות לצוותים לפי ימים</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("week")}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${viewMode === "week" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                שבועי
              </button>
              <button
                type="button"
                onClick={() => setViewMode("month")}
                className={`px-3 py-1.5 text-xs font-bold transition-colors border-r border-gray-200 ${viewMode === "month" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                חודשי
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowCompleted(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                showCompleted
                  ? "bg-gray-200 text-gray-700 border-gray-300"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {showCompleted ? "הסתר הושלמו" : "הצג הושלמו"}
            </button>
            {viewMode === "week" && (
              <>
                <button
                  onClick={() => setWeekOffset((w) => w - 1)}
                  className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  onClick={() => setWeekOffset(0)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${weekOffset === 0 ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                >
                  השבוע
                </button>
                <button
                  onClick={() => setWeekOffset((w) => w + 1)}
                  className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <span className="text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                  {weekLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            {unscheduled.length} לא משובצות
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            {scheduledThisWeek.length} משובצות השבוע
          </span>
          {urgentCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
              ⚠ {urgentCount} דחופות לא משובצות
            </span>
          )}
        </div>

        {/* Monthly view */}
        {viewMode === "month" && (
          <MonthlyView orders={orders} onJobClick={setViewingOrder} showCompleted={showCompleted} />
        )}

        {/* Weekly view */}
        {viewMode === "week" && <div className="flex flex-col gap-4 md:flex-row md:items-start">

          {/* Unscheduled jobs — full width on mobile, fixed sidebar on desktop */}
          <div className="w-full md:w-64 md:shrink-0 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <h2 className="text-sm font-bold text-gray-700">ממתינות לשיבוץ</h2>
              <span className="text-xs text-gray-400">({unscheduled.length})</span>
            </div>
            {unscheduled.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
                כל העבודות שובצו 🎉
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto">
                {unscheduled.map((o) => (
                  <UnscheduledJobCard
                    key={o.id}
                    order={o}
                    onAssign={() => setAssigningOrder(o)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Week board — horizontally scrollable on mobile */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            {activeCrews.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
                <div className="text-3xl mb-2">👷</div>
                לא הוגדרו צוותים. עבור ל<a href="/crews" className="text-blue-600 underline">צוותי שטח</a> כדי להוסיף צוות.
              </div>
            ) : (
              <div className="glass-card overflow-hidden">
                {/* Header row */}
                <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: `180px repeat(6, 1fr)` }}>
                  <div className="px-3 py-2.5 text-xs font-semibold text-gray-500 bg-gray-50 border-l border-gray-200">צוות</div>
                  {weekDates.map((d, i) => (
                    <div key={toISODate(d)} className={`px-2 py-2.5 text-center border-l border-gray-200 ${toISODate(d) === todayStr ? "bg-blue-50" : "bg-gray-50"}`}>
                      <div className="text-xs font-bold text-gray-700">{WEEK_DAYS_HE[i]}</div>
                      <div className="text-xs text-gray-400">{formatDayHeader(d)}</div>
                    </div>
                  ))}
                </div>

                {/* Crew rows */}
                {activeCrews.map((crew) => (
                  <div key={crew.id} className="grid border-b border-gray-100 last:border-b-0" style={{ gridTemplateColumns: `180px repeat(6, 1fr)` }}>
                    {/* Crew name cell */}
                    <div className="px-3 py-2 border-l border-gray-200 flex flex-col justify-center bg-gray-50/50">
                      <div className="text-xs font-bold text-gray-800">{crew.name}</div>
                      <div className="text-[10px] text-gray-400">{crew.leader}</div>
                      <div className="text-[10px] text-gray-400">קיב׳ {crew.dailyCapacityHours}h</div>
                    </div>

                    {/* Day cells */}
                    {weekDateStrings.map((dateStr) => {
                      const slots = workloadMap[crew.id]?.[dateStr] ?? [];
                      // Per-day hours: for multi-day jobs, divide total hours by duration to avoid double-counting
                      const totalHours = slots.reduce((s, slot) =>
                        s + (slot.order.estimatedExecutionHours ?? 0) / slot.totalDays, 0
                      );
                      const overload = totalHours > crew.dailyCapacityHours;
                      const isToday = dateStr === todayStr;
                      return (
                        <div
                          key={dateStr}
                          className={`px-1.5 py-1.5 border-l border-gray-200 min-h-[80px] flex flex-col gap-1 ${overload ? "bg-red-50" : isToday ? "bg-blue-50/50" : ""}`}
                        >
                          {slots.length > 0 && (
                            <div className={`text-[9px] font-bold text-right mb-0.5 ${overload ? "text-red-600" : "text-gray-400"}`}>
                              {Math.round(totalHours * 10) / 10}h {overload ? "⚠ עומס" : ""}
                            </div>
                          )}
                          {slots.map((slot) => (
                            <JobChip
                              key={`${slot.order.id}-${slot.dayIndex}`}
                              order={slot.order}
                              diaryStatus={diaryCompletionStatus(diaries, slot.order.id)}
                              onClick={() => setViewingOrder(slot.order)}
                              dayIndex={slot.dayIndex}
                              totalDays={slot.totalDays}
                            />
                          ))}
                          {unscheduled.length > 0 && (
                            <button
                              onClick={() => setAssigningOrder(unscheduled[0])}
                              className="w-full py-1 rounded text-[9px] text-gray-300 hover:text-gray-400 hover:bg-gray-50 transition-colors border border-dashed border-transparent hover:border-gray-200"
                            >
                              + שבץ
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>}

      </div>

      {/* Job detail modal — for already-scheduled jobs */}
      {viewingOrder && !assigningOrder && (
        <JobDetailModal
          order={viewingOrder}
          crews={crews}
          onEdit={() => {
            setAssigningOrder(viewingOrder);
            setViewingOrder(null);
          }}
          onCancelAssignment={() => handleCancelAssignment(viewingOrder.id)}
          onClose={() => setViewingOrder(null)}
        />
      )}

      {/* Assign / edit modal */}
      {assigningOrder && (
        <AssignModal
          order={assigningOrder}
          crews={crews}
          weekDates={weekDates}
          onAssign={handleAssign}
          onClose={() => setAssigningOrder(null)}
        />
      )}
    </div>
  );
}
