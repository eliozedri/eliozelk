"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { CatalogItem, CatalogFormState } from "@/types/catalog";

const STORAGE_KEY = "elkayam_catalog";

function loadCatalog(): CatalogItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(loadCatalog());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const addItem = useCallback((form: CatalogFormState): CatalogItem => {
    const now = new Date().toISOString();
    const newItem: CatalogItem = {
      id: nanoid(),
      name: form.name.trim(),
      type: form.type,
      category: form.category.trim(),
      unitOfMeasure: form.unitOfMeasure,
      defaultPrice: form.defaultPrice ? parseFloat(form.defaultPrice) : null,
      description: form.description.trim(),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    setItems((prev) => [newItem, ...prev]);
    return newItem;
  }, []);

  const updateItem = useCallback((id: string, partial: Partial<CatalogFormState>) => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          ...(partial.name !== undefined && { name: partial.name.trim() }),
          ...(partial.type !== undefined && { type: partial.type }),
          ...(partial.category !== undefined && { category: partial.category.trim() }),
          ...(partial.unitOfMeasure !== undefined && { unitOfMeasure: partial.unitOfMeasure }),
          ...(partial.defaultPrice !== undefined && {
            defaultPrice: partial.defaultPrice ? parseFloat(partial.defaultPrice) : null,
          }),
          ...(partial.description !== undefined && { description: partial.description.trim() }),
          updatedAt: now,
        };
      })
    );
  }, []);

  const toggleActive = useCallback((id: string) => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isActive: !item.isActive, updatedAt: now } : item
      )
    );
  }, []);

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return { items, addItem, updateItem, toggleActive, deleteItem };
}
