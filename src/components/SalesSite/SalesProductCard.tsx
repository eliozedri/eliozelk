"use client";

import type { CatalogItem } from "@/types/catalog";
import { resolveProductImage } from "@/components/CatalogShowcase/constants";

export function SalesProductCard({
  item,
  muted = false,
  onClick,
}: {
  item: CatalogItem;
  muted?: boolean;
  onClick?: () => void;
}) {
  const img = resolveProductImage(item.metadata);
  const clickable = !muted && !!onClick;
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      aria-label={`פרטי המוצר ${item.name}`}
      className={`group relative block w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-right backdrop-blur-xl transition-all ${
        clickable
          ? "cursor-pointer hover:-translate-y-1 hover:border-ek-blue/40 hover:shadow-[0_12px_40px_rgba(29,111,216,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ek-blue/60"
          : "cursor-default"
      } ${muted ? "opacity-45 saturate-50" : ""}`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-navy-700/60 to-navy-900/60">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-4xl font-bold text-white/30">{item.name.slice(0, 1)}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy-950/70 via-transparent to-transparent" />
        {clickable && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            צפייה בפרטים
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-white">{item.name}</h3>
        <p className="mt-1 truncate text-xs text-white/50">{item.category || "—"}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-white">
            {item.defaultPrice != null ? `₪${item.defaultPrice.toLocaleString()}` : "—"}
          </span>
          {!muted && (
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              מוכן לפרסום
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
