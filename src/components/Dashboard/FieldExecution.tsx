"use client";

import Link from "next/link";

interface Props {
  todayFieldDiaries: number;
  submittedDiariesCount: number;
  draftDiariesCount: number;
  diariesPending: number;
  missingDiaryJobs: number;
}

function StatRow({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string | number;
  accent?: "neutral" | "amber" | "red" | "green" | "blue";
}) {
  const valueCls =
    accent === "amber" ? "text-amber-600 font-bold" :
    accent === "red"   ? "text-red-600 font-bold"   :
    accent === "green" ? "text-green-700 font-bold"  :
    accent === "blue"  ? "text-blue-600 font-bold"   :
                         "text-gray-800 font-semibold";
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm ${valueCls}`}>{value}</span>
    </div>
  );
}

export function FieldExecution({
  todayFieldDiaries,
  submittedDiariesCount,
  draftDiariesCount,
  diariesPending,
  missingDiaryJobs,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-navy-900">ביצוע שדה</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">יומני עבודה ועבודות שטח</p>
        </div>
        <Link href="/work-diary" className="text-xs text-blue-500 hover:underline">
          יומנים
        </Link>
      </div>
      <div className="px-5 py-3">
        <StatRow
          label="יומנים היום"
          value={todayFieldDiaries}
          accent={todayFieldDiaries > 0 ? "blue" : "neutral"}
        />
        <StatRow
          label="יומנים ממתינים לאישור"
          value={diariesPending}
          accent={diariesPending > 3 ? "red" : diariesPending > 0 ? "amber" : "neutral"}
        />
        <StatRow
          label="יומנים שהוגשו"
          value={submittedDiariesCount}
          accent="neutral"
        />
        <StatRow
          label="טיוטות פתוחות"
          value={draftDiariesCount}
          accent={draftDiariesCount > 5 ? "amber" : "neutral"}
        />
        <StatRow
          label="עבודות שהוצאו ללא יומן"
          value={missingDiaryJobs}
          accent={missingDiaryJobs > 0 ? "red" : "neutral"}
        />
      </div>
    </div>
  );
}
