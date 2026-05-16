"use client";

import { createContext, useContext } from "react";
import type { AgentsHookValue } from "@/hooks/useAgents";

const AgentContext = createContext<AgentsHookValue | null>(null);

export { AgentContext };

export function useAgentContext(): AgentsHookValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgentContext must be used inside AgentProvider");
  return ctx;
}
