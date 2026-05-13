"use client";

import { useEffect, useRef, useState } from "react";
import type { OrderHeader as OrderHeaderType } from "@/types/order";
import { CITY_COORDINATES } from "@/lib/cityCoordinates";
import { useCustomersContext } from "@/context/CustomersContext";

interface Props {
  header: OrderHeaderType;
  onChange: (partial: Partial<OrderHeaderType>) => void;
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 transition-all";

export function OrderHeader({ header, onChange }: Props) {
  const { customers, syncStatus } = useCustomersContext();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = header.customer.trim().length >= 1
    ? customers
        .filter((c) => c.name.toLowerCase().includes(header.customer.toLowerCase()))
        .slice(0, 6)
    : [];

  function selectCustomer(name: string) {
    onChange({ customer: name });
    setShowSuggestions(false);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 mb-4">
      {/* Row 1: date + company + contact + orderer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">

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

        {/* שם החברה */}
        <div className="flex flex-col gap-1" ref={wrapperRef}>
          <label className="text-sm font-medium text-gray-600">
            שם החברה <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={header.customer}
              onChange={(e) => {
                onChange({ customer: e.target.value });
                setShowSuggestions(true);
              }}
              onFocus={() => { if (header.customer.trim().length >= 1) setShowSuggestions(true); }}
              placeholder="שם לקוח / חברה"
              className={inputCls}
              autoComplete="off"
            />
            {showSuggestions && header.customer.trim().length >= 1 && (
              <div className="absolute top-full right-0 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg z-50 overflow-hidden">
                {syncStatus === "loading" ? (
                  <div className="px-3 py-2.5 text-sm text-gray-400">טוען לקוחות...</div>
                ) : suggestions.length > 0 ? (
                  suggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => selectCustomer(c.name)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-right hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex-1 text-right">
                        <div className="font-medium text-gray-800">{c.name}</div>
                        {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                      </div>
                      {c.location && (
                        <span className="text-xs text-gray-400 shrink-0">{c.location}</span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2.5 text-sm text-gray-400">לא נמצאו לקוחות תואמים</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* איש קשר */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">איש קשר</label>
          <input
            type="text"
            value={header.contactPerson}
            onChange={(e) => onChange({ contactPerson: e.target.value })}
            placeholder="שם איש קשר"
            className={inputCls}
          />
        </div>

        {/* מזמין */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">מזמין</label>
          <input
            type="text"
            value={header.orderedBy}
            onChange={(e) => onChange({ orderedBy: e.target.value })}
            placeholder="שם המזמין"
            className={inputCls}
          />
        </div>
      </div>

      {/* Row 2: city only */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-sm font-medium text-gray-600">
            עיר <span className="text-red-500">*</span>
          </label>
          <select
            value={header.city}
            onChange={(e) => onChange({ city: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white transition-all"
          >
            <option value="">— בחר עיר —</option>
            {Object.keys(CITY_COORDINATES).sort().map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
