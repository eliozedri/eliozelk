"use client";

import { CustomersProvider as Provider } from "@/context/CustomersContext";

export function CustomersProvider({ children }: { children: React.ReactNode }) {
  return <Provider>{children}</Provider>;
}
