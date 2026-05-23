"use client";

import { OrdersProvider as Provider } from "@/context/OrdersContext";

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  return <Provider>{children}</Provider>;
}
