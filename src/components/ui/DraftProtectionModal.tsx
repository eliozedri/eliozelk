"use client";

import { useState } from "react";

interface Props {
  onStay: () => void;
  onSaveDraft: () => Promise<void>;
  onDiscard: () => void;
  // Optional custom copy — used by features that need different language (e.g. plan scanner)
  title?: string;
  subtitle?: string;
  saveDraftLabel?: string;
  discardLabel?: string;
  hideSaveDraft?: boolean;
}

export function DraftProtectionModal({
  onStay,
  onSaveDraft,
  onDiscard,
  title = "יש שינויים שלא נשמרו",
  subtitle = "האם לשמור כטיוטה או למחוק?",
  saveDraftLabel = "שמור כטיוטה",
  discardLabel = "מחק ויצא",
  hideSaveDraft = false,
}: Props) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSaveDraft();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#050f1d]/70 z-[200] backdrop-blur-md"
        onClick={saving ? undefined : onStay}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-[0_40px_120px_rgba(2,8,20,0.6)] ring-1 ring-black/5 border border-white/80 max-w-sm w-full p-6 space-y-4">

          {/* Icon + Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <p className="font-bold text-gray-900">{title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {!hideSaveDraft && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors"
              >
                {saving ? "...שומר" : saveDraftLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 border border-red-200 transition-colors"
            >
              {discardLabel}
            </button>
            <button
              type="button"
              onClick={onStay}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              הישאר בעמוד
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
