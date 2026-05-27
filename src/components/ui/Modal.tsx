"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  "2xl": "max-w-5xl",
};

interface ModalProps {
  open?: boolean;
  onClose: () => void;
  /** Plain-text title rendered in the sticky header. Omit for a header-less modal. */
  title?: string;
  /** Optional secondary line under the title. */
  subtitle?: string;
  /** Custom header content (overrides title/subtitle). */
  header?: React.ReactNode;
  /** Sticky footer — typically the action buttons. Always reachable. */
  footer?: React.ReactNode;
  size?: ModalSize;
  /** Click on the dark backdrop closes. Default false (forms shouldn't lose data). */
  closeOnBackdrop?: boolean;
  /** Esc closes. Default true. */
  closeOnEsc?: boolean;
  dir?: "rtl" | "ltr";
  children: React.ReactNode;
  /** Extra classes for the scrollable body. */
  bodyClassName?: string;
  /** Extra classes for the panel. */
  className?: string;
}

// Scroll-safe modal primitive. Solves the recurring iPad/Safari issues:
//  - portal to <body> escapes ancestor overflow/transform scroll traps
//  - max-h uses dvh (dynamic viewport) so Safari's collapsing toolbar can't clip
//  - the BODY scrolls internally (overscroll-contain + -webkit touch momentum);
//    the page behind is locked via useBodyScrollLock so the two don't fight
//  - header + footer are flex-shrink-0 so action buttons stay reachable while
//    long content scrolls between them
export function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  header,
  footer,
  size = "md",
  closeOnBackdrop = false,
  closeOnEsc = true,
  dir = "rtl",
  children,
  bodyClassName = "",
  className = "",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEsc, onClose]);

  if (!open || !mounted) return null;

  const showHeader = header !== undefined || title !== undefined;

  return createPortal(
    <div
      dir={dir}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`relative flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl max-h-[92dvh] ${SIZE_CLASS[size]} ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {showHeader && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-4">
            {header ?? (
              <div>
                <h2 className="font-black text-lg" style={{ color: "#0d1b2e" }}>{title}</h2>
                {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none"
              aria-label="סגור"
            >
              ✕
            </button>
          </div>
        )}

        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] ${bodyClassName || "px-6 py-4"}`}
        >
          {children}
        </div>

        {footer !== undefined && (
          <div className="shrink-0 border-t px-6 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
