"use client";

import { useCallback, useEffect, useState } from "react";
import type { CostRates } from "@/types/costRates";
import { DEFAULT_COST_RATES } from "@/types/costRates";
import { getSupabase } from "@/lib/supabase/client";

const STORAGE_KEY = "elkayam_cost_rates";

function loadLocal(): CostRates {
  if (typeof window === "undefined") return DEFAULT_COST_RATES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COST_RATES;
    return { ...DEFAULT_COST_RATES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_COST_RATES;
  }
}

function saveLocal(rates: CostRates) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rates)); } catch { /* ignore */ }
}

export function useCostRates() {
  const [rates, setRates] = useState<CostRates>(DEFAULT_COST_RATES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const db = getSupabase();
    if (db) {
      db.from("cost_rates").select("data").eq("id", 1).single()
        .then(({ data, error }) => {
          if (!error && data?.data && Object.keys(data.data as object).length > 0) {
            const loaded = { ...DEFAULT_COST_RATES, ...(data.data as Partial<CostRates>) };
            setRates(loaded);
            saveLocal(loaded);
          } else {
            setRates(loadLocal());
          }
          setHydrated(true);
        });
    } else {
      setRates(loadLocal());
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveLocal(rates);
  }, [rates, hydrated]);

  const updateRates = useCallback((partial: Partial<Omit<CostRates, "updatedAt">>) => {
    const now = new Date().toISOString();
    setRates((prev) => {
      const updated = { ...prev, ...partial, updatedAt: now };
      const db = getSupabase();
      if (db) db.from("cost_rates").update({ data: updated, updated_at: now }).eq("id", 1).then(() => {});
      return updated;
    });
  }, []);

  const resetRates = useCallback(() => {
    const now = new Date().toISOString();
    const reset = { ...DEFAULT_COST_RATES, updatedAt: now };
    setRates(reset);
    const db = getSupabase();
    if (db) db.from("cost_rates").update({ data: reset, updated_at: now }).eq("id", 1).then(() => {});
  }, []);

  return { rates, updateRates, resetRates, hydrated };
}
