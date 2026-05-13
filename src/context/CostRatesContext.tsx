"use client";

import { createContext, useContext } from "react";
import { useCostRates } from "@/hooks/useCostRates";
import type { CostRates } from "@/types/costRates";

interface CostRatesContextValue {
  rates: CostRates;
  updateRates: (partial: Partial<Omit<CostRates, "updatedAt">>) => void;
  resetRates: () => void;
}

const CostRatesContext = createContext<CostRatesContextValue | null>(null);

export function CostRatesProvider({ children }: { children: React.ReactNode }) {
  const value = useCostRates();
  return <CostRatesContext.Provider value={value}>{children}</CostRatesContext.Provider>;
}

export function useCostRatesContext(): CostRatesContextValue {
  const ctx = useContext(CostRatesContext);
  if (!ctx) throw new Error("useCostRatesContext must be used inside CostRatesProvider");
  return ctx;
}
