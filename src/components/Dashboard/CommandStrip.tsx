"use client";

interface Metric {
  label: string;
  value: number;
  accent: "default" | "red" | "amber" | "green" | "blue";
  onClick?: () => void;
}

function MetricChip({ label, value, accent, onClick }: Metric) {
  const colorMap = {
    default: "border-white/10 text-white",
    red:     value > 0 ? "border-red-400/40 text-red-300" : "border-white/10 text-white/50",
    amber:   value > 0 ? "border-amber-400/40 text-amber-300" : "border-white/10 text-white/50",
    green:   "border-emerald-400/30 text-emerald-300",
    blue:    "border-blue-400/30 text-blue-300",
  };

  const Wrapper = onClick
    ? ({ children, className }: { children: React.ReactNode; className: string }) => (
        <button onClick={onClick} className={className}>{children}</button>
      )
    : ({ children, className }: { children: React.ReactNode; className: string }) => (
        <div className={className}>{children}</div>
      );

  return (
    <Wrapper
      className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border bg-white/5 ${colorMap[accent]} ${
        onClick ? "hover:bg-white/10 cursor-pointer transition-colors" : ""
      }`}
    >
      <span className={`text-3xl font-black leading-none tabular-nums ${
        accent === "red" && value > 0 ? "text-red-300" :
        accent === "amber" && value > 0 ? "text-amber-300" :
        accent === "green" ? "text-emerald-300" :
        accent === "blue" ? "text-blue-300" :
        "text-white"
      }`}>
        {value}
      </span>
      <span className="text-[10px] font-medium text-center leading-tight opacity-70">{label}</span>
      {accent === "red" && value > 0 && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
      )}
    </Wrapper>
  );
}

interface CommandStripProps {
  openOrders: number;
  urgentOpen: number;
  criticalAlerts: number;
  stuckOrders: number;
  accountingPending: number;
  diariesPending: number;
  todayFieldDiaries: number;
  onUrgentClick: () => void;
  onSlaClick: () => void;
  onAccountingClick: () => void;
  onDiariesClick: () => void;
}

export function CommandStrip({
  openOrders,
  urgentOpen,
  criticalAlerts,
  stuckOrders,
  accountingPending,
  diariesPending,
  todayFieldDiaries,
  onUrgentClick,
  onSlaClick,
  onAccountingClick,
  onDiariesClick,
}: CommandStripProps) {
  const needsAttention = urgentOpen + stuckOrders;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-5">
      <MetricChip label="הזמנות פעילות" value={openOrders}       accent="default" />
      <MetricChip label="דורשות תשומת לב" value={needsAttention}  accent={needsAttention > 0 ? "amber" : "default"} onClick={needsAttention > 0 ? onUrgentClick : undefined} />
      <MetricChip label="חריגות SLA"      value={criticalAlerts}  accent={criticalAlerts > 0 ? "red" : "default"}   onClick={criticalAlerts > 0 ? onSlaClick : undefined} />
      <MetricChip label="ממתינות לחיוב"   value={accountingPending} accent={accountingPending > 0 ? "amber" : "default"} onClick={accountingPending > 0 ? onAccountingClick : undefined} />
      <MetricChip label="ביצוע שדה היום"  value={todayFieldDiaries} accent={todayFieldDiaries > 0 ? "blue" : "default"} />
      <MetricChip label="יומנים לאישור"   value={diariesPending}  accent={diariesPending > 0 ? "amber" : "default"} onClick={diariesPending > 0 ? onDiariesClick : undefined} />
    </div>
  );
}
