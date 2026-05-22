"use client";

import type { CatalogItem } from "@/types/catalog";
import {
  getSourceType, SOURCE_BADGE, STATUS_BADGE, REVIEW_BADGE,
  resolveProductImage,
  isBrandedSupplierImage, BRANDED_OVERLAY_LABEL,
  isUnresolvedImage, UNRESOLVED_IMAGE_LABEL,
} from "./constants";

interface Props {
  item: CatalogItem;
  onClick: (item: CatalogItem) => void;
}

export function ProductCard({ item, onClick }: Props) {
  const imgUrl = resolveProductImage(item.metadata);
  const sourceType = getSourceType(item.metadata);
  const sourceBadge = SOURCE_BADGE[sourceType];
  const statusBadge = STATUS_BADGE[item.isActive ? "active" : "inactive"];
  const reviewState = item.metadata?.review_state as string | undefined;
  const reviewBadge = reviewState ? REVIEW_BADGE[reviewState] : null;
  const unresolved = isUnresolvedImage(item.metadata);
  const specs = item.metadata?.specs as Record<string, unknown> | undefined;
  const dimensions = specs?.dimensions as string | undefined;
  const branded = isBrandedSupplierImage(item.metadata);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(item)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(item); } }}
      className={`rounded-xl border overflow-hidden flex flex-col cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-400
        ${item.isActive
          ? "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
          : "bg-white/2 border-white/5 opacity-55"
        }`}
    >
      {/* Image — real photo, branded-overlay, or "needs image" placeholder */}
      <div className="h-28 bg-white/5 flex items-center justify-center border-b border-white/5 relative overflow-hidden">
        {imgUrl && !unresolved ? (
          <>
            <img
              src={imgUrl}
              alt={item.name}
              loading="lazy"
              className={`w-full h-full object-cover ${branded ? "opacity-55" : ""}`}
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = "none";
                const parent = el.parentElement;
                if (parent) {
                  const div = document.createElement("div");
                  div.className = "flex flex-col items-center justify-center text-center gap-1 w-full h-full text-white/35";
                  div.innerHTML = `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                    <span class="text-[9px] font-medium px-1">${UNRESOLVED_IMAGE_LABEL}</span>
                  `;
                  parent.appendChild(div);
                }
              }}
            />
            {branded && (
              <span
                className="absolute bottom-1 left-1 text-[8px] font-semibold px-1.5 py-0.5 rounded
                  bg-amber-500/90 text-white shadow-md"
                title={BRANDED_OVERLAY_LABEL}
              >
                ⚠ {BRANDED_OVERLAY_LABEL}
              </span>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 text-white/40 text-center px-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
            <span className="text-[9px] font-medium">{UNRESOLVED_IMAGE_LABEL}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <p className="text-sm font-bold text-white/90 leading-snug line-clamp-2">{item.name}</p>
          {dimensions && (
            <p className="text-[10px] text-white/35 font-mono mt-0.5" dir="ltr">{dimensions}</p>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
          {sourceBadge && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${sourceBadge.className}`}>
              {sourceBadge.label}
            </span>
          )}
          {reviewBadge && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${reviewBadge.className}`}>
              {reviewBadge.label}
            </span>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <p className="text-[10px] text-white/45 line-clamp-2 leading-relaxed flex-1">
            {item.description}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-auto">
          <span className="text-[10px] text-white/25">{item.unitOfMeasure}</span>
          <span className="text-[10px] text-blue-400 font-semibold">פרטים ←</span>
        </div>
      </div>
    </div>
  );
}
