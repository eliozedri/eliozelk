"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useCatalogContext } from "@/context/CatalogContext";
import type { CatalogItem, CatalogFormState, CatalogItemType, LinkedProductEntry } from "@/types/catalog";
import { TYPE_LABELS, TYPE_COLORS, UNIT_OPTIONS, DIMENSION_UNIT_OPTIONS, LENGTH_UNITS, AREA_UNITS, NO_DIMENSION_UNITS } from "@/types/catalog";
import { getSupabase } from "@/lib/supabase/client";
import {
  getSourceType, SOURCE_BADGE, REVIEW_BADGE, resolveProductImage,
  isUnresolvedImage, UNRESOLVED_IMAGE_LABEL,
} from "@/components/CatalogShowcase/constants";
import { statusBucket, STATUS_LABEL_HE, statusPillClass } from "@/lib/catalog/sellable";

function getSourceLabel(metadata: Record<string, unknown> | undefined): string | null {
  const sources = metadata?.sources as Array<{ type: string }> | undefined;
  const first = sources?.[0]?.type;
  if (first === "website") return "אתר";
  if (first === "company_profile") return "פרופיל";
  if (first === "seed") return "בטיחות";
  return null;
}

const inputCls =
  "w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 transition-all";

const emptyForm: CatalogFormState = {
  name: "",
  type: "product",
  category: "",
  unitOfMeasure: "יחידה",
  dimensionValue: "",
  dimensionUnit: "",
  defaultPrice: "",
  costPrice: "",
  description: "",
};

const UNIT_HINTS: Record<string, string> = {
  "יום": "1 יום = 8 שעות · מלא כמות ימים × מספר עובדים",
  "משמרת": "1 משמרת = 12 שעות · מלא כמות משמרות × מספר עובדים",
  "שעה": "מלא כמות שעות — ניתן לכפול לפי מספר עובדים",
};

function CatalogIcon() {
  return (
    <svg className="w-7 h-7 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Inline detail panel (table view expand) ───────────────────────────────────

function CatalogItemDetailPanel({ item, onEdit, onToggle }: {
  item: CatalogItem;
  onEdit: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const specs   = item.metadata?.specs   as Record<string, unknown> | undefined;
  const images  = item.metadata?.images  as Record<string, string | undefined> | undefined;
  const safetyRefId     = item.metadata?.safety_ref_id as string  | undefined;
  const isFleetManaged  = item.metadata?.fleet_managed  as boolean | undefined;
  const sourceLabel     = getSourceLabel(item.metadata);

  const hasMaterial    = specs?.material    as string  | undefined;
  const specDimensions = specs?.dimensions  as string  | undefined;
  const isSolar        = specs?.is_solar    as boolean | undefined;
  const isElectric     = specs?.is_electric as boolean | undefined;
  const isReflective   = specs?.is_reflective as boolean | undefined;
  const catalogPage    = specs?.catalog_page  as number | undefined;
  const readiness      = specs?.readiness_status as string | undefined;
  const confidence     = specs?.confidence     as string | undefined;
  const specNotes      = specs?.notes          as string | undefined;

  const hasSpecs  = !!(hasMaterial || specDimensions || isSolar || isElectric || isReflective || catalogPage);
  const hasLinked = (item.linkedProducts?.length ?? 0) > 0;

  const readinessLabel: Record<string, string> = { ready: "מוכן", missing_data: "חסרים נתונים", needs_review: "לבדיקה" };
  const readinessColor: Record<string, string> = { ready: "text-green-700", missing_data: "text-amber-700", needs_review: "text-orange-700" };
  const confidenceLabel: Record<string, string> = { high: "גבוה", medium: "בינוני", low: "נמוך" };

  return (
    <tr>
      <td colSpan={9} className="p-0 border-b border-blue-100">
        <div className="px-6 py-4 bg-blue-50/25">
          <div className="flex gap-5">

            {/* Thumbnail — prefer new thumb, fall back to full, suppress legacy product path */}
            {(() => {
              const imgUrl = images?.thumb ?? images?.full ?? null;
              const cropStatus = images?.crop_status;
              return imgUrl ? (
                <div className="shrink-0 space-y-1">
                  <img
                    src={imgUrl}
                    alt={item.name}
                    className="w-20 h-20 object-cover rounded-lg border border-gray-200 bg-white shadow-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {cropStatus === "needs_review" && (
                    <p className="text-[9px] text-orange-500 italic text-center">תמונה לבדיקה</p>
                  )}
                </div>
              ) : null;
            })()}

            <div className="flex-1 min-w-0 space-y-3">

              {/* Header: name + badges + actions */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${TYPE_COLORS[item.type]}`}>{TYPE_LABELS[item.type]}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${item.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {item.isActive ? "פעיל" : "לא פעיל"}
                    </span>
                    {safetyRefId && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">🛡 בטיחות</span>}
                    {isFleetManaged && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">צי</span>}
                    {sourceLabel && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">{sourceLabel}</span>}
                    {(() => {
                      const reviewState = item.metadata?.review_state as string | undefined;
                      const rb = reviewState ? REVIEW_BADGE[reviewState] : null;
                      return rb ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${rb.className}`}>{rb.label}</span>
                      ) : null;
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    {item.isActive ? "השבת" : "הפעל"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEdit(item.id); }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <PencilIcon />
                    ערוך
                  </button>
                </div>
              </div>

              {/* Description */}
              {item.description && (
                <p className="text-xs text-gray-600 leading-relaxed">{item.description}</p>
              )}

              {/* Core fields grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                {item.category && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">קטגוריה</p>
                    <p className="text-gray-700">{item.category}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">יחידה</p>
                  <p className="text-gray-700">{item.unitOfMeasure}</p>
                </div>
                {item.defaultPrice !== null && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">מחיר מכירה</p>
                    <p className="font-semibold text-gray-800" dir="ltr">₪{item.defaultPrice.toLocaleString()}</p>
                  </div>
                )}
                {item.costPrice != null && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">מחיר עלות</p>
                    <p className="text-gray-700" dir="ltr">₪{item.costPrice.toLocaleString()}</p>
                  </div>
                )}
                {item.dimensionValue && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">מידה</p>
                    <p className="text-gray-700" dir="ltr">{item.dimensionValue}{item.dimensionUnit ? ` ${item.dimensionUnit}` : ""}</p>
                  </div>
                )}
                {(item.currentQuantity > 0 || item.minimumQuantity > 0) && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">מלאי</p>
                    <p className="text-gray-700">
                      {item.currentQuantity - item.reservedQuantity} זמין
                      {item.reservedQuantity > 0 && <span className="text-amber-600"> · {item.reservedQuantity} שמור</span>}
                    </p>
                  </div>
                )}
              </div>

              {/* Technical specs (safety items) */}
              {hasSpecs && (
                <div className="bg-white rounded-lg border border-gray-100 px-4 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">מפרט טכני</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    {hasMaterial && <span><span className="text-gray-400">חומר: </span><span className="text-gray-700">{hasMaterial}</span></span>}
                    {specDimensions && !item.dimensionValue && <span><span className="text-gray-400">מידות: </span><span className="text-gray-700">{specDimensions}</span></span>}
                    {isSolar && <span className="text-amber-700 font-medium">☀ סולארי</span>}
                    {isElectric && !isSolar && <span className="text-yellow-700 font-medium">⚡ חשמלי</span>}
                    {isReflective && <span className="text-purple-700 font-medium">◈ רפלקטיבי</span>}
                    {catalogPage && <span><span className="text-gray-400">עמוד: </span><span className="text-gray-700">{catalogPage}</span></span>}
                    {readiness && (
                      <span>
                        <span className="text-gray-400">סטטוס: </span>
                        <span className={`font-medium ${readinessColor[readiness] ?? "text-gray-700"}`}>{readinessLabel[readiness] ?? readiness}</span>
                      </span>
                    )}
                    {confidence && <span><span className="text-gray-400">ביטחון: </span><span className="text-gray-700">{confidenceLabel[confidence] ?? confidence}</span></span>}
                  </div>
                  {specNotes && <p className="text-[11px] text-gray-500 italic mt-1.5">{specNotes}</p>}
                </div>
              )}

              {/* Linked products */}
              {hasLinked && (
                <p className="text-xs text-gray-600">
                  <span className="text-gray-400">נלווים: </span>
                  {item.linkedProducts!.map((lp, i) => (
                    <span key={lp.id}>{i > 0 && " · "}{lp.name} ×{lp.qty}{lp.required ? " (חובה)" : ""}</span>
                  ))}
                </p>
              )}

            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Item card (cards view) ────────────────────────────────────────────────────

function ItemCard({ item, onEdit, onToggle, onDelete }: {
  item: CatalogItem;
  onEdit: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const specs = item.metadata?.specs as Record<string, unknown> | undefined;
  const isSolar = specs?.is_solar as boolean | undefined;
  const isElectric = specs?.is_electric as boolean | undefined;
  const isReflective = specs?.is_reflective as boolean | undefined;
  const specDimensions = specs?.dimensions as string | undefined;
  const safetyRefId = item.metadata?.safety_ref_id as string | undefined;

  const imgUrl = resolveProductImage(item.metadata);
  const sourceType = getSourceType(item.metadata);
  const sourceBadge = SOURCE_BADGE[sourceType];
  const reviewState = item.metadata?.review_state as string | undefined;
  const reviewBadge = reviewState ? REVIEW_BADGE[reviewState] : null;
  const unresolved = isUnresolvedImage(item.metadata);

  function handleCardClick() {
    onEdit(item.id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit(item.id);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={`bg-white border rounded-xl overflow-hidden flex flex-col hover:shadow-md hover:border-blue-300 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${
        !item.isActive ? "opacity-55 border-gray-100" : "border-gray-200"
      }`}
    >
      {/* Product image — real photo when available, professional placeholder otherwise */}
      <div className="h-32 bg-gradient-to-br from-slate-100 to-slate-50 flex flex-col items-center justify-center gap-1 border-b border-gray-100 relative overflow-hidden">
        {imgUrl && !unresolved ? (
          <img
            src={imgUrl}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              // Hide the broken image and rely on the placeholder layer rendered below.
              const el = e.target as HTMLImageElement;
              el.style.display = "none";
              const parent = el.parentElement;
              if (parent) {
                const ph = document.createElement("div");
                ph.className = "flex flex-col items-center justify-center text-center gap-1 w-full h-full text-slate-400";
                ph.innerHTML = `
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-60"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                  <span class="text-[10px] font-medium px-1">${UNRESOLVED_IMAGE_LABEL}</span>
                `;
                parent.appendChild(ph);
              }
            }}
          />
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 opacity-60">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
            <span className="text-[10px] font-medium text-slate-500 px-1 text-center">{UNRESOLVED_IMAGE_LABEL}</span>
          </>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        {/* Name + actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.category || "ללא קטגוריה"}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0 -mt-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(item.id); }}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="ערוך"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="מחק"
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${TYPE_COLORS[item.type]}`}>
            {TYPE_LABELS[item.type]}
          </span>
          {sourceBadge && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${sourceBadge.className}`}>
              {sourceBadge.label}
            </span>
          )}
          {isSolar && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">☀ סולארי</span>
          )}
          {isElectric && !isSolar && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">⚡ חשמלי</span>
          )}
          {isReflective && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">◈ רפלקטיבי</span>
          )}
          {safetyRefId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">🛡 בטיחות</span>
          )}
          {reviewBadge && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${reviewBadge.className}`}>
              {reviewBadge.label}
            </span>
          )}
          {(item.linkedProducts?.length ?? 0) > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              {item.linkedProducts!.length} נלווים
            </span>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{item.description}</p>
        )}

        {/* Dims from specs */}
        {specDimensions && (
          <p className="text-[11px] text-gray-400 font-mono" dir="ltr">{specDimensions}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
          <div dir="ltr" className="text-sm font-semibold text-gray-700">
            {item.defaultPrice !== null
              ? <>₪{item.defaultPrice.toLocaleString()} <span className="text-xs font-normal text-gray-400">/ {item.unitOfMeasure}</span></>
              : <span className="text-gray-300 font-normal text-xs">ללא מחיר</span>
            }
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              item.isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {item.isActive ? "פעיל" : "לא פעיל"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Category combobox ─────────────────────────────────────────────────────────

function CategoryInput({ value, onChange, categories }: { value: string; onChange: (v: string) => void; categories: string[] }) {
  const listId = "catalog-categories";
  return (
    <>
      <datalist id={listId}>
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="בחר קטגוריה קיימת או הקלד חדשה"
        className={inputCls}
      />
    </>
  );
}

// ── Linked products panel ─────────────────────────────────────────────────────

const emptyNewLinked: CatalogFormState = {
  name: "", type: "product", category: "", unitOfMeasure: "יחידה",
  dimensionValue: "", dimensionUnit: "", defaultPrice: "", costPrice: "", description: "",
};

function LinkedProductsPanel({
  links,
  allItems,
  itemId,
  onChange,
  onCreateNew,
}: {
  links: LinkedProductEntry[];
  allItems: { id: string; name: string }[];
  itemId: string;
  onChange: (links: LinkedProductEntry[]) => void;
  onCreateNew?: (form: CatalogFormState) => Promise<{ id: string; name: string }>;
}) {
  const available = allItems.filter((i) => i.id !== itemId);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<CatalogFormState>(emptyNewLinked);
  const [creating, setCreating] = useState(false);

  function addExistingLink() {
    if (available.length === 0) return;
    const first = available[0];
    onChange([...links, { id: first.id, name: first.name, qty: 1, required: false }]);
  }

  function update(idx: number, patch: Partial<LinkedProductEntry>) {
    onChange(links.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  function remove(idx: number) {
    onChange(links.filter((_, i) => i !== idx));
  }

  function selectItem(idx: number, id: string) {
    const item = allItems.find((i) => i.id === id);
    if (item) update(idx, { id, name: item.name });
  }

  async function handleCreateNew() {
    if (!newForm.name.trim() || !onCreateNew) return;
    setCreating(true);
    try {
      const created = await onCreateNew(newForm);
      onChange([...links, { id: created.id, name: created.name, qty: 1, required: false }]);
      setNewForm(emptyNewLinked);
      setShowNewForm(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-2">
      {links.map((link, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <select
            value={link.id}
            onChange={(e) => selectItem(idx, e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-300 bg-white"
          >
            {available.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input
            type="number" min="1" step="1"
            value={link.qty}
            onChange={(e) => update(idx, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-14 px-2 py-1.5 text-xs rounded border border-gray-300 text-center"
            title="כמות"
          />
          <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
            <input type="checkbox" checked={link.required} onChange={(e) => update(idx, { required: e.target.checked })} className="rounded" />
            חובה
          </label>
          <button type="button" onClick={() => remove(idx)} className="text-gray-300 hover:text-red-500 transition-colors">
            <TrashIcon />
          </button>
        </div>
      ))}

      {showNewForm && (
        <div className="bg-white rounded-lg border border-blue-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-blue-700">פריט חדש לקטלוג ושיוך</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text" placeholder="שם פריט *"
              value={newForm.name}
              onChange={(e) => setNewForm(f => ({ ...f, name: e.target.value }))}
              className="px-2 py-1 text-xs rounded border border-gray-300 bg-white col-span-2"
            />
            <select
              value={newForm.type}
              onChange={(e) => setNewForm(f => ({ ...f, type: e.target.value as CatalogItemType }))}
              className="px-2 py-1 text-xs rounded border border-gray-300 bg-white"
            >
              {(Object.entries(TYPE_LABELS) as [CatalogItemType, string][]).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
            <select
              value={newForm.unitOfMeasure}
              onChange={(e) => setNewForm(f => ({ ...f, unitOfMeasure: e.target.value }))}
              className="px-2 py-1 text-xs rounded border border-gray-300 bg-white"
            >
              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <input
              type="text" placeholder="תיאור / מפרט"
              value={newForm.description}
              onChange={(e) => setNewForm(f => ({ ...f, description: e.target.value }))}
              className="px-2 py-1 text-xs rounded border border-gray-300 bg-white col-span-2"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreateNew}
              disabled={creating || !newForm.name.trim()}
              className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-medium disabled:opacity-50 transition-colors hover:bg-blue-700"
            >
              {creating ? "יוצר..." : "צור ושייך"}
            </button>
            <button
              type="button"
              onClick={() => { setShowNewForm(false); setNewForm(emptyNewLinked); }}
              className="px-3 py-1 rounded border border-gray-300 text-gray-600 text-xs hover:bg-gray-50 transition-colors"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {available.length > 0 && (
          <button
            type="button"
            onClick={addExistingLink}
            className="flex items-center gap-1 px-3 py-1 rounded border border-dashed border-gray-300 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            + שייך מוצר קיים
          </button>
        )}
        {onCreateNew && !showNewForm && (
          <button
            type="button"
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1 px-3 py-1 rounded border border-dashed border-green-300 text-xs text-green-600 hover:border-green-500 hover:text-green-700 transition-colors"
          >
            + צור מוצר חדש ושייך
          </button>
        )}
        {available.length === 0 && !onCreateNew && (
          <p className="text-xs text-gray-400 italic">אין מוצרים אחרים בקטלוג לשיוך.</p>
        )}
      </div>
    </div>
  );
}

// ── Shared form fields ────────────────────────────────────────────────────────

interface FormFieldsProps {
  form: CatalogFormState;
  update: (field: keyof CatalogFormState, value: string) => void;
  categories: string[];
  nameError?: string;
  linkedProducts?: LinkedProductEntry[];
  onLinkedProductsChange?: (links: LinkedProductEntry[]) => void;
  onCreateLinked?: (form: CatalogFormState) => Promise<{ id: string; name: string }>;
  allItems?: { id: string; name: string }[];
  itemId?: string;
  compact?: boolean;
}

function FormFields({ form, update, categories, nameError, linkedProducts, onLinkedProductsChange, onCreateLinked, allItems, itemId, compact }: FormFieldsProps) {
  const unitHint = UNIT_HINTS[form.unitOfMeasure];
  const [showLinked, setShowLinked] = useState((linkedProducts?.length ?? 0) > 0);

  const isLength = LENGTH_UNITS.has(form.unitOfMeasure);
  const isArea   = AREA_UNITS.has(form.unitOfMeasure);
  const noDim    = NO_DIMENSION_UNITS.has(form.unitOfMeasure);

  function getDimLabel() {
    if (isLength) return "מידת אורך";
    if (isArea)   return "שטח / מידות";
    if (noDim)    return "";
    return "מידה פיזית";
  }
  function getDimPlaceholder() {
    if (isLength) return "לדוג׳: 1.2";
    if (isArea)   return "לדוג׳: 0.9";
    return "גודל";
  }
  function getDimUnitOptions() {
    if (isLength) return ["מטר", "ס\"מ", "מ\"מ"];
    if (isArea)   return ["מ\"ר", "ס\"מ²"];
    return DIMENSION_UNIT_OPTIONS;
  }

  return (
    <>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${compact ? "" : "lg:grid-cols-3"} gap-3 mb-3`}>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">שם פריט <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="שם הפריט"
            className={nameError ? inputCls.replace("border-gray-300", "border-red-400 ring-2 ring-red-400") : inputCls}
          />
          {nameError && <p className="text-xs text-red-500 mt-0.5">{nameError}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">סוג</label>
          <select value={form.type} onChange={(e) => update("type", e.target.value)} className={inputCls}>
            {(Object.entries(TYPE_LABELS) as [CatalogItemType, string][]).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">קטגוריה</label>
          <CategoryInput value={form.category} onChange={(v) => update("category", v)} categories={categories} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">יחידת הזמנה</label>
          <select value={form.unitOfMeasure} onChange={(e) => update("unitOfMeasure", e.target.value)} className={inputCls}>
            {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          {unitHint && (
            <p className="text-xs text-blue-600 mt-0.5 bg-blue-50 rounded px-2 py-0.5">{unitHint}</p>
          )}
        </div>

        {!noDim && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{getDimLabel()}</label>
            <div className="flex gap-1">
              <input
                type="number" min="0" step="0.01"
                value={form.dimensionValue}
                onChange={(e) => update("dimensionValue", e.target.value)}
                placeholder={getDimPlaceholder()}
                className={`${inputCls} w-20 shrink-0`}
                dir="ltr"
              />
              <select value={form.dimensionUnit} onChange={(e) => update("dimensionUnit", e.target.value)} className={inputCls}>
                {getDimUnitOptions().map((u) => <option key={u} value={u}>{u || "— יחידה —"}</option>)}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">מחיר ברירת מחדל (₪)</label>
          <input type="number" min="0" step="0.01" value={form.defaultPrice} onChange={(e) => update("defaultPrice", e.target.value)} placeholder="0.00" className={inputCls} dir="ltr" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">מחיר עלות (₪)</label>
          <input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => update("costPrice", e.target.value)} placeholder="0.00" className={inputCls} dir="ltr" />
        </div>

        <div className={compact ? "" : "lg:col-span-3"}>
          <label className="block text-xs font-medium text-gray-600 mb-1">תיאור / מפרט</label>
          <input type="text" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="מידות, מפרט טכני..." className={inputCls} />
        </div>
      </div>

      {/* Linked products */}
      {onLinkedProductsChange && (
        <div className="border-t border-gray-100 pt-3 mt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
            <input
              type="checkbox"
              checked={showLinked}
              onChange={(e) => { setShowLinked(e.target.checked); if (!e.target.checked) onLinkedProductsChange([]); }}
              className="rounded accent-blue-600"
            />
            <span className="text-xs font-medium text-gray-700">יש מוצרים נלווים / רכיבים</span>
          </label>
          {showLinked && (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-2">מוצרים שמרכיבים את הפריט הזה או נדרשים יחד איתו</p>
              <LinkedProductsPanel
                links={linkedProducts ?? []}
                allItems={allItems ?? []}
                itemId={itemId ?? ""}
                onChange={onLinkedProductsChange}
                onCreateNew={onCreateLinked}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

interface AddItemFormProps {
  onAdd: (form: CatalogFormState, linkedProducts: LinkedProductEntry[]) => void;
  onCreateAndLink: (form: CatalogFormState) => Promise<{ id: string; name: string }>;
  categories: string[];
  allItems: { id: string; name: string }[];
}

function AddItemForm({ onAdd, onCreateAndLink, categories, allItems }: AddItemFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<CatalogFormState>(emptyForm);
  const [nameError, setNameError] = useState("");
  const [linked, setLinked] = useState<LinkedProductEntry[]>([]);

  function update(field: keyof CatalogFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "name" && nameError) setNameError("");
  }

  function handleSave() {
    if (!form.name.trim()) { setNameError("שם פריט הוא שדה חובה"); return; }
    onAdd(form, linked);
    setForm(emptyForm);
    setNameError("");
    setLinked([]);
    setIsOpen(false);
  }

  function handleCancel() {
    setForm(emptyForm);
    setNameError("");
    setLinked([]);
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <div className="flex justify-end px-5 py-3 border-b border-gray-100">
        <button type="button" onClick={() => setIsOpen(true)} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-blue-400 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors">
          + הוסף פריט
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 px-5 py-4 bg-blue-50/20">
      <FormFields
        form={form}
        update={update}
        categories={categories}
        nameError={nameError}
        linkedProducts={linked}
        onLinkedProductsChange={setLinked}
        onCreateLinked={onCreateAndLink}
        allItems={allItems}
        itemId=""
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={handleCancel} className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors">ביטול</button>
        <button type="button" onClick={handleSave} className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">שמור פריט</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CatalogPage() {
  const { items, addItem, updateItem, toggleActive, deleteItem, updateStockConfig, updateCostPrice } = useCatalogContext();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<CatalogItemType | "all">("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "needs_review" | "inactive">("all");
  const [filterMissingCost, setFilterMissingCost] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterImage, setFilterImage] = useState<"all" | "real" | "missing" | "needs_review">("all");
  const [filterPrice, setFilterPrice] = useState<"all" | "with_price" | "without_price">("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CatalogFormState>(emptyForm);
  const [editLinked, setEditLinked] = useState<LinkedProductEntry[]>([]);
  const [editMinQty, setEditMinQty] = useState("");
  const [editSupplierId, setEditSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  // Image-upload state for the card-view edit drawer
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [imageStatusOverride, setImageStatusOverride] = useState<string>("");

  useEffect(() => {
    const db = getSupabase();
    if (!db) return;
    db.from("suppliers").select("id,name").eq("is_active", true).order("name")
      .then(({ data }) => { if (data) setSuppliers(data as { id: string; name: string }[]); });
  }, []);

  // Deep-link support: /catalog?edit=<id> opens that item in edit mode.
  // Used by /catalog-showcase's ProductModal "ערוך פרטים" button so the
  // showcase no longer dumps the user into a generic list view.
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const editId = searchParams?.get("edit");
    if (editId && items.some(i => i.id === editId) && editingId !== editId) {
      startEdit(editId);
      // Strip the param so reloads don't re-open
      router.replace("/catalog", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, items]);

  const categories = useMemo(() => {
    const cats = new Set(items.map((i) => i.category).filter(Boolean));
    return Array.from(cats).sort((a, b) => a.localeCompare(b, "he"));
  }, [items]);

  const allItemRefs = useMemo(() => items.map((i) => ({ id: i.id, name: i.name })), [items]);

  function handleAdd(form: CatalogFormState, links: LinkedProductEntry[]) {
    addItem(form, links);
  }

  async function handleCreateAndLink(form: CatalogFormState): Promise<{ id: string; name: string }> {
    const item = addItem(form, []);
    return { id: item.id, name: item.name };
  }

  const missingCostCount = useMemo(
    () => items.filter(i => i.isActive && ["material", "product"].includes(i.type) && i.costPrice == null).length,
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q) && !(item.description ?? "").toLowerCase().includes(q)) return false;
      if (filterType !== "all" && item.type !== filterType) return false;
      if (filterActive !== "all" && statusBucket(item) !== filterActive) return false;
      if (filterMissingCost && !(["material", "product"].includes(item.type) && item.costPrice == null)) return false;
      if (filterCategory !== "all" && item.category !== filterCategory) return false;
      // Image filters — uses the same isUnresolvedImage rule as the cards,
      // so "with real image" excludes emoji/icon/placeholder rows.
      if (filterImage !== "all") {
        const unresolved = isUnresolvedImage(item.metadata);
        const matchType = (item.metadata as Record<string, unknown> | undefined)?.image_match_type as string | undefined;
        if (filterImage === "real"          && unresolved) return false;
        if (filterImage === "missing"       && !unresolved) return false;
        if (filterImage === "needs_review"  && matchType !== "needs_review" && matchType !== "category_relevant_image" && matchType !== "service_relevant_image") return false;
      }
      // Price filters — defaultPrice OR costPrice present
      if (filterPrice !== "all") {
        const hasPrice = item.defaultPrice != null || item.costPrice != null;
        if (filterPrice === "with_price"    && !hasPrice) return false;
        if (filterPrice === "without_price" && hasPrice)  return false;
      }
      return true;
    });
  }, [items, search, filterType, filterActive, filterMissingCost, filterCategory, filterImage, filterPrice]);

  const statusCounts = useMemo(() => {
    const c = { all: items.length, active: 0, needs_review: 0, inactive: 0 };
    for (const i of items) {
      c[statusBucket(i)] += 1;
    }
    return c;
  }, [items]);

  const stats = useMemo(() => {
    const activeCount = items.filter((i) => i.isActive).length;
    return { total: items.length, active: activeCount, categories: categories.length };
  }, [items, categories]);

  function startEdit(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setEditForm({
      name: item.name,
      type: item.type,
      category: item.category,
      unitOfMeasure: item.unitOfMeasure,
      dimensionValue: item.dimensionValue ?? "",
      dimensionUnit: item.dimensionUnit ?? "",
      defaultPrice: item.defaultPrice !== null ? String(item.defaultPrice) : "",
      costPrice: item.costPrice != null ? String(item.costPrice) : "",
      description: item.description,
    });
    setEditLinked(item.linkedProducts ?? []);
    setEditMinQty(item.minimumQuantity > 0 ? String(item.minimumQuantity) : "");
    setEditSupplierId(item.supplierId ?? "");
    setExpandedId(null);
    setEditingId(id);
    // NOTE: do not switch to table view. In card view the edit form is
    // rendered as an overlay drawer so the user stays in context.
  }

  async function saveEdit(id: string) {
    // If the user picked a new image, upload it FIRST. The API writes the
    // metadata.images block server-side, so we let it complete before
    // we touch the rest of the row via updateItem (which doesn't touch images).
    if (pendingImageFile) {
      const ok = await uploadPendingImage(id);
      if (!ok) return;
      if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl);
      setPendingImageFile(null);
      setPendingImagePreviewUrl(null);
      // The catalog context cached the old metadata. Hard-refresh so the
      // card and the showcase pick up the new public URL.
      window.location.reload();
      return;
    }
    updateItem(id, editForm, editLinked);
    const minQty = parseFloat(editMinQty) || 0;
    updateStockConfig(id, minQty, editSupplierId || null);
    const cpStr = editForm.costPrice.trim();
    const cpVal = cpStr !== "" ? parseFloat(cpStr) : null;
    updateCostPrice(id, cpVal !== null && isNaN(cpVal) ? null : cpVal);
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl);
    setPendingImageFile(null);
    setPendingImagePreviewUrl(null);
    setImageUploadError(null);
    setImageStatusOverride("");
  }

  // Image upload helpers ───────────────────────────────────────────────────────
  async function getAuthToken(): Promise<string> {
    const db = getSupabase();
    if (!db) return "";
    const { data: { session } } = await db.auth.getSession();
    return session?.access_token ?? "";
  }

  function pickImageFile(file: File | null) {
    setImageUploadError(null);
    if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl);
    if (!file) {
      setPendingImageFile(null);
      setPendingImagePreviewUrl(null);
      return;
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.type)) {
      setImageUploadError(`סוג קובץ לא נתמך: ${file.type}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageUploadError("הקובץ גדול מ-10MB");
      return;
    }
    setPendingImageFile(file);
    setPendingImagePreviewUrl(URL.createObjectURL(file));
  }

  async function uploadPendingImage(productId: string): Promise<boolean> {
    if (!pendingImageFile) return true;     // nothing to upload — OK
    setImageUploadBusy(true);
    setImageUploadError(null);
    try {
      const tok = await getAuthToken();
      const form = new FormData();
      form.append("file", pendingImageFile);
      form.append("productId", productId);
      const res = await fetch("/api/catalog/upload-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setImageUploadError(data.error ?? "שגיאה בהעלאת התמונה");
        return false;
      }
      return true;
    } catch {
      setImageUploadError("שגיאת רשת — נסה שוב");
      return false;
    } finally {
      setImageUploadBusy(false);
    }
  }

  async function removeImage(productId: string) {
    if (!confirm("להסיר את תמונת המוצר?")) return;
    setImageUploadBusy(true);
    setImageUploadError(null);
    try {
      const tok = await getAuthToken();
      const res = await fetch("/api/catalog/upload-image", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImageUploadError(data.error ?? "שגיאה בהסרת התמונה");
        return;
      }
      // Reflect the cleared state by reloading the page so the catalog context refetches.
      window.location.reload();
    } catch {
      setImageUploadError("שגיאת רשת — נסה שוב");
    } finally {
      setImageUploadBusy(false);
    }
  }

  function updateEditForm(field: keyof CatalogFormState, value: string) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="min-h-screen bg-surface">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 pt-6 pb-5">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">ניהול קטלוג</h1>
            <CatalogIcon />
          </div>
          <div className="flex items-center gap-3 flex-wrap mt-3">
            <span className="px-3 py-1 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">סה״כ {stats.total} פריטים</span>
            <span className="px-3 py-1 rounded-full bg-green-50 border border-green-200 text-sm font-medium text-green-700 shadow-sm">{stats.active} פעילים</span>
            {stats.categories > 0 && (
              <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-sm font-medium text-blue-700 shadow-sm">{stats.categories} קטגוריות</span>
            )}
          </div>
        </div>
      </div>

      <div className="py-6 px-4">
        <div className="max-w-6xl mx-auto">

          {/* ── Add item + filter bar ────────────────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-5">
            <AddItemForm onAdd={handleAdd} onCreateAndLink={handleCreateAndLink} categories={categories} allItems={allItemRefs} />

            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 flex-wrap">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש לפי שם, קטגוריה, תיאור..."
                className="flex-1 min-w-36 px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  ["all", `כל המוצרים (${statusCounts.all})`],
                  ["active", `פעילים (${statusCounts.active})`],
                  ["needs_review", `ממתינים לבדיקה (${statusCounts.needs_review})`],
                  ["inactive", `לא פעילים (${statusCounts.inactive})`],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilterActive(value)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
                      filterActive === value
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[180px]"
              >
                <option value="all">כל הקטגוריות</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as CatalogItemType | "all")}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="all">כל הסוגים</option>
                {(Object.entries(TYPE_LABELS) as [CatalogItemType, string][]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <select
                value={filterImage}
                onChange={(e) => setFilterImage(e.target.value as typeof filterImage)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                title="סינון לפי תמונת מוצר"
              >
                <option value="all">כל המוצרים</option>
                <option value="real">עם תמונה אמיתית</option>
                <option value="missing">ללא תמונה אמיתית</option>
                <option value="needs_review">תמונה לבדיקה</option>
              </select>
              <select
                value={filterPrice}
                onChange={(e) => setFilterPrice(e.target.value as typeof filterPrice)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                title="סינון לפי מחיר"
              >
                <option value="all">כל המחירים</option>
                <option value="with_price">עם מחיר</option>
                <option value="without_price">ללא מחיר</option>
              </select>
              <button
                type="button"
                onClick={() => setFilterMissingCost(v => !v)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
                  filterMissingCost
                    ? "border-orange-400 bg-orange-50 text-orange-700"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {filterMissingCost ? `✕ חסרי עלות (${filtered.length})` : `חסרי עלות${missingCostCount > 0 ? ` (${missingCostCount})` : ""}`}
              </button>

              {/* View toggle */}
              <div className="mr-auto flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === "cards" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  כרטיסים
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === "table" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  טבלה
                </button>
              </div>
            </div>
          </div>

          {/* ── Empty state ──────────────────────────────────────────────────── */}
          {filtered.length === 0 && (
            <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
              <div className="text-gray-300 mb-3">
                <svg className="w-12 h-12 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
              </div>
              <p className="text-gray-500 font-medium">{items.length === 0 ? "הקטלוג ריק" : "לא נמצאו פריטים תואמים"}</p>
              <p className="text-sm text-gray-400 mt-1">{items.length === 0 ? "הוסף פריטים כדי שיופיעו כאן ובטפסי ההזמנה" : "נסה לשנות את הסינון"}</p>
            </div>
          )}

          {/* ── Cards view ───────────────────────────────────────────────────── */}
          {filtered.length > 0 && viewMode === "cards" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={startEdit}
                  onToggle={toggleActive}
                  onDelete={deleteItem}
                />
              ))}
            </div>
          )}

          {/* Card-view edit drawer — opens in place when editingId is set */}
          {viewMode === "cards" && editingId && (() => {
            const editingItem = items.find(i => i.id === editingId);
            if (!editingItem) return null;
            const meta = editingItem.metadata as Record<string, unknown> | undefined;
            const images = meta?.images as Record<string, unknown> | undefined;
            const thumb = (images?.thumb as string | undefined) ?? (images?.full as string | undefined);
            const imageStatus = images?.image_status as string | undefined;
            const sources = meta?.sources as Array<{ type: string; note?: string; url?: string }> | undefined;
            const isSupplier = sources?.[0]?.type === "external_supplier_reference";
            return (
              <div
                className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
                role="dialog"
                aria-modal="true"
                aria-label={`עריכת ${editingItem.name}`}
              >
                <div
                  className="absolute inset-0 bg-black/40"
                  onClick={cancelEdit}
                  aria-hidden="true"
                />
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
                    <h2 className="text-lg font-semibold text-gray-900">עריכת מוצר</h2>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center text-xl leading-none"
                      aria-label="סגור"
                    >×</button>
                  </div>

                  <div className="px-5 py-4 space-y-4">
                    {/* Image section: preview + upload + clear + status */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-800">תמונת מוצר</h3>
                        <button
                          type="button"
                          onClick={() => { toggleActive(editingItem.id); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${editingItem.isActive ? "bg-white border-gray-300 text-gray-700 hover:bg-gray-50" : "bg-green-600 border-green-700 text-white hover:bg-green-700"}`}
                        >
                          {editingItem.isActive ? "השבת מוצר" : "✓ הפעל מוצר"}
                        </button>
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="shrink-0">
                          {pendingImagePreviewUrl ? (
                            <div className="relative">
                              <img src={pendingImagePreviewUrl} alt="תצוגה מקדימה"
                                className="w-28 h-28 object-cover rounded-lg border-2 border-blue-400 bg-white shadow-sm" />
                              <span className="absolute -top-2 -right-2 text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded">חדש</span>
                            </div>
                          ) : thumb ? (
                            <img src={thumb} alt={editingItem.name}
                              className="w-28 h-28 object-cover rounded-lg border border-gray-200 bg-white" />
                          ) : (
                            <div className="w-28 h-28 rounded-lg border-2 border-dashed border-gray-300 bg-white flex flex-col items-center justify-center text-gray-300 gap-1">
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                              <span className="text-[10px]">אין תמונה</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${editingItem.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                              {editingItem.isActive ? "● פעיל" : "○ לא פעיל"}
                            </span>
                            {isSupplier && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                מקור ספק חיצוני
                              </span>
                            )}
                            {imageStatus && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                {imageStatus}
                              </span>
                            )}
                          </div>
                          {sources?.[0]?.url && (
                            <div className="text-xs">
                              <span className="text-gray-500">מקור: </span>
                              <a href={sources[0].url} target="_blank" rel="noopener noreferrer"
                                className="text-blue-600 underline truncate max-w-xs inline-block align-middle">
                                {sources[0].note ?? sources[0].url}
                              </a>
                            </div>
                          )}
                          {/* Upload controls */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <label className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer inline-flex items-center gap-1">
                              📷 {thumb || pendingImagePreviewUrl ? "החלף תמונה" : "העלה תמונת מוצר"}
                              <input
                                type="file"
                                accept="image/jpeg,image/jpg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => pickImageFile(e.target.files?.[0] ?? null)}
                                disabled={imageUploadBusy}
                              />
                            </label>
                            {pendingImagePreviewUrl && (
                              <button
                                type="button"
                                onClick={() => pickImageFile(null)}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-white"
                                disabled={imageUploadBusy}
                              >
                                בטל בחירה
                              </button>
                            )}
                            {thumb && !pendingImagePreviewUrl && (
                              <button
                                type="button"
                                onClick={() => removeImage(editingItem.id)}
                                className="px-3 py-1.5 rounded-lg border border-red-300 bg-white text-xs text-red-600 hover:bg-red-50"
                                disabled={imageUploadBusy}
                              >
                                הסר תמונה
                              </button>
                            )}
                          </div>
                          {imageUploadError && (
                            <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                              {imageUploadError}
                            </p>
                          )}
                          {pendingImagePreviewUrl && (
                            <p className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1">
                              תצוגה מקדימה בלבד. התמונה תישמר רק בלחיצה על "שמור".
                            </p>
                          )}
                          <p className="text-[10px] text-gray-400">
                            פורמטים: jpg, png, webp · מקסימום 10MB · התמונה תישמר ב-Supabase Storage ותהיה זמינה מיידית בקטלוג.
                          </p>
                        </div>
                      </div>
                    </div>

                    {isSupplier && !editingItem.isActive && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        מוצר זה יובא ממקור ספק חיצוני והוא אינו פעיל עד לאישור ידני. הפעלה תהפוך אותו לזמין כפריט פעיל בקטלוג.
                      </div>
                    )}

                    {/* Reuse the same FormFields used in table view */}
                    <FormFields
                      form={editForm}
                      update={updateEditForm}
                      categories={categories}
                      linkedProducts={editLinked}
                      onLinkedProductsChange={setEditLinked}
                      onCreateLinked={handleCreateAndLink}
                      allItems={allItemRefs}
                      itemId={editingItem.id}
                      compact
                    />

                    <div className="pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-600 mb-2">הגדרות מלאי</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">כמות מינימום (לרכש)</label>
                          <input type="number" min="0" step="0.01" value={editMinQty}
                            onChange={e => setEditMinQty(e.target.value)} placeholder="0"
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">ספק מועדף</label>
                          <select value={editSupplierId} onChange={e => setEditSupplierId(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                            <option value="">— ללא ספק —</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                          <div>נוכחי: <strong>{editingItem.currentQuantity}</strong></div>
                          <div>שמור: <strong className="text-amber-600">{editingItem.reservedQuantity}</strong></div>
                          <div>זמין: <strong>{editingItem.currentQuantity - editingItem.reservedQuantity}</strong></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 sticky bottom-0 bg-white rounded-b-2xl">
                    {imageUploadBusy && <span className="text-xs text-blue-600 mr-auto">מעלה תמונה...</span>}
                    <button type="button" onClick={cancelEdit}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                      disabled={imageUploadBusy}>
                      ביטול
                    </button>
                    <button type="button" onClick={() => saveEdit(editingItem.id)}
                      disabled={imageUploadBusy}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                      שמור
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Table view ───────────────────────────────────────────────────── */}
          {filtered.length > 0 && viewMode === "table" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">שם פריט</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-24">סוג</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-28">קטגוריה</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-20">יחידה</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-24">מידה</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-24">מחיר</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">תיאור</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center w-20">סטטוס</th>
                      <th className="w-24 px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => {
                      const isEditing  = editingId  === item.id;
                      const isExpanded = expandedId === item.id && !isEditing;
                      return (
                        <Fragment key={item.id}>
                          {isEditing ? (
                            <tr className="border-b border-gray-100 bg-blue-50/30">
                              <td colSpan={9} className="px-4 py-3">
                                <FormFields
                                  form={editForm}
                                  update={updateEditForm}
                                  categories={categories}
                                  linkedProducts={editLinked}
                                  onLinkedProductsChange={setEditLinked}
                                  onCreateLinked={handleCreateAndLink}
                                  allItems={allItemRefs}
                                  itemId={item.id}
                                  compact
                                />
                                {/* Stock config */}
                                <div className="mt-3 pt-3 border-t border-blue-100">
                                  <p className="text-xs font-semibold text-gray-600 mb-2">הגדרות מלאי</p>
                                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <div>
                                      <label className="block text-xs text-gray-500 mb-1">כמות מינימום (לרכש)</label>
                                      <input type="number" min="0" step="0.01" value={editMinQty}
                                        onChange={e => setEditMinQty(e.target.value)}
                                        placeholder="0"
                                        className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-500 mb-1">ספק מועדף</label>
                                      <select value={editSupplierId} onChange={e => setEditSupplierId(e.target.value)}
                                        className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                                        <option value="">— ללא ספק —</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                      </select>
                                    </div>
                                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 self-end">
                                      <div>נוכחי: <strong>{item.currentQuantity}</strong></div>
                                      <div>שמור: <strong className="text-amber-600">{item.reservedQuantity}</strong></div>
                                      <div>זמין: <strong>{item.currentQuantity - item.reservedQuantity}</strong></div>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center justify-end gap-2 mt-3">
                                  <button type="button" onClick={() => saveEdit(item.id)} className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors">שמור</button>
                                  <button type="button" onClick={cancelEdit} className="px-3 py-1 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 transition-colors">ביטול</button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr
                              className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${!item.isActive ? "opacity-50" : ""} ${isExpanded ? "bg-blue-50/20" : ""}`}
                              onClick={() => setExpandedId(prev => prev === item.id ? null : item.id)}
                            >
                              <td className="px-4 py-3 font-medium text-gray-900">
                                <span className="flex items-center gap-1.5 flex-wrap">
                                  {item.name}
                                  {(item.linkedProducts?.length ?? 0) > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                      {item.linkedProducts!.length} נלווים
                                    </span>
                                  )}
                                  {getSourceLabel(item.metadata) && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-normal">
                                      {getSourceLabel(item.metadata)}
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[item.type]}`}>{TYPE_LABELS[item.type]}</span>
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-xs">{item.category || "—"}</td>
                              <td className="px-4 py-3 text-gray-600 text-xs">{item.unitOfMeasure}</td>
                              <td className="px-4 py-3 text-gray-600 text-xs" dir="ltr">
                                {item.dimensionValue && item.dimensionUnit ? `${item.dimensionValue} ${item.dimensionUnit}` : item.dimensionValue || "—"}
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-xs" dir="ltr">
                                {item.defaultPrice !== null ? `₪${item.defaultPrice.toLocaleString()}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{item.description || "—"}</td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleActive(item.id); }}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${item.isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                                >
                                  {item.isActive ? "פעיל" : "לא פעיל"}
                                </button>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); startEdit(item.id); }}
                                    className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="ערוך"
                                  >
                                    <PencilIcon />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                                    className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                    title="מחק"
                                  >
                                    <TrashIcon />
                                  </button>
                                  <ChevronDownIcon open={isExpanded} />
                                </div>
                              </td>
                            </tr>
                          )}
                          {isExpanded && (
                            <CatalogItemDetailPanel
                              item={item}
                              onEdit={startEdit}
                              onToggle={toggleActive}
                            />
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400 text-right">
                מוצגים {filtered.length} מתוך {items.length} פריטים
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
