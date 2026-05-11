"use client";

import type { Customer } from "@/types/customer";

function CloseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg className="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg className="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  ltr?: boolean;
}

function DetailRow({ label, value, ltr }: DetailRowProps) {
  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-gray-50 last:border-b-0">
      <span className="text-sm text-gray-500 shrink-0 w-28">{label}</span>
      <span className="text-sm text-gray-900 break-all" dir={ltr ? "ltr" : undefined}>
        {value || "—"}
      </span>
    </div>
  );
}

interface Props {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CustomerDrawer({ customer, isOpen, onClose }: Props) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && customer && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel — slides from the left (RTL end side) */}
      <div
        className={`fixed top-0 left-0 h-full w-full sm:w-96 bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen && customer ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        {customer && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-blue-50 border-b border-blue-100 shrink-0">
              <h2 className="text-lg font-bold text-blue-900 truncate">{customer.name}</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-blue-100 transition-colors shrink-0 mr-2"
                aria-label="סגור"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">

              {/* Customer details */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">פרטי לקוח</h3>
                <div className="bg-gray-50 rounded-lg px-3">
                  <DetailRow label="שם לקוח" value={customer.name} />
                  <DetailRow label="מיקום" value={customer.location} />
                  <DetailRow label="טלפון" value={customer.phone} ltr />
                  <DetailRow label="הזמנה אחרונה" value={customer.lastOrder} />
                  <DetailRow
                    label="תאריך הוספה"
                    value={new Date(customer.createdAt).toLocaleDateString("he-IL")}
                  />
                </div>
              </div>

              {/* Quotes section */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold text-blue-900">הצעות מחיר אחרונות</h3>
                  <DocumentIcon />
                </div>
                <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                  לא נמצאו הצעות מחיר ללקוח זה
                </div>
              </div>

              {/* Invoices section */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold text-blue-900">חשבוניות אחרונות</h3>
                  <ReceiptIcon />
                </div>
                <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                  לא נמצאו חשבוניות ללקוח זה
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </>
  );
}
