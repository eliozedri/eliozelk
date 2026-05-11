// src/context/CrewsContext.tsx
"use client";

import { createContext, useContext } from "react";
import { useCrews } from "@/hooks/useCrews";
import type { Crew } from "@/types/crew";

interface CrewsContextValue {
  crews: Crew[];
  addCrew: (data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => Crew;
  updateCrew: (id: string, data: Partial<Omit<Crew, "id" | "createdAt">>) => void;
  deleteCrew: (id: string) => void;
}

const CrewsContext = createContext<CrewsContextValue | null>(null);

export function CrewsProvider({ children }: { children: React.ReactNode }) {
  const value = useCrews();
  return <CrewsContext.Provider value={value}>{children}</CrewsContext.Provider>;
}

export function useCrewsContext(): CrewsContextValue {
  const ctx = useContext(CrewsContext);
  if (!ctx) throw new Error("useCrewsContext must be used inside CrewsProvider");
  return ctx;
}
