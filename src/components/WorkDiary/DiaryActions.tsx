"use client";

import { useState } from "react";
import { DIARY_STATUS_COLORS, DIARY_STATUS_LABELS } from "@/types/workDiary";
import type { WorkDiaryStatus, DiaryApprovalStatus } from "@/types/workDiary";

interface Props {
  status: WorkDiaryStatus;
  diaryNumber: string;
  approvalStatus?: DiaryApprovalStatus;
  approvedBy?: string;
  rejectionReason?: string;
  canApprove?: boolean;         // true for manager roles
  onSaveDraft: () => void;
  onSubmit: () => void;
  onExportPDF: () => void;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  saving?: boolean;
  exporting?: boolean;
}

export function DiaryActions({
  status,
  diaryNumber,
  approvalStatus,
  approvedBy,
  rejectionReason,
  canApprove,
  onSaveDraft,
  onSubmit,
  onExportPDF,
  onApprove,
  onReject,
  saving,
  exporting,
}: Props) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const isSubmitted = status === "submitted";
  const isPendingApproval = isSubmitted && (!approvalStatus || approvalStatus === "pending");
  const isApproved = isSubmitted && approvalStatus === "approved";
  const isRejected = isSubmitted && approvalStatus === "rejected";

  function handleRejectConfirm() {
    if (!rejectReason.trim()) return;
    onReject?.(rejectReason.trim());
    setShowRejectInput(false);
    setRejectReason("");
  }

  return (
    <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex flex-col gap-2 no-print z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      {/* Rejection reason input */}
      {showRejectInput && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2" dir="rtl">
          <span className="text-xs font-medium text-red-700 shrink-0">סיבת דחייה:</span>
          <input
            autoFocus
            type="text"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleRejectConfirm(); if (e.key === "Escape") setShowRejectInput(false); }}
            placeholder="תאר את הסיבה..."
            className="flex-1 text-xs bg-transparent outline-none text-red-800 placeholder-red-300"
          />
          <button
            type="button"
            onClick={handleRejectConfirm}
            disabled={!rejectReason.trim()}
            className="px-2 py-1 rounded text-xs font-semibold bg-red-600 text-white disabled:opacity-40"
          >
            אשר דחייה
          </button>
          <button
            type="button"
            onClick={() => setShowRejectInput(false)}
            className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100"
          >
            ביטול
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400 hidden sm:block">{diaryNumber}</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${DIARY_STATUS_COLORS[status]}`}
          >
            {DIARY_STATUS_LABELS[status]}
          </span>

          {/* Approval status badge */}
          {isApproved && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              אושר{approvedBy ? ` · ${approvedBy}` : ""}
            </span>
          )}
          {isRejected && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700" title={rejectionReason}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              נדחה{rejectionReason ? ` · ${rejectionReason}` : ""}
            </span>
          )}
          {isPendingApproval && isSubmitted && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              ממתין לאישור
            </span>
          )}
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
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            {exporting ? "מייצא..." : "PDF"}
          </button>

          {/* "שלח במייל" mailto button removed — replaced by PostSubmitBanner +
              CustomerEmailDialog server-side flow. */}

          {/* Manager: approve / reject when pending */}
          {canApprove && isPendingApproval && !showRejectInput && (
            <>
              <button
                type="button"
                onClick={onApprove}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                אשר
              </button>
              <button
                type="button"
                onClick={() => setShowRejectInput(true)}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                דחה
              </button>
            </>
          )}

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
    </div>
  );
}
