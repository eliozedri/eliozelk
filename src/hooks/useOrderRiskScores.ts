"use client";

import { useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useOperationalKPIs } from "@/hooks/useOperationalKPIs";
import { computeAllRiskScores, type OrderRiskScore } from "@/lib/riskScoring";

export type { OrderRiskScore };

export function useOrderRiskScores(): Map<string, OrderRiskScore> {
  const { orders } = useOrdersContext();
  const { byCustomer } = useOperationalKPIs();

  return useMemo(() => {
    const riskMap = new Map<string, "green" | "amber" | "red">();
    for (const c of byCustomer) {
      riskMap.set(c.customerName.trim().toLowerCase(), c.riskLevel);
    }
    return computeAllRiskScores(orders, riskMap);
  }, [orders, byCustomer]);
}
