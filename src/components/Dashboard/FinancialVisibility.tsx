"use client";

import Link from "next/link";

interface Props {
  uninvoicedCompleted: number;
  oldestUninvoicedDays: number;
  verifiedOrders: number;
  invoicedOrders: number;
  accountingPending: number;
  diariesPending: number;
}

function Row({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string | number;
  accent?: "neutral" | "amber" | "red" | "green";
}) {
  const valueCls =
    accent === "amber" ? "text-amber-600 font-bold" :
    accent === "red"   ? "text-red-600 font-bold"   :
    accent === "green" ? "text-green-700 font-bold"  :
                         "text-gray-800 font-semibold";
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm ${valueCls}`}>{value}</span>
    </div>
  );
}

export function FinancialVisibility({
  uninvoicedCompleted,
  oldestUninvoicedDays,
  verifiedOrders,
  invoicedOrders,
  accountingPending,
  diariesPending,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-navy-900">חשיפת חיוב</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">הזמנות הושלמו — ממתינות לחיוב</p>
        </div>
        <Link href="/accounting" className="text-xs text-blue-500 hover:underline">
          הנה״ח
        </Link>
      </div>
      <div className="px-5 py-3">
        <Row
          label="הזמנות הושלמו ללא חשבונית"
          value={uninvoicedCompleted}
          accent={uninvoicedCompleted > 5 ? "red" : uninvoicedCompleted > 0 ? "amber" : "green"}
        />
        {uninvoicedCompleted > 0 && (
          <Row
            label="גיל הוותיקה ביותר"
            value={`${oldestUninvoicedDays} ימים`}
            accent={oldestUninvoicedDays > 14 ? "red" : oldestUninvoicedDays > 7 ? "amber" : "neutral"}
          />
        )}
        <Row
          label="מאומתות ומוכנות לחשבונית"
          value={verifiedOrders}
          accent={verifiedOrders > 0 ? "amber" : "neutral"}
        />
        <Row
          label="הזמנות בתהליך חשבוניות"
          value={invoicedOrders}
          accent="neutral"
        />
        <Row
          label="יומני שדה לאישור"
          value={diariesPending}
          accent={diariesPending > 0 ? "amber" : "neutral"}
        />
        <Row
          label="מחכות לאימות חשבונאי"
          value={accountingPending}
          accent={accountingPending > 3 ? "amber" : "neutral"}
        />
      </div>
    </div>
  );
}
