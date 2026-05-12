"use client";

import React, { useState, useRef, useEffect } from "react";
import type { MiscRow } from "@/types/order";
import { useCatalogContext } from "@/context/CatalogContext";
import type { CatalogItemType } from "@/types/catalog";

const inputCls =
  "w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 transition-all";

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const CUSTOM_DIMENSION_LABEL = "שלט לפי מידה";

interface Props {
  rows: MiscRow[];
  onAdd: () => void;
  onUpdate: (id: string, partial: Partial<MiscRow>) => void;
  onRemove: (id: string) => void;
  title?: string;
  accentColor?: string;      // tailwind bg class for header
  allowedCatalogTypes?: CatalogItemType[];
  showDimensionRows?: boolean; // allow "שלט לפי מידה" special row
}

export function MiscSection({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  title = "שונות",
  accentColor = "bg-blue-50",
  allowedCatalogTypes,
  showDimensionRows = false,
}: Props) {
  const { items: catalogItems } = useCatalogContext();
  const [openSuggestRowId, setOpenSuggestRowId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenSuggestRowId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleDescriptionChange(rowId: string, value: string) {
    onUpdate(rowId, {
      description: value,
      catalogItemId: undefined,
      catalogItemName: undefined,
      catalogItemUnit: undefined,
      catalogItemCategory: undefined,
      catalogItemType: undefined,
    });
    setOpenSuggestRowId(value.length >= 1 ? rowId : null);
  }

  function handleCatalogSelect(rowId: string, itemId: string) {
    const item = catalogItems.find((c) => c.id === itemId);
    if (!item) return;
    onUpdate(rowId, {
      description: item.name,
      catalogItemId: item.id,
      catalogItemName: item.name,
      catalogItemUnit: item.unitOfMeasure,
      catalogItemCategory: item.category,
      catalogItemType: item.type,
    });
    setOpenSuggestRowId(null);
  }

  function handleUnlink(rowId: string, currentDescription: string) {
    onUpdate(rowId, {
      catalogItemId: undefined,
      catalogItemName: undefined,
      catalogItemUnit: undefined,
      catalogItemCategory: undefined,
      catalogItemType: undefined,
      description: currentDescription,
    });
  }

  function handleFileAttach(rowId: string, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      onUpdate(rowId, {
        attachmentDataUrl: e.target?.result as string,
        attachmentName: file.name,
      });
    };
    reader.readAsDataURL(file);
  }

  function getSuggestions(query: string) {
    if (!query) return [];
    const q = query.toLowerCase();
    return catalogItems
      .filter((item) => {
        if (!item.isActive) return false;
        if (allowedCatalogTypes && !allowedCatalogTypes.includes(item.type)) return false;
        return item.name.toLowerCase().includes(q);
      })
      .slice(0, 6);
  }

  const isCustomDimensionRow = (row: MiscRow) =>
    row.description === CUSTOM_DIMENSION_LABEL || Boolean(row.customWidth || row.customHeight);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 overflow-x-auto">
      <div className={`flex items-center gap-2 px-5 py-3.5 ${accentColor} rounded-t-xl border-b border-gray-200`}>
        <h2 className="text-base font-bold text-gray-800">{title}</h2>
        <svg className="w-5 h-5 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right">תיאור פריט</th>
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right w-24">כמות</th>
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right">הערות</th>
            <th className="w-10 no-print"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const suggestions = openSuggestRowId === row.id ? getSuggestions(row.description) : [];
            const isLinked = Boolean(row.catalogItemId);
            const isDimRow = showDimensionRows && isCustomDimensionRow(row);

            return (
              <React.Fragment key={row.id}>
                <tr className="border-b border-gray-100 hover:bg-blue-50/20 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="relative" ref={openSuggestRowId === row.id ? dropdownRef : undefined}>
                      {isLinked ? (
                        <div className="flex items-center gap-2">
                          <span className="flex-1 px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-sm text-blue-800 font-medium">
                            {row.description}
                          </span>
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium whitespace-nowrap">
                            מהקטלוג
                            <button
                              type="button"
                              onClick={() => handleUnlink(row.id, row.description)}
                              className="hover:text-blue-900 transition-colors"
                            >
                              <XIcon />
                            </button>
                          </span>
                          {row.catalogItemUnit && (
                            <span className="text-xs text-gray-400 whitespace-nowrap">{row.catalogItemUnit}</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => handleDescriptionChange(row.id, e.target.value)}
                            onFocus={() => { if (row.description.length >= 1) setOpenSuggestRowId(row.id); }}
                            placeholder="תיאור פריט"
                            className={inputCls}
                          />
                          {showDimensionRows && (
                            <button
                              type="button"
                              title='הוסף "שלט לפי מידה"'
                              onClick={() => onUpdate(row.id, { description: CUSTOM_DIMENSION_LABEL, customWidth: "", customHeight: "" })}
                              className="shrink-0 px-2 py-1.5 rounded border border-gray-300 text-xs text-gray-500 hover:bg-gray-50 whitespace-nowrap"
                            >
                              לפי מידה
                            </button>
                          )}
                        </div>
                      )}

                      {/* Catalog suggestions dropdown */}
                      {suggestions.length > 0 && (
                        <div className="absolute top-full right-0 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg z-50 overflow-hidden">
                          {suggestions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onMouseDown={() => handleCatalogSelect(row.id, item.id)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-right hover:bg-blue-50 transition-colors"
                            >
                              <div className="flex-1 text-right">
                                <div className="font-medium text-gray-800">{item.name}</div>
                                {item.category && (
                                  <div className="text-xs text-gray-400">{item.category}</div>
                                )}
                              </div>
                              <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{item.unitOfMeasure}</span>
                            </button>
                          ))}
                          <div className="px-3 py-1.5 border-t border-gray-100 text-xs text-gray-400 text-right">
                            {suggestions.length} פריטים
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 w-24">
                    <input
                      type="number"
                      min="0"
                      value={row.quantity}
                      onChange={(e) => onUpdate(row.id, { quantity: e.target.value })}
                      placeholder="0"
                      className={`${inputCls} text-center`}
                      dir="ltr"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) => onUpdate(row.id, { notes: e.target.value })}
                      placeholder="הערות"
                      className={inputCls}
                    />
                  </td>
                  <td className="px-2 py-2.5 w-10 no-print">
                    <button
                      type="button"
                      onClick={() => onRemove(row.id)}
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>

                {/* Custom dimension sub-row */}
                {isDimRow && (
                  <tr className="border-b border-gray-100 bg-amber-50/40">
                    <td colSpan={4} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-medium text-amber-700">מידות:</span>
                        <label className="flex items-center gap-1.5 text-xs text-gray-600">
                          רוחב (ס&quot;מ)
                          <input
                            type="number"
                            min="0"
                            value={row.customWidth ?? ""}
                            onChange={(e) => onUpdate(row.id, { customWidth: e.target.value })}
                            placeholder="0"
                            className="w-20 px-2 py-1 rounded border border-gray-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                            dir="ltr"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-600">
                          גובה (ס&quot;מ)
                          <input
                            type="number"
                            min="0"
                            value={row.customHeight ?? ""}
                            onChange={(e) => onUpdate(row.id, { customHeight: e.target.value })}
                            placeholder="0"
                            className="w-20 px-2 py-1 rounded border border-gray-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                            dir="ltr"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                          קובץ:
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileAttach(row.id, file);
                            }}
                          />
                          <span className="px-2 py-1 rounded border border-dashed border-amber-400 text-amber-700 hover:bg-amber-50 text-xs transition-colors">
                            {row.attachmentName ? row.attachmentName : "העלה קובץ"}
                          </span>
                        </label>
                        {row.attachmentName && (
                          <button
                            type="button"
                            onClick={() => onUpdate(row.id, { attachmentDataUrl: undefined, attachmentName: undefined })}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            הסר
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="flex justify-end px-5 py-3 no-print">
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-blue-400 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors"
        >
          + הוסף שורה
        </button>
      </div>
    </div>
  );
}
