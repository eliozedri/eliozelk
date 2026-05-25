"use client";

import { useState } from "react";

interface ConfirmDialogProps {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant: "warning" | "destructive" | "info";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  loading?: boolean;
}

function VariantIcon({ variant }: { variant: ConfirmDialogProps["variant"] }) {
  if (variant === "destructive") {
    return (
      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
        <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
    );
  }
  if (variant === "warning") {
    return (
      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
        <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
      <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "ביטול",
  variant,
  onConfirm,
  onClose,
  loading,
}: ConfirmDialogProps) {
  const [saving, setSaving] = useState(false);
  const isLoading = loading || saving;

  const confirmBtnCls =
    variant === "destructive"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : variant === "warning"
      ? "bg-amber-600 hover:bg-amber-700 text-white"
      : "bg-blue-600 hover:bg-blue-700 text-white";

  async function handleConfirm() {
    setSaving(true);
    try {
      await onConfirm();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-[#050f1d]/70 z-50 backdrop-blur-md" onClick={isLoading ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-[0_40px_120px_rgba(2,8,20,0.6)] ring-1 ring-black/5 border border-white/80 w-full max-w-sm p-6" dir="rtl">
          <div className="flex items-center gap-3 mb-4">
            <VariantIcon variant={variant} />
            <p className="font-bold text-gray-900 text-base">{title}</p>
          </div>
          <div className="text-sm text-gray-600 mb-5">{body}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isLoading}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 ${confirmBtnCls}`}
            >
              {isLoading ? "..." : confirmLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
