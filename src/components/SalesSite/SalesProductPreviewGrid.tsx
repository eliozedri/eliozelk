"use client";

import { useMemo } from "react";
import type { CatalogItem } from "@/types/catalog";
import { resolveProductImage } from "@/components/CatalogShowcase/constants";
import { SalesGlassPanel } from "./SalesGlassPanel";

function ProductGlassCard({ item, muted = false }: { item: CatalogItem; muted?: boolean }) {
  const img = resolveProductImage(item.metadata);
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_12px_40px_rgba(29,111,216,0.25)] ${
        muted ? "opacity-45 saturate-50" : ""
      }`}
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
    </div>
  );
}

export function SalesProductPreviewGrid({
  sellableItems,
  hiddenItems,
}: {
  sellableItems: CatalogItem[];
  hiddenItems: CatalogItem[];
}) {
  const previewSellable = useMemo(() => sellableItems.slice(0, 10), [sellableItems]);
  const previewHidden = useMemo(() => hiddenItems.slice(0, 5), [hiddenItems]);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">מוצרים שמוכנים לפרסום</h2>
          <span className="text-sm text-white/50">{sellableItems.length} מוצרים</span>
        </div>
        {previewSellable.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {previewSellable.map((item) => (
              <ProductGlassCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <SalesGlassPanel className="p-8 text-center">
            <p className="text-sm text-white/50">אין כרגע מוצרים פעילים. ניתן להפעיל מוצרים במסך הקטלוג.</p>
          </SalesGlassPanel>
        )}
      </section>

      {previewHidden.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white/70">מוצרים שלא יופיעו באתר</h2>
            <span className="text-sm text-white/40">{hiddenItems.length} מוצרים</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {previewHidden.map((item) => (
              <ProductGlassCard key={item.id} item={item} muted />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
