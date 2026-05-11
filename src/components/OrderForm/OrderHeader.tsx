"use client";

import type { OrderHeader as OrderHeaderType } from "@/types/order";
import { CITY_COORDINATES } from "@/lib/cityCoordinates";

interface Props {
  header: OrderHeaderType;
  onChange: (partial: Partial<OrderHeaderType>) => void;
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 transition-all";

export function OrderHeader({ header, onChange }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 mb-4">
      {/*
        Grid in RTL: columns fill right-to-left.
        HTML order [date, customer, location, reference] → visual order right-to-left:
        [תאריך][לקוח][מיקום][אסמכתא]
      */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">

        {/* תאריך */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">
            תאריך <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="date"
              value={header.date}
              onChange={(e) => onChange({ date: e.target.value })}
              className={`${inputCls} pr-9`}
              dir="ltr"
            />
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
        </div>

        {/* לקוח / מזמין */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">
            לקוח / מזמין <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={header.customer}
            onChange={(e) => onChange({ customer: e.target.value })}
            placeholder="בחר לקוח"
            className={inputCls}
          />
        </div>

        {/* מיקום */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">
            מיקום <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={header.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="הזן מיקום"
            className={inputCls}
          />
        </div>

        {/* עיר */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">עיר</label>
          <select
            value={header.city ?? ""}
            onChange={(e) => onChange({ city: e.target.value })}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          >
            <option value="">— בחר עיר —</option>
            {Object.keys(CITY_COORDINATES).sort().map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>

        {/* אסמכתא */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">
            אסמכתא (אופציונלי)
          </label>
          <input
            type="text"
            value={header.reference}
            onChange={(e) => onChange({ reference: e.target.value })}
            placeholder="הזן אסמכתא"
            className={inputCls}
          />
        </div>

      </div>
    </div>
  );
}
