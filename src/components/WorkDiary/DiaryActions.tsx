"use client";

import { DIARY_STATUS_COLORS, DIARY_STATUS_LABELS } from "@/types/workDiary";
import type { WorkDiaryStatus } from "@/types/workDiary";

interface Props {
  status: WorkDiaryStatus;
  diaryNumber: string;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onExportPDF: () => void;
  onEmail: () => void;
  saving?: boolean;
  exporting?: boolean;
}

export function DiaryActions({
  status,
  diaryNumber,
  onSaveDraft,
  onSubmit,
  onExportPDF,
  onEmail,
  saving,
  exporting,
}: Props) {
  const isSubmitted = status === "submitted";

  return (
    <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-2 no-print z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-gray-400 hidden sm:block">{diaryNumber}</span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${DIARY_STATUS_COLORS[status]}`}
        >
          {DIARY_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end">
        {!isSubmitted && (
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {saving ? "שומר..." : "שמור טיוטה"}
          </button>
        )}

        <button
          type="button"
          onClick={onExportPDF}
          disabled={exporting}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          {exporting ? "מייצא..." : "PDF"}
        </button>

        <button
          type="button"
          onClick={onEmail}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          שלח במייל
        </button>

        {!isSubmitted && (
          <button
            type="button"
            onClick={onSubmit}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            שלח יומן
          </button>
        )}
      </div>
    </div>
  );
}
