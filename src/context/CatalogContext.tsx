"use client";

import { createContext, useContext } from "react";
import { useCatalog } from "@/hooks/useCatalog";
import type { CatalogItem, CatalogFormState, LinkedProductEntry } from "@/types/catalog";

interface CatalogContextValue {
  items: CatalogItem[];
  addItem: (form: CatalogFormState, linkedProducts?: LinkedProductEntry[]) => CatalogItem;
  updateItem: (id: string, partial: Partial<CatalogFormState>, linkedProducts?: LinkedProductEntry[]) => void;
  toggleActive: (id: string) => void;
  setActiveBulk: (ids: string[], active: boolean) => Promise<{ ok: boolean; error?: string }>;
  deleteItem: (id: string) => void;
  adjustStock: (
    itemId: string,
    delta: number,
    movementType: "receive" | "consume" | "adjustment" | "correction" | "return",
    notes: string,
    createdBy: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  updateStockConfig: (itemId: string, minimumQuantity: number, supplierId?: string | null) => void;
  updateCostPrice: (itemId: string, costPrice: number | null) => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const value = useCatalog();
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalogContext(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalogContext must be used inside CatalogProvider");
  return ctx;
}
