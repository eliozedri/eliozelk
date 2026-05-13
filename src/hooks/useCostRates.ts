"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const ref = useRef<CostRates>(DEFAULT_COST_RATES);

  useEffect(() => { ref.current = rates; }, [rates]);

  useEffect(() => {
    const db = getSupabase();
    if (db) {
      db.from("cost_rates").select("data").eq("id", 1).single()
        .then(({ data, error }) => {
          if (!error && data?.data && Object.keys(data.data as object).length > 0) {
            const loaded = { ...DEFAULT_COST_RATES, ...(data.data as Partial<CostRates>) };
            setRates(loaded);
            saveLocal(loaded); // warm cache — written once
          } else {
            // Supabase error or empty — use local cache read-only
            setRates(loadLocal());
          }
        });
    } else {
      setRates(loadLocal());
    }
  }, []);

  const updateRates = useCallback((partial: Partial<Omit<CostRates, "updatedAt">>) => {
    const now = new Date().toISOString();
    const updated = { ...ref.current, ...partial, updatedAt: now };
    setRates(updated);
    const db = getSupabase();
    if (db) db.from("cost_rates").update({ data: updated, updated_at: now }).eq("id", 1).then(({ error }) => {
      if (error) console.error("[cost_rates] update failed:", error.message);
    });
  }, []);

  const resetRates = useCallback(() => {
    const now = new Date().toISOString();
    const reset = { ...DEFAULT_COST_RATES, updatedAt: now };
    setRates(reset);
    const db = getSupabase();
    if (db) db.from("cost_rates").update({ data: reset, updated_at: now }).eq("id", 1).then(({ error }) => {
      if (error) console.error("[cost_rates] reset failed:", error.message);
    });
  }, []);

  return { rates, updateRates, resetRates };
}
