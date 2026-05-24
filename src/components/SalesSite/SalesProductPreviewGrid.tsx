"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";
import { SalesGlassPanel } from "./SalesGlassPanel";
import { SalesProductCard } from "./SalesProductCard";
import { SalesProductModal } from "./SalesProductModal";

export function SalesProductPreviewGrid({
  sellableItems,
  hiddenItems,
}: {
  sellableItems: CatalogItem[];
  hiddenItems: CatalogItem[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of sellableItems) {
      const c = i.category?.trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [sellableItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sellableItems.filter((i) => {
      if (category !== "all" && i.category?.trim() !== category) return false;
      if (q) {
        const hay = `${i.name} ${i.category ?? ""} ${i.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sellableItems, search, category]);

  const previewHidden = useMemo(() => hiddenItems.slice(0, 5), [hiddenItems]);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">מוצרים שמוכנים לפרסום</h2>
          <span className="text-sm text-white/50">
            {filtered.length} מתוך {sellableItems.length}
          </span>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש מוצר לפי שם, קטגוריה או תיאור"
            aria-label="חיפוש מוצר"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pr-10 pl-3 text-sm text-white placeholder-white/35 backdrop-blur-xl focus:border-ek-blue/40 focus:outline-none focus:ring-2 focus:ring-ek-blue/30"
          />
        </div>

        {categories.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {["all", ...categories].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  category === c
                    ? "border-ek-blue/50 bg-ek-blue/20 text-white"
                    : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {c === "all" ? "הכל" : c}
              </button>
            ))}
          </div>
        )}

        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {filtered.map((item) => (
              <SalesProductCard key={item.id} item={item} onClick={() => setSelected(item)} />
            ))}
          </div>
        ) : (
          <SalesGlassPanel className="p-8 text-center">
            <p className="text-sm text-white/50">
              {sellableItems.length === 0
                ? "אין כרגע מוצרים פעילים. ניתן להפעיל מוצרים במסך הקטלוג."
                : "לא נמצאו מוצרים התואמים את החיפוש."}
            </p>
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
              <SalesProductCard key={item.id} item={item} muted />
            ))}
          </div>
        </section>
      )}

      <SalesProductModal item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
