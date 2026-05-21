"use client";

import { useState, useMemo } from "react";
import { useCatalogContext } from "@/context/CatalogContext";
import type { CatalogItem } from "@/types/catalog";
import { CategoryCard } from "./CategoryCard";
import { ProductCard } from "./ProductCard";
import { ProductModal } from "./ProductModal";
import { SHOWCASE_CATEGORIES, getCategoryIcon, getSourceType } from "./constants";

const ALL_KEY = "__all__";

const SAFETY_CATCHALL = { key: "__safety_misc__", label: "אביזרי בטיחות נוספים", icon: "🛡️" };

type FilterStatus = "all" | "active" | "inactive";
type FilterSource = "all" | "elkayam" | "external";

function getDisplayCategories(items: CatalogItem[]) {
  const allCats = new Set(items.map(i => i.category));
  const result: Array<{ key: string; label: string; icon: string }> = [
    { key: ALL_KEY, label: "הכל", icon: "📦" },
  ];

  for (const cat of SHOWCASE_CATEGORIES) {
    if (allCats.has(cat.key)) {
      result.push({ key: cat.key, label: cat.label, icon: cat.icon });
    }
  }

  const knownKeys = new Set(SHOWCASE_CATEGORIES.map(c => c.key));
  const miscSafety = [...allCats].filter(
    c => c.startsWith("אביזרי בטיחות") && !knownKeys.has(c)
  );
  if (miscSafety.length > 0) {
    result.push(SAFETY_CATCHALL);
  }

  const coveredKeys = new Set([...SHOWCASE_CATEGORIES.map(c => c.key), ...miscSafety]);
  for (const cat of allCats) {
    if (!coveredKeys.has(cat)) {
      result.push({ key: cat, label: cat, icon: getCategoryIcon(cat) });
    }
  }

  return result;
}

function filterItems(
  items: CatalogItem[],
  selectedCat: string,
  status: FilterStatus,
  source: FilterSource,
  hideInactive: boolean,
  search: string,
): CatalogItem[] {
  return items.filter(item => {
    if (selectedCat !== ALL_KEY) {
      if (selectedCat === SAFETY_CATCHALL.key) {
        const knownKeys = new Set(SHOWCASE_CATEGORIES.map(c => c.key));
        if (!item.category.startsWith("אביזרי בטיחות") || knownKeys.has(item.category)) return false;
      } else {
        if (item.category !== selectedCat) return false;
      }
    }
    if (status === "active" && !item.isActive) return false;
    if (status === "inactive" && item.isActive) return false;
    if (hideInactive && !item.isActive) return false;
    if (source !== "all") {
      const st = getSourceType(item.metadata);
      if (source === "elkayam" && st !== "elkayam") return false;
      if (source === "external" && st !== "external") return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (
        !item.name.toLowerCase().includes(q) &&
        !item.category.toLowerCase().includes(q) &&
        !(item.description ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });
}

export function CatalogShowcasePage() {
  const { items } = useCatalogContext();

  const [selectedCat, setSelectedCat]   = useState(ALL_KEY);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [hideInactive, setHideInactive] = useState(false);
  const [search, setSearch]             = useState("");
  const [activeModal, setActiveModal]   = useState<CatalogItem | null>(null);

  const displayCategories = useMemo(() => getDisplayCategories(items), [items]);

  const countPerCat = useMemo(() => {
    const counts: Record<string, number> = { [ALL_KEY]: items.length };
    const knownKeys = new Set(SHOWCASE_CATEGORIES.map(c => c.key));
    for (const item of items) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      if (item.category.startsWith("אביזרי בטיחות") && !knownKeys.has(item.category)) {
        counts[SAFETY_CATCHALL.key] = (counts[SAFETY_CATCHALL.key] ?? 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const filtered = useMemo(() =>
    filterItems(items, selectedCat, filterStatus, filterSource, hideInactive, search),
    [items, selectedCat, filterStatus, filterSource, hideInactive, search]
  );

  const stats = useMemo(() => ({
    total:      items.length,
    active:     items.filter(i => i.isActive).length,
    withImg:    items.filter(i => {
      const imgs = i.metadata?.images as Record<string, unknown> | undefined;
      return !!(imgs?.thumb || imgs?.full);
    }).length,
    categories: displayCategories.length - 1,
  }), [items, displayCategories]);

  const selectedLabel = displayCategories.find(c => c.key === selectedCat)?.label ?? "הכל";

  return (
    <div className="min-h-screen" style={{ background: "#0d1b2e" }} dir="rtl">

      {/* Hero */}
      <div
        className="px-6 sm:px-8 lg:px-12 pt-8 pb-7 border-b"
        style={{ background: "linear-gradient(135deg,#1a2d4a,#0d1b2e)", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-6xl mx-auto">
          <div
            className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest px-3 py-1 rounded-full mb-3"
            style={{ background: "rgba(29,111,216,0.15)", border: "1px solid rgba(29,111,216,0.3)", color: "#60a5fa" }}
          >
            🚧 ELKAYAM CATALOG
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            קטלוג מוצרי{" "}
            <span style={{ color: "#f59e0b" }}>בטיחות ותנועה</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.45)" }}>
            פתרונות הסדרי תנועה, סימון כבישים, שילוט, אביזרי בטיחות ואביזרי דרך
          </p>

          {/* Search + filters */}
          <div className="flex flex-wrap gap-2 mt-5 items-center">
            <div
              className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm px-3 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>🔍</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש מוצר, קטגוריה..."
                className="bg-transparent border-none outline-none text-sm flex-1 text-white placeholder-white/30"
              />
            </div>

            {(["all", "active", "inactive"] as FilterStatus[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filterStatus === s
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-transparent text-white/50 border-white/15 hover:border-white/30"
                }`}
              >
                {s === "all" ? "הכל" : s === "active" ? "● פעיל" : "○ לא פעיל"}
              </button>
            ))}

            {(["all", "elkayam", "external"] as FilterSource[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterSource(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filterSource === s
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-transparent text-white/50 border-white/15 hover:border-white/30"
                }`}
              >
                {s === "all" ? "כל המקורות" : s === "elkayam" ? "אלקיים" : "מקור חיצוני"}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setHideInactive(v => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                hideInactive
                  ? "bg-gray-600 border-gray-500 text-white"
                  : "bg-transparent text-white/50 border-white/15 hover:border-white/30"
              }`}
            >
              {hideInactive ? "✓ מסתיר לא פעיל" : "הסתר לא פעיל"}
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-5 mt-4">
            {[
              { val: stats.total, label: "מוצרים" },
              { val: stats.active, label: "פעילים" },
              { val: stats.categories, label: "קטגוריות" },
              { val: stats.withImg, label: "עם תמונה" },
            ].map(s => (
              <div key={s.label}>
                <p className="text-base font-black text-white/70">{s.val}</p>
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">

        {/* Category grid */}
        <p className="text-[10px] font-bold tracking-widest mt-7 mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
          קטגוריות מוצרים
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2 mb-8">
          {displayCategories.map(cat => (
            <CategoryCard
              key={cat.key}
              category={cat}
              count={countPerCat[cat.key] ?? 0}
              selected={selectedCat === cat.key}
              onClick={() => setSelectedCat(cat.key)}
            />
          ))}
        </div>

        {/* Product grid header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>
            {selectedLabel}
          </h2>
          <span
            className="text-xs px-2.5 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)" }}
          >
            {filtered.length} מוצרים
          </span>
        </div>

        {/* Product grid */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm">לא נמצאו מוצרים בקטגוריה זו</p>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.15)" }}>נסה לשנות את הסינון</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-12">
            {filtered.map(item => (
              <ProductCard key={item.id} item={item} onClick={setActiveModal} />
            ))}
          </div>
        )}

      </div>

      {/* Modal */}
      {activeModal && (
        <ProductModal item={activeModal} onClose={() => setActiveModal(null)} />
      )}
    </div>
  );
}
