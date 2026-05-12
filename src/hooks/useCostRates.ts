"use client";

import { useCallback, useEffect, useState } from "react";
import type { CostRates } from "@/types/costRates";
import { DEFAULT_COST_RATES } from "@/types/costRates";

const STORAGE_KEY = "elkayam_cost_rates";

function loadRates(): CostRates {
  if (typeof window === "undefined") return DEFAULT_COST_RATES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COST_RATES;
    return { ...DEFAULT_COST_RATES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_COST_RATES;
  }
}

export function useCostRates() {
  const [rates, setRates] = useState<CostRates>(DEFAULT_COST_RATES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setRates(loadRates());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  }, [rates, hydrated]);

  const updateRates = useCallback((partial: Partial<Omit<CostRates, "updatedAt">>) => {
    setRates((prev) => ({ ...prev, ...partial, updatedAt: new Date().toISOString() }));
  }, []);

  const resetRates = useCallback(() => {
    setRates({ ...DEFAULT_COST_RATES, updatedAt: new Date().toISOString() });
  }, []);

  return { rates, updateRates, resetRates, hydrated };
}
