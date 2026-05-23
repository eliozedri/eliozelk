"use client";

import { CatalogProvider as Provider } from "@/context/CatalogContext";

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  return <Provider>{children}</Provider>;
}
