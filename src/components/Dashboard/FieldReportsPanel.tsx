"use client";

interface ReportRow {
  label: string;
  count: number;
  severity: "info" | "warn" | "critical" | "neutral";
  onClick?: () => void;
}

function ReportRowItem({ label, count, severity, onClick }: ReportRow) {
  const accent: Record<string, string> = {
    critical: "border-r-red-500 bg-red-50/40",
    warn:     "border-r-amber-400 bg-amber-50/30",
    info:     "border-r-blue-400 bg-blue-50/20",
    neutral:  "border-r-gray-200",
  };
  const badge: Record<string, string> = {
    critical: "bg-red-100 text-red-700 font-bold",
    warn:     "bg-amber-100 text-amber-700 font-bold",
    info:     "bg-blue-100 text-blue-700 font-semibold",
    neutral:  "bg-gray-100 text-gray-600",
  };

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center justify-between px-3 py-2.5 border-r-2 mb-1.5 rounded-lg
        ${accent[severity]}
        ${onClick ? "cursor-pointer hover:bg-opacity-80 transition-colors" : ""}
      `}
    >
      <span className={`text-xs ${count > 0 ? "font-semibold text-gray-800" : "text-gray-500"}`}>{label}</span>
      <span className={`text-sm px-2 py-0.5 rounded tabular-nums ${badge[severity]}`}>{count}</span>
    </div>
  );
}

interface Props {
  missingDiaryJobs: number;
  draftDiariesCount: number;
  diariesPending: number;
  todayFieldDiaries: number;
  submittedDiariesCount: number;
  onDiariesClick: () => void;
}

export function FieldReportsPanel({
  missingDiaryJobs,
  draftDiariesCount,
  diariesPending,
  todayFieldDiaries,
  submittedDiariesCount,
  onDiariesClick,
}: Props) {
  const allClear = missingDiaryJobs === 0 && draftDiariesCount === 0 && diariesPending === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">דוחות שדה ותיעוד</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">יומנים · חתימות · אישורים</p>
      </div>
      <div className="px-3 py-3">
        {allClear && (
          <p className="text-xs text-emerald-600 font-medium text-center py-1 mb-2">✓ כל הדוחות הושלמו</p>
        )}
        <ReportRowItem
          label="יומנים ללא חתימת לקוח"
          count={missingDiaryJobs}
          severity={missingDiaryJobs > 0 ? "critical" : "neutral"}
          onClick={missingDiaryJobs > 0 ? onDiariesClick : undefined}
        />
        <ReportRowItem
          label="יומנים בטיוטה (לא הוגשו)"
          count={draftDiariesCount}
          severity={draftDiariesCount > 0 ? "warn" : "neutral"}
          onClick={draftDiariesCount > 0 ? onDiariesClick : undefined}
        />
        <ReportRowItem
          label="יומנים ממתינים לאישור"
          count={diariesPending}
          severity={diariesPending > 0 ? "warn" : "neutral"}
          onClick={diariesPending > 0 ? onDiariesClick : undefined}
        />
        <ReportRowItem
          label="יומני שדה היום"
          count={todayFieldDiaries}
          severity="info"
        />
        <ReportRowItem
          label="סה״כ יומנים שהוגשו"
          count={submittedDiariesCount}
          severity="neutral"
        />
      </div>
    </div>
  );
}
