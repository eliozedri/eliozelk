"use client";

import type { OrderHeader as OrderHeaderType } from "@/types/order";
import { CITY_COORDINATES } from "@/lib/cityCoordinates";

interface Props {
  header: OrderHeaderType;
  onChange: (partial: Partial<OrderHeaderType>) => void;
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 transition-all";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-600">
        {label}{required && <span className="text-red-500 mr-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export function OrderHeader({ header, onChange }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 mb-4">

      {/* Row 1: date (auto) + company + contact + ordered-by */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">

        {/* תאריך — auto-filled, still editable */}
        <Field label="תאריך" required>
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
        </Field>

        {/* שם החברה */}
        <Field label="שם החברה" required>
          <input
            type="text"
            value={header.customer}
            onChange={(e) => onChange({ customer: e.target.value })}
            placeholder="שם הלקוח / החברה"
            className={inputCls}
          />
        </Field>

        {/* איש קשר */}
        <Field label="איש קשר">
          <input
            type="text"
            value={header.contactPerson}
            onChange={(e) => onChange({ contactPerson: e.target.value })}
            placeholder="שם איש הקשר"
            className={inputCls}
          />
        </Field>

        {/* מזמין */}
        <Field label="מזמין">
          <input
            type="text"
            value={header.orderedBy}
            onChange={(e) => onChange({ orderedBy: e.target.value })}
            placeholder="שם המזמין"
            className={inputCls}
          />
        </Field>

      </div>

      {/* Row 2: site location + job slash + city */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

        {/* מיקום האתר */}
        <Field label="מיקום האתר" required>
          <input
            type="text"
            value={header.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="כתובת / תיאור מיקום"
            className={inputCls}
          />
        </Field>

        {/* סלאש העבודה */}
        <Field label="סלאש העבודה">
          <input
            type="text"
            value={header.jobSlash}
            onChange={(e) => onChange({ jobSlash: e.target.value })}
            placeholder="לדוגמה: 2024/001"
            className={inputCls}
            dir="ltr"
          />
        </Field>

        {/* עיר */}
        <Field label="עיר">
          <select
            value={header.city ?? ""}
            onChange={(e) => onChange({ city: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          >
            <option value="">— בחר עיר —</option>
            {Object.keys(CITY_COORDINATES).sort().map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </Field>

      </div>
    </div>
  );
}
