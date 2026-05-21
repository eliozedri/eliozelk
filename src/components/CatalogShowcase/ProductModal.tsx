"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CatalogItem } from "@/types/catalog";
import { TYPE_LABELS } from "@/types/catalog";
import {
  getSourceType, SOURCE_BADGE, STATUS_BADGE, REVIEW_BADGE,
  resolveDetailImage, getCategoryIcon
} from "./constants";

interface Props {
  item: CatalogItem;
  onClose: () => void;
}

export function ProductModal({ item, onClose }: Props) {
  const router = useRouter();
  const imgUrl = resolveDetailImage(item.metadata);
  const sourceType = getSourceType(item.metadata);
  const sourceBadge = SOURCE_BADGE[sourceType];
  const statusBadge = STATUS_BADGE[item.isActive ? "active" : "inactive"];
  const reviewState = item.metadata?.review_state as string | undefined;
  const reviewBadge = reviewState ? REVIEW_BADGE[reviewState] : null;
  const categoryIcon = getCategoryIcon(item.category);
  const specs = item.metadata?.specs as Record<string, string | boolean | number | undefined> | undefined;
  const sources = item.metadata?.sources as Array<{ type: string; note?: string; url?: string }> | undefined;
  const cropStatus = (item.metadata?.images as Record<string, string> | undefined)?.crop_status;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative bg-[#1a2d4a] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg overflow-hidden shadow-2xl">
        {/* Image */}
        <div className="h-48 sm:h-56 bg-white/5 flex items-center justify-center relative overflow-hidden border-b border-white/7">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = "none";
                const parent = el.parentElement;
                if (parent) {
                  const span = document.createElement("span");
                  span.className = "text-6xl opacity-40";
                  span.textContent = categoryIcon;
                  parent.appendChild(span);
                }
              }}
            />
          ) : (
            <span className="text-6xl opacity-40">{categoryIcon}</span>
          )}
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/40 text-white/70 hover:text-white flex items-center justify-center text-lg leading-none transition-colors"
            aria-label="סגור"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[60vh] sm:max-h-none">
          <h2 className="text-lg font-bold text-white">{item.name}</h2>
          <p className="text-xs text-white/40 mt-0.5 mb-3">{item.category}</p>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
            {sourceBadge && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sourceBadge.className}`}>
                {sourceBadge.label}
              </span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10">
              {TYPE_LABELS[item.type]}
            </span>
            {reviewBadge && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${reviewBadge.className}`}>
                {reviewBadge.label}
              </span>
            )}
          </div>

          {/* Description */}
          {item.description && (
            <p className="text-sm text-white/60 leading-relaxed mb-4">{item.description}</p>
          )}

          {/* Specs */}
          {specs && Object.keys(specs).length > 0 && (
            <div className="bg-white/4 rounded-lg p-3 mb-4">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">מפרט טכני</p>
              <div className="space-y-1">
                {specs.dimensions && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">מידות</span>
                    <span className="text-white/70">{String(specs.dimensions)}</span>
                  </div>
                )}
                {specs.material && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">חומר</span>
                    <span className="text-white/70">{String(specs.material)}</span>
                  </div>
                )}
                {specs.is_solar && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">הזנה</span>
                    <span className="text-amber-400">☀ סולארי</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Source info */}
          <div className="bg-white/4 rounded-lg p-3 mb-5">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">מקור</p>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">יחידה</span>
              <span className="text-white/70">{item.unitOfMeasure}</span>
            </div>
            {sources?.[0]?.note && (
              <div className="flex justify-between text-xs mt-1">
                <span className="text-white/40">מקור</span>
                <span className="text-white/70">{sources[0].note}</span>
              </div>
            )}
            {cropStatus === "needs_review" && (
              <p className="text-[10px] text-orange-400 mt-2 italic">תמונה דורשת בדיקת חיתוך</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/7 text-white/60 border border-white/10 text-sm hover:bg-white/12 transition-colors"
            >
              סגור
            </button>
            <button
              type="button"
              onClick={() => { onClose(); router.push("/catalog"); }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              ✏ ערוך מוצר
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
