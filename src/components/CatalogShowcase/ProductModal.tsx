"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogItem } from "@/types/catalog";
import { TYPE_LABELS } from "@/types/catalog";
import { useCatalogContext } from "@/context/CatalogContext";
import {
  getSourceType, SOURCE_BADGE, STATUS_BADGE, REVIEW_BADGE,
  resolveDetailImage, getCategoryIcon,
  isBrandedSupplierImage, BRANDED_OVERLAY_LABEL,
} from "./constants";

interface Props {
  item: CatalogItem;
  onClose: () => void;
}

export function ProductModal({ item, onClose }: Props) {
  const router = useRouter();
  const { toggleActive } = useCatalogContext();
  const [confirming, setConfirming] = useState(false);
  const imgUrl = resolveDetailImage(item.metadata);
  const sourceType = getSourceType(item.metadata);
  const sourceBadge = SOURCE_BADGE[sourceType];
  const statusBadge = STATUS_BADGE[item.isActive ? "active" : "inactive"];
  const reviewState = item.metadata?.review_state as string | undefined;
  const reviewBadge = reviewState ? REVIEW_BADGE[reviewState] : null;
  const categoryIcon = getCategoryIcon(item.category);
  const isExternalSupplier = sourceType === "external";
  const specs = item.metadata?.specs as Record<string, string | boolean | number | undefined> | undefined;
  const specVariants = item.metadata?.spec_variants as Array<Record<string, string>> | undefined;
  const features = item.metadata?.features as string[] | undefined;
  const sources = item.metadata?.sources as Array<{ type: string; note?: string; url?: string }> | undefined;
  const cropStatus = (item.metadata?.images as Record<string, string> | undefined)?.crop_status;
  const sourcePage = (item.metadata?.images as Record<string, string> | undefined)?.source_page;
  const imageStatus = (item.metadata?.images as Record<string, string> | undefined)?.image_status;
  const branded = isBrandedSupplierImage(item.metadata);

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
            <>
              <img
                src={imgUrl}
                alt={item.name}
                className={`w-full h-full object-cover ${branded ? "opacity-60" : ""}`}
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
              {branded && (
                <div className="absolute bottom-2 right-2 left-2 sm:left-auto bg-amber-500/90 text-white text-xs sm:text-sm font-semibold px-3 py-1.5 rounded shadow-lg flex items-center gap-1.5">
                  <span>⚠</span>
                  <span>{BRANDED_OVERLAY_LABEL}</span>
                </div>
              )}
            </>
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

          {/* Spec variants — multiple SKUs / sizes per product page */}
          {specVariants && specVariants.length > 0 && (
            <div className="bg-white/4 rounded-lg p-3 mb-4">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">
                גרסאות {specVariants.length > 1 ? `(${specVariants.length})` : ""}
              </p>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {specVariants.map((variant, idx) => (
                  <div key={idx} className="bg-white/3 rounded p-2 border border-white/5">
                    <div className="space-y-0.5">
                      {Object.entries(variant).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-[11px] gap-2">
                          <span className="text-white/40 shrink-0">{k}</span>
                          <span className="text-white/70 text-right">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Features */}
          {features && features.length > 0 && (
            <div className="bg-white/4 rounded-lg p-3 mb-4">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">תכונות</p>
              <ul className="space-y-1 text-xs text-white/65">
                {features.slice(0, 8).map((f, i) => (
                  <li key={i} className="flex gap-1.5"><span className="text-blue-400">•</span><span>{f}</span></li>
                ))}
              </ul>
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
            {sourcePage && (
              <div className="flex justify-between text-xs mt-1">
                <span className="text-white/40">דף ספק</span>
                <a href={sourcePage} target="_blank" rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline truncate max-w-[60%]" dir="ltr">
                  פתח באתר ↗
                </a>
              </div>
            )}
            {cropStatus === "needs_review" && (
              <p className="text-[10px] text-orange-400 mt-2 italic">תמונה דורשת בדיקת חיתוך</p>
            )}
            {imageStatus && imageStatus !== 'clean_product_crop' && (
              <p className="text-[10px] text-amber-400 mt-1 italic">סטטוס נכס: {imageStatus}</p>
            )}
          </div>

          {/* Supplier-import warning for inactive supplier rows */}
          {isExternalSupplier && !item.isActive && (
            <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              <p className="font-semibold mb-0.5">מוצר זה יובא ממקור ספק חיצוני</p>
              <p className="text-amber-300/80">המוצר אינו פעיל עד לאישור ידני. הפעלה תהפוך אותו לזמין בקטלוג הפעיל.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/7 text-white/60 border border-white/10 text-sm hover:bg-white/12 transition-colors"
            >
              סגור
            </button>
            {!item.isActive ? (
              confirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-300">להפעיל?</span>
                  <button
                    type="button"
                    onClick={() => { toggleActive(item.id); setConfirming(false); onClose(); }}
                    className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                  >כן, הפעל</button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="px-3 py-2 rounded-lg bg-white/10 text-white/70 text-xs"
                  >ביטול</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
                >
                  ✓ הפעל מוצר
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => { toggleActive(item.id); onClose(); }}
                className="px-4 py-2 rounded-lg bg-white/10 text-white/80 text-sm border border-white/15 hover:bg-white/15 transition-colors"
              >
                השבת
              </button>
            )}
            <button
              type="button"
              onClick={() => { onClose(); router.push(`/catalog?edit=${item.id}`); }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              ✏ ערוך פרטים
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
