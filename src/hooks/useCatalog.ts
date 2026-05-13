"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { CatalogItem, CatalogFormState } from "@/types/catalog";
import { getSupabase } from "@/lib/supabase/client";

const STORAGE_KEY = "elkayam_catalog";

function fromRow(r: Record<string, unknown>): CatalogItem {
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as CatalogItem["type"],
    category: r.category as string,
    unitOfMeasure: r.unit_of_measure as string,
    dimensionValue: r.dimension_value as string | undefined,
    dimensionUnit: r.dimension_unit as string | undefined,
    defaultPrice: r.default_price != null ? Number(r.default_price) : null,
    description: r.description as string,
    isActive: r.is_active as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toRow(item: CatalogItem) {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    category: item.category,
    unit_of_measure: item.unitOfMeasure,
    dimension_value: item.dimensionValue ?? null,
    dimension_unit: item.dimensionUnit ?? null,
    default_price: item.defaultPrice,
    description: item.description,
    is_active: item.isActive,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function loadLocal(): CatalogItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal(items: CatalogItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const db = getSupabase();
    if (db) {
      db.from("catalog_items").select("*").order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data && data.length > 0) {
            const mapped = data.map(fromRow);
            setItems(mapped);
            saveLocal(mapped);
          } else {
            const local = loadLocal();
            setItems(local);
            if (local.length > 0) {
              db.from("catalog_items").upsert(local.map(toRow), { onConflict: "id" }).then(() => {});
            }
          }
          setHydrated(true);
        });
    } else {
      setItems(loadLocal());
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveLocal(items);
  }, [items, hydrated]);

  const addItem = useCallback((form: CatalogFormState): CatalogItem => {
    const now = new Date().toISOString();
    const newItem: CatalogItem = {
      id: nanoid(),
      name: form.name.trim(),
      type: form.type,
      category: form.category.trim(),
      unitOfMeasure: form.unitOfMeasure,
      dimensionValue: form.dimensionValue || undefined,
      dimensionUnit: form.dimensionUnit || undefined,
      defaultPrice: form.defaultPrice ? parseFloat(form.defaultPrice) : null,
      description: form.description.trim(),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    setItems((prev) => [newItem, ...prev]);
    const db = getSupabase();
    if (db) db.from("catalog_items").insert(toRow(newItem)).then(() => {});
    return newItem;
  }, []);

  const updateItem = useCallback((id: string, partial: Partial<CatalogFormState>) => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated: CatalogItem = {
          ...item,
          ...(partial.name !== undefined && { name: partial.name.trim() }),
          ...(partial.type !== undefined && { type: partial.type }),
          ...(partial.category !== undefined && { category: partial.category.trim() }),
          ...(partial.unitOfMeasure !== undefined && { unitOfMeasure: partial.unitOfMeasure }),
          ...(partial.dimensionValue !== undefined && { dimensionValue: partial.dimensionValue || undefined }),
          ...(partial.dimensionUnit !== undefined && { dimensionUnit: partial.dimensionUnit || undefined }),
          ...(partial.defaultPrice !== undefined && {
            defaultPrice: partial.defaultPrice ? parseFloat(partial.defaultPrice) : null,
          }),
          ...(partial.description !== undefined && { description: partial.description.trim() }),
          updatedAt: now,
        };
        const db = getSupabase();
        if (db) db.from("catalog_items").update(toRow(updated)).eq("id", id).then(() => {});
        return updated;
      })
    );
  }, []);

  const toggleActive = useCallback((id: string) => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, isActive: !item.isActive, updatedAt: now };
        const db = getSupabase();
        if (db) db.from("catalog_items").update({ is_active: updated.isActive, updated_at: now }).eq("id", id).then(() => {});
        return updated;
      })
    );
  }, []);

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    const db = getSupabase();
    if (db) db.from("catalog_items").delete().eq("id", id).then(() => {});
  }, []);

  return { items, addItem, updateItem, toggleActive, deleteItem };
}
