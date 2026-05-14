"use client";

import { createContext, useContext } from "react";
import { useCatalog } from "@/hooks/useCatalog";
import type { CatalogItem, CatalogFormState, LinkedProductEntry } from "@/types/catalog";

interface CatalogContextValue {
  items: CatalogItem[];
  addItem: (form: CatalogFormState, linkedProducts?: LinkedProductEntry[]) => CatalogItem;
  updateItem: (id: string, partial: Partial<CatalogFormState>, linkedProducts?: LinkedProductEntry[]) => void;
  toggleActive: (id: string) => void;
  deleteItem: (id: string) => void;
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
