"use client";

import { useEffect } from "react";
import { X, Tag, Package, Layers } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";
import { resolveProductImage } from "@/components/CatalogShowcase/constants";
import { statusBucket, STATUS_LABEL_HE, statusPillClass } from "@/lib/catalog/sellable";

export function SalesProductModal({
  item,
  onClose,
}: {
  item: CatalogItem | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [item, onClose]);

  if (!item) return null;

  const img = resolveProductImage(item.metadata);
  const bucket = statusBucket(item);
  const specs = item.metadata?.specs as Record<string, unknown> | undefined;
  const material = specs?.material as string | undefined;
  const dimensions = specs?.dimensions as string | undefined;
  const reserved = item.reservedQuantity ?? 0;
  const available = item.currentQuantity - reserved;
  const inStock = item.currentQuantity > 0;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-navy-950/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] rounded-3xl border border-white/15 bg-navy-900/80 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute -top-20 -left-20 h-56 w-56 rounded-full bg-ek-blue/25 blur-3xl" />
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          className="absolute left-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 backdrop-blur transition-colors hover:bg-white/20 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-navy-700/60 to-navy-950">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-6xl font-bold text-white/20">{item.name.slice(0, 1)}</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/20 to-transparent" />
        </div>

        <div className="relative space-y-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">{item.name}</h2>
              {item.category && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-white/55">
                  <Tag className="h-3 w-3" /> {item.category}
                </span>
              )}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusPillClass[bucket]}`}>
              {STATUS_LABEL_HE[bucket]}
            </span>
          </div>

          {item.description && (
            <p className="text-sm leading-relaxed text-white/70">{item.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] text-white/45">מחיר</div>
              <div className="mt-0.5 text-base font-bold text-white">
                {item.defaultPrice != null ? `₪${item.defaultPrice.toLocaleString()}` : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] text-white/45">יחידת מידה</div>
              <div className="mt-0.5 text-base font-medium text-white/90">{item.unitOfMeasure || "—"}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
            <Package className="h-4 w-4 text-white/50" />
            <span className="text-sm text-white/70">{inStock ? `במלאי: ${item.currentQuantity}` : "אזל מהמלאי"}</span>
            {inStock && reserved > 0 && <span className="text-xs text-white/40">(זמין: {available})</span>}
          </div>

          {(material || dimensions) && (
            <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
              {material && (
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-white/40" /> חומר: {material}
                </div>
              )}
              {dimensions && (
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-white/40" /> מידות: {dimensions}
                </div>
              )}
            </div>
          )}

          <p className="pt-1 text-center text-[11px] text-white/35">תצוגה מקדימה — ניהול אתר המכירה בפיתוח</p>
        </div>
      </div>
    </div>
  );
}
