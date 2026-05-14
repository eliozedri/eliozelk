"use client";

import { useState } from "react";
import { exportOrderPDF } from "@/lib/pdfExport";
import type { OrderSnapshot } from "@/types/order";
import type { OrderPriority } from "@/types/workOrder";

interface Props {
  order: OrderSnapshot;
  onReset: () => void;
  onSubmit?: (priority: OrderPriority) => void;
}

function PrintIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function BrushIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.25 1 3 .98 1.66 0 3-1.34 3-3.01 0-1.67-1.34-3.01-3-3.01z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function FormActions({ order, onReset, onSubmit }: Props) {
  const [exporting, setExporting] = useState(false);
  const [urgent, setUrgent] = useState(false);

  const handleExportPDF = async () => {
    setExporting(true);
    try { await exportOrderPDF(order); }
    finally { setExporting(false); }
  };

  const handleSubmit = () => {
    if (onSubmit) onSubmit(urgent ? "urgent" : "normal");
  };

  const outlineCls =
    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all";

  return (
    <div className="flex flex-col gap-3 no-print mb-6">
      {/* Primary submit action */}
      {onSubmit && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 transition-all shadow-sm"
          >
            <SendIcon />
            <span>שלח הזמנה</span>
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={urgent}
              onChange={(e) => setUrgent(e.target.checked)}
              className="w-4 h-4 rounded accent-red-500 cursor-pointer"
            />
            <span className={urgent ? "text-red-600 font-semibold" : ""}>הזמנה דחופה</span>
          </label>
        </div>
      )}

      {/* Secondary actions */}
      <div className="grid grid-cols-4 gap-3">
        <button type="button" onClick={onReset} className={outlineCls}>
          <XIcon />
          <span>ביטול</span>
        </button>

        <button type="button" onClick={onReset} className={outlineCls}>
          <BrushIcon />
          <span>ניקוי הטופס</span>
        </button>

        <button type="button" onClick={() => window.print()} className={outlineCls}>
          <PrintIcon />
          <span>הדפסה</span>
        </button>

        <button
          type="button"
          onClick={handleExportPDF}
          disabled={exporting}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
        >
          <PdfIcon />
          <span>{exporting ? "מייצא..." : "ייצוא PDF"}</span>
        </button>
      </div>
    </div>
  );
}
