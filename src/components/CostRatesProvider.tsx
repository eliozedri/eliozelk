"use client";

import { CostRatesProvider as Provider } from "@/context/CostRatesContext";

export function CostRatesProvider({ children }: { children: React.ReactNode }) {
  return <Provider>{children}</Provider>;
}
