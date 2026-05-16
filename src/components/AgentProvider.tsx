"use client";

import { useAgents } from "@/hooks/useAgents";
import { AgentContext } from "@/context/AgentContext";

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const value = useAgents();
  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}
