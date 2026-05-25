"use client";

import type { NotificationCounts } from "@/hooks/useNotifications";

interface Props {
  notifications: NotificationCounts;
}

interface DeptRow {
  label: string;
  count: number;
}

function LoadRow({ label, count }: DeptRow) {
  const max = 10;
  const pct = Math.min(100, Math.round((count / max) * 100));
  const badge = count === 0
    ? { text: "תקין", cls: "bg-emerald-100 text-emerald-700" }
    : count <= 2
    ? { text: "בינוני", cls: "bg-amber-100 text-amber-700" }
    : { text: "עמוס", cls: "bg-red-100 text-red-700" };
  const barColor = count === 0 ? "bg-emerald-400" : count <= 2 ? "bg-amber-400" : "bg-red-500";

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-700 w-20 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}>{badge.text}</span>
    </div>
  );
}

export function DepartmentLoadPanel({ notifications }: Props) {
  const rows: DeptRow[] = [
    { label: "גרפיקה",   count: notifications.graphics    },
    { label: "מחסן",     count: notifications.warehouse   },
    { label: "מסגריה",   count: notifications.fabrication },
    { label: "חשבונאות", count: notifications.accounting  },
    { label: "שיבוץ",    count: notifications.schedule    },
  ];

  return (
    <div className="glass-card overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">עומס מחלקות</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">פריטים ממתינים לטיפול לפי מחלקה</p>
      </div>
      <div className="px-4 py-2">
        {rows.map((row) => (
          <LoadRow key={row.label} {...row} />
        ))}
      </div>
    </div>
  );
}
