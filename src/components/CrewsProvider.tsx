// src/components/CrewsProvider.tsx
"use client";

import { CrewsProvider as Provider } from "@/context/CrewsContext";

export function CrewsProvider({ children }: { children: React.ReactNode }) {
  return <Provider>{children}</Provider>;
}
