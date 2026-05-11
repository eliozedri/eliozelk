"use client";

import { useState, useMemo } from "react";
import { useCatalogContext } from "@/context/CatalogContext";
import type { CatalogFormState, CatalogItemType } from "@/types/catalog";
import { TYPE_LABELS, TYPE_COLORS, UNIT_OPTIONS } from "@/types/catalog";

const inputCls =
  "w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 transition-all";

const emptyForm: CatalogFormState = {
  name: "",
  type: "product",
  category: "",
  unitOfMeasure: "יחידה",
  defaultPrice: "",
  description: "",
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
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

interface AddItemFormProps {
  onAdd: (form: CatalogFormState) => void;
}

function AddItemForm({ onAdd }: AddItemFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<CatalogFormState>(emptyForm);
  const [nameError, setNameError] = useState("");

  function update(field: keyof CatalogFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "name" && nameError) setNameError("");
  }

  function handleSave() {
    if (!form.name.trim()) {
      setNameError("שם פריט הוא שדה חובה");
      return;
    }
    onAdd(form);
    setForm(emptyForm);
    setNameError("");
    setIsOpen(false);
  }

  function handleCancel() {
    setForm(emptyForm);
    setNameError("");
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <div className="flex justify-end px-5 py-3 border-b border-gray-100">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-blue-400 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors"
        >
          + הוסף פריט
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 px-5 py-4 bg-blue-50/20">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            שם פריט <span className="text-red-500">*</span>
          </label>
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
          <select
            value={form.type}
            onChange={(e) => update("type", e.target.value)}
            className={inputCls}
          >
            {(Object.entries(TYPE_LABELS) as [CatalogItemType, string][]).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">קטגוריה</label>
          <input
            type="text"
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
            placeholder="לדוגמה: עמודים, כוח אדם"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">יחידת מידה</label>
          <select
            value={form.unitOfMeasure}
            onChange={(e) => update("unitOfMeasure", e.target.value)}
            className={inputCls}
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">מחיר ברירת מחדל (₪)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.defaultPrice}
            onChange={(e) => update("defaultPrice", e.target.value)}
            placeholder="0.00"
            className={inputCls}
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">תיאור / מפרט</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="מידות, מפרט טכני..."
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          שמור פריט
        </button>
      </div>
    </div>
  );
}

export function CatalogPage() {
  const { items, addItem, updateItem, toggleActive, deleteItem } = useCatalogContext();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<CatalogItemType | "all">("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CatalogFormState>(emptyForm);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q)) return false;
      if (filterType !== "all" && item.type !== filterType) return false;
      if (filterActive === "active" && !item.isActive) return false;
      if (filterActive === "inactive" && item.isActive) return false;
      return true;
    });
  }, [items, search, filterType, filterActive]);

  const stats = useMemo(() => {
    const activeCount = items.filter((i) => i.isActive).length;
    const categories = new Set(items.map((i) => i.category).filter(Boolean)).size;
    return { total: items.length, active: activeCount, categories };
  }, [items]);

  function startEdit(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setEditForm({
      name: item.name,
      type: item.type,
      category: item.category,
      unitOfMeasure: item.unitOfMeasure,
      defaultPrice: item.defaultPrice !== null ? String(item.defaultPrice) : "",
      description: item.description,
    });
    setEditingId(id);
  }

  function saveEdit(id: string) {
    updateItem(id, editForm);
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function updateEditForm(field: keyof CatalogFormState, value: string) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">מוצרים ושירותים</h1>
          <CatalogIcon />
        </div>
        <p className="text-sm text-gray-500 mb-5">ניהול קטלוג מוצרים, שירותים ופריטים להזמנות</p>

        {/* KPI chips */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <span className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
            סה״כ {stats.total} פריטים
          </span>
          <span className="px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-sm font-medium text-green-700 shadow-sm">
            {stats.active} פעילים
          </span>
          {stats.categories > 0 && (
            <span className="px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-sm font-medium text-blue-700 shadow-sm">
              {stats.categories} קטגוריות
            </span>
          )}
        </div>

        {/* Main card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Add form */}
          <AddItemForm onAdd={addItem} />

          {/* Filter bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם או קטגוריה..."
              className="flex-1 min-w-40 px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as CatalogItemType | "all")}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="all">כל הסוגים</option>
              {(Object.entries(TYPE_LABELS) as [CatalogItemType, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as "all" | "active" | "inactive")}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="all">פעיל / לא פעיל</option>
              <option value="active">פעילים בלבד</option>
              <option value="inactive">לא פעילים</option>
            </select>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-gray-300 mb-3">
                <svg className="w-12 h-12 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">
                {items.length === 0 ? "הקטלוג ריק" : "לא נמצאו פריטים תואמים"}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {items.length === 0 ? "הוסף פריטים כדי שיופיעו כאן ובטפסי ההזמנה" : "נסה לשנות את הסינון"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">שם פריט</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-24">סוג</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-28">קטגוריה</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-20">יחידה</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right w-24">מחיר</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">תיאור</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center w-20">סטטוס</th>
                    <th className="w-24 px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) =>
                    editingId === item.id ? (
                      <tr key={item.id} className="border-b border-gray-100 bg-blue-50/30">
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => updateEditForm("name", e.target.value)}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={editForm.type}
                            onChange={(e) => updateEditForm("type", e.target.value)}
                            className={inputCls}
                          >
                            {(Object.entries(TYPE_LABELS) as [CatalogItemType, string][]).map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editForm.category}
                            onChange={(e) => updateEditForm("category", e.target.value)}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={editForm.unitOfMeasure}
                            onChange={(e) => updateEditForm("unitOfMeasure", e.target.value)}
                            className={inputCls}
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editForm.defaultPrice}
                            onChange={(e) => updateEditForm("defaultPrice", e.target.value)}
                            className={inputCls}
                            dir="ltr"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editForm.description}
                            onChange={(e) => updateEditForm("description", e.target.value)}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-3 py-2 text-center" colSpan={2}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(item.id)}
                              className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                            >
                              שמור
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="px-3 py-1 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              ביטול
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${!item.isActive ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[item.type]}`}>
                            {TYPE_LABELS[item.type]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{item.category || "—"}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{item.unitOfMeasure}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs" dir="ltr">
                          {item.defaultPrice !== null ? `₪${item.defaultPrice.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{item.description || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleActive(item.id)}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                              item.isActive
                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                          >
                            {item.isActive ? "פעיל" : "לא פעיל"}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => startEdit(item.id)}
                              className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="ערוך"
                            >
                              <PencilIcon />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteItem(item.id)}
                              className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="מחק"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400 text-right">
              מוצגים {filtered.length} מתוך {items.length} פריטים
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
