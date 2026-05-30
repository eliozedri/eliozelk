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

const CITIES = Object.keys(CITY_COORDINATES)
  .filter((c) => !c.includes("-"))
  .sort((a, b) => a.localeCompare(b, "he"));

export function OrderHeader({ header, onChange }: Props) {
  const { customers, syncStatus, addCustomer } = useCustomersContext();
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [citySearch, setCitySearch] = useState(header.city);
  const customerWrapperRef = useRef<HTMLDivElement>(null);
  const cityWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerWrapperRef.current && !customerWrapperRef.current.contains(e.target as Node)) {
        setShowCustomerSuggestions(false);
      }
      if (cityWrapperRef.current && !cityWrapperRef.current.contains(e.target as Node)) {
        setShowCitySuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync citySearch when header.city changes externally (e.g., reset)
  useEffect(() => { setCitySearch(header.city); }, [header.city]);

  const customerSuggestions = header.customer.trim().length >= 1
    ? customers
        .filter((c) => c.name.toLowerCase().includes(header.customer.toLowerCase()))
        .slice(0, 6)
    : [];

  const citySuggestions = citySearch.trim().length >= 1
    ? CITIES.filter((c) => c.includes(citySearch.trim())).slice(0, 10)
    : CITIES.slice(0, 10);

  function selectCustomer(name: string) {
    onChange({ customer: name });
    setShowCustomerSuggestions(false);
  }

  // Exact (normalized) match guard — never create a duplicate; select the existing one.
  const exactCustomer = customers.find(
    (c) => c.name.trim().toLowerCase() === header.customer.trim().toLowerCase(),
  );

  // Create a customer inline without losing the order draft (only the customer name
  // field is touched; all other order fields/rows are preserved). After creation the
  // new customer is selected. NOTE: the order still stores the customer NAME — a real
  // customer_id FK requires the proposed migration (docs/PROPOSAL_orders_customer_fk.md).
  async function handleCreateCustomer() {
    const name = header.customer.trim();
    if (!name || creatingCustomer) return;
    if (exactCustomer) { selectCustomer(exactCustomer.name); return; }
    setCreatingCustomer(true);
    try {
      const c = await addCustomer({ name, location: header.city?.trim() ?? "", phone: "", lastOrder: "" });
      selectCustomer(c.name);
    } catch {
      // non-fatal — keep the typed name so the draft is not lost
    } finally {
      setCreatingCustomer(false);
    }
  }

  function selectCity(city: string) {
    setCitySearch(city);
    onChange({ city });
    setShowCitySuggestions(false);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 mb-4">
      {/* Row 1: date + company + contact + city */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

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
        <div className="flex flex-col gap-1" ref={customerWrapperRef}>
          <label className="text-sm font-medium text-gray-600">
            שם החברה <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={header.customer}
              onChange={(e) => {
                onChange({ customer: e.target.value });
                setShowCustomerSuggestions(true);
              }}
              onFocus={() => { if (header.customer.trim().length >= 1) setShowCustomerSuggestions(true); }}
              placeholder="שם לקוח / חברה"
              className={inputCls}
              autoComplete="off"
            />
            {showCustomerSuggestions && header.customer.trim().length >= 1 && (
              <div className="absolute top-full right-0 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg z-50 overflow-hidden">
                {syncStatus === "loading" ? (
                  <div className="px-3 py-2.5 text-sm text-gray-400">טוען לקוחות...</div>
                ) : (
                  <>
                    {customerSuggestions.map((c) => (
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
                    ))}
                    {customerSuggestions.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400">לא נמצא לקוח תואם</div>
                    )}
                    {/* Create-new-customer — only when no exact match exists (no duplicates) */}
                    {!exactCustomer && header.customer.trim().length >= 2 && (
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); void handleCreateCustomer(); }}
                        disabled={creatingCustomer}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-right border-t border-gray-100 bg-blue-50/50 hover:bg-blue-100 text-blue-700 font-semibold disabled:opacity-60"
                      >
                        <span className="text-base leading-none">＋</span>
                        <span className="flex-1 text-right truncate">
                          {creatingCustomer ? "מקים לקוח…" : `הקם לקוח חדש: "${header.customer.trim()}"`}
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* מזמין / איש קשר — merged field */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600">מזמין / איש קשר</label>
          <input
            type="text"
            value={header.contactPerson}
            onChange={(e) => onChange({ contactPerson: e.target.value })}
            placeholder="שם המזמין / איש הקשר"
            className={inputCls}
          />
        </div>

        {/* עיר — searchable */}
        <div className="flex flex-col gap-1" ref={cityWrapperRef}>
          <label className="text-sm font-medium text-gray-600">
            עיר <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={citySearch}
              onChange={(e) => {
                setCitySearch(e.target.value);
                onChange({ city: e.target.value });
                setShowCitySuggestions(true);
              }}
              onFocus={() => setShowCitySuggestions(true)}
              placeholder="חיפוש עיר..."
              className={inputCls}
              autoComplete="off"
            />
            {showCitySuggestions && (
              <div className="absolute top-full right-0 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg z-50 overflow-hidden max-h-48 overflow-y-auto">
                {citySuggestions.length > 0 ? (
                  citySuggestions.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onMouseDown={() => selectCity(city)}
                      className="w-full px-3 py-2 text-sm text-right hover:bg-blue-50 transition-colors text-gray-800"
                    >
                      {city}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2.5 text-sm text-gray-400">לא נמצאו ערים תואמות</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
