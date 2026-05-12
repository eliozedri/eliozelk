"use client";

import { useState, useMemo } from "react";
import { SAFETY_ACCESSORIES } from "@/data/safetyAccessories";
import type {
  SafetyAccessoryItem,
  SafetySubcategory,
  SafetyReadinessStatus,
  SafetyPowerSource,
} from "@/types/safetyAccessory";
import {
  SAFETY_SUBCATEGORIES,
  SAFETY_SUBCATEGORY_COLORS,
  STATUS_LABELS,
  STATUS_COLORS,
  POWER_SOURCE_LABELS,
} from "@/types/safetyAccessory";

// ── Icons ──────────────────────────────────────────────────────────────

function ShieldIcon({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SolarIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function ReflectIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

const inputCls =
  "px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 transition-all";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-700">{value}</dd>
    </div>
  );
}

// ── Detail Panel ───────────────────────────────────────────────────────

function DetailPanel({ item, onClose }: { item: SafetyAccessoryItem; onClose: () => void }) {
  const subColor = SAFETY_SUBCATEGORY_COLORS[item.subcategory];
  const statusColor = STATUS_COLORS[item.status];
  const statusLabel = STATUS_LABELS[item.status];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 sticky top-6 overflow-hidden">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-gray-900 text-base leading-tight">{item.name}</h2>
          {item.catalogName !== item.name && (
            <p className="text-[11px] text-gray-400 mt-0.5">שם בקטלוג: {item.catalogName}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Badges row */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${subColor}`}>
          {item.subcategory}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor}`}>
          {statusLabel}
        </span>
        {item.isSolar && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-yellow-100 text-yellow-700">
            <SolarIcon />סולארי
          </span>
        )}
        {item.isElectric && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">
            חשמלי
          </span>
        )}
        {item.isReflective && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700">
            <ReflectIcon />מחזיר אור
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div className="px-4 py-3 overflow-y-auto max-h-[calc(100vh-280px)] space-y-3">
        {/* Description */}
        <div>
          <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">תיאור</dt>
          <dd className="text-sm text-gray-700 leading-relaxed">{item.description}</dd>
        </div>

        <dl className="space-y-2.5">
          <Field label="חומר"           value={item.material} />
          <Field label="מידות"          value={item.dimensions} />
          <Field label="צבעים"          value={item.colors?.join(", ")} />
          <Field label="אופן התקנה"     value={item.installationMethod} />
          <Field label="סביבת שימוש"    value={item.usageEnvironment} />
          <Field label="שימוש ייעודי"   value={item.intendedUse} />
          <Field label="יחידת מידה"     value={item.unitOfMeasure} />
          {item.powerSource && item.powerSource !== "none" && (
            <Field label="מקור חשמל" value={POWER_SOURCE_LABELS[item.powerSource]} />
          )}
        </dl>

        {/* Variants */}
        {item.variants.length > 0 && (
          <div>
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">גרסאות / מידות</dt>
            <ul className="space-y-1">
              {item.variants.map((v, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1">—</span>
                  <span>
                    {v.label}
                    {v.material && v.material !== item.material && (
                      <span className="text-gray-400 text-xs"> ({v.material})</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Notes */}
        {item.notes && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <dt className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-0.5">הערות</dt>
            <dd className="text-sm text-amber-800">{item.notes}</dd>
          </div>
        )}

        {/* Missing fields */}
        {item.missingFields.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <dt className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">שדות חסרים</dt>
            <dd className="text-xs text-gray-500">{item.missingFields.join(" · ")}</dd>
          </div>
        )}

        {/* Source */}
        <div className="pt-1 border-t border-gray-100">
          <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">מקור</dt>
          <dd className="text-xs text-gray-500">
            קטלוג אלקיים סימון כבישים — עמ' {item.catalogPage} · מזהה: {item.id}
          </dd>
          <dd className="text-xs text-gray-400 mt-0.5">
            רמת ביטחון: {item.confidence === "high" ? "גבוהה" : item.confidence === "medium" ? "בינונית" : "נמוכה"}
          </dd>
        </div>
      </div>
    </div>
  );
}

// ── Product Card ───────────────────────────────────────────────────────

function ProductCard({
  item,
  selected,
  onSelect,
}: {
  item: SafetyAccessoryItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const subColor = SAFETY_SUBCATEGORY_COLORS[item.subcategory];
  const statusColor = STATUS_COLORS[item.status];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-right p-3.5 rounded-xl border transition-all hover:shadow-sm ${
        selected
          ? "bg-blue-50 border-blue-400 ring-1 ring-blue-400"
          : "bg-white border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">עמ' קטלוג {item.catalogPage}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}>
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${subColor}`}>
          {item.subcategory}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        {item.material && (
          <span className="truncate">{item.material}</span>
        )}
        {item.dimensions && (
          <span className="truncate max-w-[160px]">{item.dimensions}</span>
        )}
        {item.isSolar && (
          <span className="inline-flex items-center gap-0.5 text-yellow-600">
            <SolarIcon />סולארי
          </span>
        )}
        {item.isReflective && (
          <span className="inline-flex items-center gap-0.5 text-indigo-500">
            <ReflectIcon />מחזיר אור
          </span>
        )}
        {item.variants.length > 0 && (
          <span className="text-gray-400">{item.variants.length} גרסאות</span>
        )}
      </div>
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export function SafetyAccessoriesPage() {
  const [search, setSearch]               = useState("");
  const [filterSub, setFilterSub]         = useState<SafetySubcategory | "all">("all");
  const [filterStatus, setFilterStatus]   = useState<SafetyReadinessStatus | "all">("all");
  const [filterPower, setFilterPower]     = useState<SafetyPowerSource | "all">("all");
  const [selectedId, setSelectedId]       = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return SAFETY_ACCESSORIES.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q) &&
                !item.catalogName.toLowerCase().includes(q) &&
                !item.description.toLowerCase().includes(q)) return false;
      if (filterSub !== "all" && item.subcategory !== filterSub) return false;
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (filterPower !== "all") {
        if (filterPower === "solar" && !item.isSolar) return false;
        if (filterPower === "electric" && !item.isElectric) return false;
        if (filterPower === "solar_or_electric" && !(item.isSolar || item.isElectric)) return false;
        if (filterPower === "none" && (item.isSolar || item.isElectric)) return false;
      }
      return true;
    });
  }, [search, filterSub, filterStatus, filterPower]);

  const selectedItem = selectedId ? (SAFETY_ACCESSORIES.find((p) => p.id === selectedId) ?? null) : null;

  const stats = useMemo(() => ({
    total:        SAFETY_ACCESSORIES.length,
    subcats:      new Set(SAFETY_ACCESSORIES.map((p) => p.subcategory)).size,
    ready:        SAFETY_ACCESSORIES.filter((p) => p.status === "ready").length,
    missing:      SAFETY_ACCESSORIES.filter((p) => p.status === "missing_data").length,
    review:       SAFETY_ACCESSORIES.filter((p) => p.status === "needs_review").length,
    solar:        SAFETY_ACCESSORIES.filter((p) => p.isSolar).length,
  }), []);

  function selectItem(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  function clearFilters() {
    setSearch("");
    setFilterSub("all");
    setFilterStatus("all");
    setFilterPower("all");
    setSelectedId(null);
  }

  const hasFilters = search || filterSub !== "all" || filterStatus !== "all" || filterPower !== "all";

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4" dir="rtl">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">אביזרי בטיחות</h1>
          <ShieldIcon className="w-6 h-6 text-blue-600 shrink-0" />
        </div>
        <p className="text-sm text-gray-500 mb-5">
          קטלוג מוצרים מקטלוג אלקיים סימון כבישים — אביזרי בטיחות לכבישים וחניונים (עמ' 7–20)
        </p>

        {/* ── KPI Chips ── */}
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
            {stats.total} מוצרים
          </span>
          <span className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
            {stats.subcats} תת-קטגוריות
          </span>
          <span className="px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-sm font-medium text-green-700 shadow-sm">
            {stats.ready} מוכנים
          </span>
          <span className="px-3 py-1.5 rounded-full bg-yellow-50 border border-yellow-200 text-sm font-medium text-yellow-700 shadow-sm">
            {stats.missing} חסרים נתונים
          </span>
          {stats.review > 0 && (
            <span className="px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-sm font-medium text-red-700 shadow-sm">
              {stats.review} לבדיקה
            </span>
          )}
          <span className="px-3 py-1.5 rounded-full bg-yellow-50 border border-yellow-200 text-sm font-medium text-yellow-700 shadow-sm">
            {stats.solar} סולאריים
          </span>
        </div>

        {/* ── Filter Bar ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 mb-4 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, תיאור..."
            className={`${inputCls} flex-1 min-w-40`}
          />
          <select
            value={filterSub}
            onChange={(e) => setFilterSub(e.target.value as SafetySubcategory | "all")}
            className={inputCls}
          >
            <option value="all">כל תת-הקטגוריות</option>
            {SAFETY_SUBCATEGORIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as SafetyReadinessStatus | "all")}
            className={inputCls}
          >
            <option value="all">כל הסטטוסים</option>
            <option value="ready">מוכן</option>
            <option value="missing_data">חסרים נתונים</option>
            <option value="needs_review">לבדיקה</option>
          </select>
          <select
            value={filterPower}
            onChange={(e) => setFilterPower(e.target.value as SafetyPowerSource | "all")}
            className={inputCls}
          >
            <option value="all">כל מקורות חשמל</option>
            <option value="solar">סולארי</option>
            <option value="electric">חשמלי</option>
            <option value="solar_or_electric">סולארי / חשמלי</option>
            <option value="none">ללא חשמל</option>
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-800 underline underline-offset-2 whitespace-nowrap"
            >
              נקה סינון
            </button>
          )}
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {filtered.length} / {SAFETY_ACCESSORIES.length}
          </span>
        </div>

        {/* ── Content Area ── */}
        <div className="flex gap-4 items-start">

          {/* Product List */}
          <div className={`${selectedItem ? "flex-1 min-w-0" : "w-full"}`}>
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 py-16 text-center">
                <ShieldIcon className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                <p className="text-gray-500 font-medium">לא נמצאו מוצרים תואמים</p>
                <p className="text-sm text-gray-400 mt-1">נסה לשנות את הסינון</p>
              </div>
            ) : (
              <div className={`grid gap-3 ${selectedItem ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
                {filtered.map((item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onSelect={() => selectItem(item.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selectedItem && (
            <div className="w-80 xl:w-96 shrink-0">
              <DetailPanel item={selectedItem} onClose={() => setSelectedId(null)} />
            </div>
          )}
        </div>

        {/* ── Subcategory legend ── */}
        {!selectedItem && filtered.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">תת-קטגוריות</p>
            <div className="flex flex-wrap gap-2">
              {SAFETY_SUBCATEGORIES.map((s) => {
                const count = SAFETY_ACCESSORIES.filter((p) => p.subcategory === s).length;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilterSub(filterSub === s ? "all" : s)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      SAFETY_SUBCATEGORY_COLORS[s]
                    } ${filterSub === s ? "ring-2 ring-offset-1 ring-gray-400" : "hover:opacity-80"}`}
                  >
                    {s}
                    <span className="opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Source note ── */}
        <p className="text-center text-xs text-gray-300 mt-6">
          מקור: קטלוג אלקיים סימון כבישים בע"מ · יובא 12.05.2026 · {SAFETY_ACCESSORIES.length} מוצרים
        </p>
      </div>
    </div>
  );
}
