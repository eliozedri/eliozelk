"use client";

import { useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { useCrewsContext } from "@/context/CrewsContext";
import { useCostRatesContext } from "@/context/CostRatesContext";
import { computeOperationalKPIs, type OperationalKPIs } from "@/lib/operationalKPIs";

export function useOperationalKPIs(weekCount = 12): OperationalKPIs {
  const { orders } = useOrdersContext();
  const { diaries } = useWorkDiaryContext();
  const { crews } = useCrewsContext();
  const { rates } = useCostRatesContext();

  return useMemo(
    () => computeOperationalKPIs(diaries, orders, crews, rates, weekCount),
    [diaries, orders, crews, rates, weekCount]
  );
}
