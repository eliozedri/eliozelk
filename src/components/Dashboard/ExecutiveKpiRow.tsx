"use client";

import {
  ClipboardList,
  Receipt,
  TriangleAlert,
  BookOpen,
  Clock,
  Gauge,
} from "lucide-react";

interface KpiCardProps {
  label: string;
  value: number | string;
  context: string;
  accentColor: string;
  borderColor: string;
  icon: React.ElementType;
  tint?: string;
  onClick?: () => void;
}

function KpiCard({
  label,
  value,
  context,
  accentColor,
  borderColor,
  icon: Icon,
  tint,
  onClick,
}: KpiCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        glass-card w-full min-w-0 px-4 py-4 text-right
        flex flex-col gap-1.5
        ${onClick
          ? "glass-card-interactive cursor-pointer active:scale-[0.99]"
          : "cursor-default transition-none"}
      `}
      style={{
        borderBottom: `4px solid ${borderColor}`,
        backgroundColor: tint ?? "white",
      }}
    >
      {/* Label + icon row */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-gray-600 leading-tight truncate">
          {label}
        </p>
        <Icon
          className="w-4 h-4 shrink-0"
          style={{ color: accentColor, opacity: 0.65 }}
        />
      </div>

      {/* Primary metric — dominates the card */}
      <p
        className="text-3xl font-black leading-none tabular-nums"
        style={{ color: accentColor }}
      >
        {value}
      </p>

      {/* Supporting context */}
      <p className="text-[11px] text-gray-400 leading-tight truncate">
        {context}
      </p>
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
    <div className="px-6 pt-4 pb-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard
        label="הזמנות פעילות"
        value={openOrders}
        context="לא כולל מבוטלים"
        accentColor="#1d6fd8"
        borderColor="#1d6fd8"
        icon={ClipboardList}
        onClick={onActiveOrdersClick}
      />
      <KpiCard
        label="ממתינות לחיוב"
        value={accountingPending}
        context="הושלמו, טרם חויבו"
        accentColor="#d97706"
        borderColor="#f59e0b"
        icon={Receipt}
        onClick={onAccountingClick}
      />
      <KpiCard
        label="חריגות SLA"
        value={criticalAlerts}
        context="הזמנות בחריגת זמן"
        accentColor={criticalAlerts > 0 ? "#dc2626" : "#6b7280"}
        borderColor={criticalAlerts > 0 ? "#ef4444" : "#e5e7eb"}
        icon={TriangleAlert}
        tint={criticalAlerts > 0 ? "#fef2f2" : undefined}
        onClick={onSlaClick}
      />
      <KpiCard
        label="יומני שדה היום"
        value={todayFieldDiaries}
        context="דיווח שדה פעיל"
        accentColor="#0d9488"
        borderColor="#14b8a6"
        icon={BookOpen}
        onClick={onDiariesClick}
      />
      <KpiCard
        label="יומנים לאישור"
        value={diariesPending}
        context="ממתינים לאישור"
        accentColor={diariesPending > 0 ? "#7c3aed" : "#6b7280"}
        borderColor={diariesPending > 0 ? "#8b5cf6" : "#e5e7eb"}
        icon={Clock}
        tint={diariesPending > 0 ? "#f5f3ff" : undefined}
        onClick={onDiariesClick}
      />
      <KpiCard
        label="ניצולת צוותים"
        value={`${capacityUtilizationPct}%`}
        context={`${scheduledHoursThisWeek}/${totalCapacityHoursPerWeek} שעות השבוע`}
        accentColor={
          capacityUtilizationPct > 90
            ? "#dc2626"
            : capacityUtilizationPct > 70
            ? "#d97706"
            : "#0d9488"
        }
        borderColor="#0d1b2e"
        icon={Gauge}
        tint={capacityUtilizationPct > 90 ? "#fef2f2" : undefined}
      />
    </div>
  );
}
