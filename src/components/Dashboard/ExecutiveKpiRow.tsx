"use client";

interface KpiCardProps {
  label: string;
  value: number | string;
  context: string;
  accentColor: string;
  borderColor: string;
  onClick?: () => void;
}

function KpiCard({ label, value, context, accentColor, borderColor, onClick }: KpiCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        flex-1 min-w-0 bg-white rounded-xl px-4 py-3.5 text-right
        border border-gray-100 shadow-sm
        ${onClick ? "hover:shadow-md hover:border-gray-200 transition-all cursor-pointer active:scale-[0.99]" : "cursor-default"}
        flex flex-col gap-1
      `}
      style={{ borderBottom: `3px solid ${borderColor}` }}
    >
      <p className="text-[11px] font-semibold text-gray-500 leading-tight truncate">{label}</p>
      <p className="text-2xl font-black leading-none tabular-nums" style={{ color: accentColor }}>{value}</p>
      <p className="text-[10px] text-gray-400 leading-tight truncate">{context}</p>
    </button>
  );
}

interface Props {
  openOrders: number;
  accountingPending: number;
  criticalAlerts: number;
  todayFieldDiaries: number;
  diariesPending: number;
  capacityUtilizationPct: number;
  scheduledHoursThisWeek: number;
  totalCapacityHoursPerWeek: number;
  onActiveOrdersClick: () => void;
  onAccountingClick: () => void;
  onSlaClick: () => void;
  onDiariesClick: () => void;
}

export function ExecutiveKpiRow({
  openOrders,
  accountingPending,
  criticalAlerts,
  todayFieldDiaries,
  diariesPending,
  capacityUtilizationPct,
  scheduledHoursThisWeek,
  totalCapacityHoursPerWeek,
  onActiveOrdersClick,
  onAccountingClick,
  onSlaClick,
  onDiariesClick,
}: Props) {
  return (
    <div className="px-6 pt-4 pb-2 flex gap-3 flex-wrap sm:flex-nowrap">
      <KpiCard
        label="הזמנות פעילות"
        value={openOrders}
        context="לא כולל מבוטלים"
        accentColor="#1d6fd8"
        borderColor="#1d6fd8"
        onClick={onActiveOrdersClick}
      />
      <KpiCard
        label="ממתינות לחיוב"
        value={accountingPending}
        context="הושלמו, טרם חויבו"
        accentColor="#d97706"
        borderColor="#f59e0b"
        onClick={onAccountingClick}
      />
      <KpiCard
        label="חריגות SLA"
        value={criticalAlerts}
        context="הזמנות בחריגת זמן"
        accentColor={criticalAlerts > 0 ? "#dc2626" : "#6b7280"}
        borderColor={criticalAlerts > 0 ? "#ef4444" : "#e5e7eb"}
        onClick={onSlaClick}
      />
      <KpiCard
        label="יומני שדה היום"
        value={todayFieldDiaries}
        context="דיווח שדה פעיל"
        accentColor="#0d9488"
        borderColor="#14b8a6"
        onClick={onDiariesClick}
      />
      <KpiCard
        label="יומנים לאישור"
        value={diariesPending}
        context="ממתינים לאישור"
        accentColor={diariesPending > 0 ? "#7c3aed" : "#6b7280"}
        borderColor={diariesPending > 0 ? "#8b5cf6" : "#e5e7eb"}
        onClick={onDiariesClick}
      />
      <KpiCard
        label="ניצולת צוותים"
        value={`${capacityUtilizationPct}%`}
        context={`${scheduledHoursThisWeek}/${totalCapacityHoursPerWeek} שעות השבוע`}
        accentColor={capacityUtilizationPct > 90 ? "#dc2626" : capacityUtilizationPct > 70 ? "#d97706" : "#0d9488"}
        borderColor="#0d1b2e"
      />
    </div>
  );
}
