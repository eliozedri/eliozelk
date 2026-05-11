"use client";

import { useState } from "react";
import type { CustomerErrors, CustomerFormState } from "@/types/customer";

const inputCls =
  "w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 transition-all";

const inputErrCls =
  "w-full px-3 py-1.5 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent placeholder-gray-400 transition-all ring-2 ring-red-400 border-transparent";

const emptyForm: CustomerFormState = {
  name: "",
  location: "",
  phone: "",
  lastOrder: "",
};

function validatePhone(phone: string): boolean {
  const c = phone.replace(/[\s-]/g, "");
  return /^0[2-9]\d{7}$/.test(c) || /^05\d{8}$/.test(c);
}

function validateForm(form: CustomerFormState): CustomerErrors {
  const errors: CustomerErrors = {};
  if (!form.name.trim()) errors.name = "שם לקוח הוא שדה חובה";
  if (!form.phone.trim()) {
    errors.phone = "מספר טלפון הוא שדה חובה";
  } else if (!validatePhone(form.phone)) {
    errors.phone = "מספר טלפון לא תקין (לדוגמה: 052-1234567)";
  }
  return errors;
}

interface Props {
  onAdd: (form: CustomerFormState) => void;
}

export function AddCustomerForm({ onAdd }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [errors, setErrors] = useState<CustomerErrors>({});

  function handleSave() {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onAdd(form);
    setForm(emptyForm);
    setErrors({});
    setIsOpen(false);
  }

  function handleCancel() {
    setForm(emptyForm);
    setErrors({});
    setIsOpen(false);
  }

  function update(field: keyof CustomerFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  if (!isOpen) {
    return (
      <div className="flex justify-end px-5 py-3 border-b border-gray-100 no-print">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-blue-400 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors"
        >
          + הוסף לקוח
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 px-5 py-4 bg-blue-50/20 no-print">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            שם לקוח <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="שם הלקוח"
            className={errors.name ? inputErrCls : inputCls}
          />
          {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">מיקום</label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
            placeholder="מיקום (אופציונלי)"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            מספר טלפון <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="לדוגמה: 052-1234567"
            dir="ltr"
            className={errors.phone ? inputErrCls : inputCls}
          />
          {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">הזמנה אחרונה</label>
          <input
            type="text"
            value={form.lastOrder}
            onChange={(e) => update("lastOrder", e.target.value)}
            placeholder="הזמנה אחרונה (אופציונלי)"
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          שמור לקוח
        </button>
      </div>
    </div>
  );
}
