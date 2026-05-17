"use client";

import Link from "next/link";
import type { NotificationCounts } from "@/hooks/useNotifications";

interface Props {
  notifications: NotificationCounts;
}

interface DeptDef {
  label: string;
  count: number;
  href: string;
  accent?: "red" | "amber" | "blue" | "neutral";
}

export function DepartmentLoad({ notifications }: Props) {
  const depts: DeptDef[] = [
    {
      label: "גרפיקה",
      count: notifications.graphicsPending + notifications.graphicsActive,
      href: "/graphics",
      accent: notifications.graphicsPending > 0 ? "amber" : "neutral",
    },
    {
      label: "מסגרייה",
      count: notifications.fabricationActive + notifications.fabricationIssues,
      href: "/fabrication",
      accent: notifications.fabricationIssues > 0 ? "red" : "neutral",
    },
    {
      label: "מחסן",
      count: notifications.warehousePending,
      href: "/orders",
      accent: notifications.warehousePending > 2 ? "amber" : "neutral",
    },
    {
      label: "תיאום",
      count: notifications.schedulePending,
      href: "/schedule",
      accent: notifications.schedulePending > 0 ? "amber" : "neutral",
    },
    {
      label: "הנה״ח",
      count: notifications.accountingPending + notifications.diariesPending,
      href: "/accounting",
      accent:
        notifications.accountingPending + notifications.diariesPending > 5 ? "red" :
        notifications.accountingPending + notifications.diariesPending > 0 ? "amber" :
        "neutral",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-bold text-navy-900">עומס מחלקות</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">פריטים הממתינים לטיפול</p>
      </div>
      <div className="p-4 grid grid-cols-5 gap-2">
        {depts.map(dept => {
          const containerCls =
            dept.accent === "red"   ? "bg-red-50 border-red-200 hover:bg-red-100" :
            dept.accent === "amber" ? "bg-amber-50 border-amber-200 hover:bg-amber-100" :
                                      "bg-gray-50 border-gray-100 hover:bg-gray-100";
          const countCls =
            dept.accent === "red"   ? "text-red-600" :
            dept.accent === "amber" ? "text-amber-600" :
                                      "text-gray-500";

          return (
            <Link
              key={dept.label}
              href={dept.href}
              className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border transition-colors ${containerCls}`}
            >
              <span className={`text-xl font-black leading-none ${countCls}`}>{dept.count}</span>
              <span className="text-[10px] font-medium text-gray-600 text-center leading-tight">{dept.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
