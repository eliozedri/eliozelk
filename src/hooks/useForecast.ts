"use client";

import { useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useCrewsContext } from "@/context/CrewsContext";
import { useOperationalKPIs } from "@/hooks/useOperationalKPIs";
import { useOrderRiskScores } from "@/hooks/useOrderRiskScores";
import { computeForecast, type OperationalForecast } from "@/lib/forecast";

export type { OperationalForecast };

export function useForecast(): OperationalForecast {
  const { orders } = useOrdersContext();
  const { crews } = useCrewsContext();
  const { trendSummary, billingLeakage } = useOperationalKPIs();
  const riskScores = useOrderRiskScores();

  return useMemo(
    () => computeForecast(orders, crews, riskScores, trendSummary, billingLeakage),
    [orders, crews, riskScores, trendSummary, billingLeakage]
  );
}
