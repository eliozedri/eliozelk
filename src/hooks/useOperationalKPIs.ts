"use client";

import { useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { useCrewsContext } from "@/context/CrewsContext";
import { useCostRatesContext } from "@/context/CostRatesContext";
import { computeOperationalKPIs, type OperationalKPIs } from "@/lib/operationalKPIs";
import { computeDiagnostics, type DiagnosticFinding } from "@/lib/diagnostics";

export type { DiagnosticFinding };

export interface OperationalIntelligence extends OperationalKPIs {
  diagnostics: DiagnosticFinding[];
}

export function useOperationalKPIs(weekCount = 12): OperationalIntelligence {
  const { orders } = useOrdersContext();
  const { diaries } = useWorkDiaryContext();
  const { crews } = useCrewsContext();
  const { rates } = useCostRatesContext();

  return useMemo(() => {
    const kpis = computeOperationalKPIs(diaries, orders, crews, rates, weekCount);
    const diagnostics = computeDiagnostics(kpis, orders, diaries, rates);
    return { ...kpis, diagnostics };
  }, [diaries, orders, crews, rates, weekCount]);
}
