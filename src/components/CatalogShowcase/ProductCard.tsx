"use client";

import type { CatalogItem } from "@/types/catalog";
import { getSourceType, SOURCE_BADGE, STATUS_BADGE, REVIEW_BADGE, resolveProductImage, getCategoryIcon } from "./constants";

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
  const categoryIcon = getCategoryIcon(item.category);
  const specs = item.metadata?.specs as Record<string, unknown> | undefined;
  const dimensions = specs?.dimensions as string | undefined;

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
      {/* Image */}
      <div className="h-28 bg-white/5 flex items-center justify-center border-b border-white/5 relative overflow-hidden">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = "none";
              const parent = el.parentElement;
              if (parent) {
                const span = document.createElement("span");
                span.className = "text-3xl opacity-50";
                span.textContent = categoryIcon;
                parent.appendChild(span);
              }
            }}
          />
        ) : (
          <span className="text-3xl opacity-50">{categoryIcon}</span>
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
