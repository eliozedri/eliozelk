"use client";

import { createContext, useContext, useState } from "react";
import { FloatingChatWindow } from "@/components/AgentChat/FloatingChatWindow";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatConfig {
  agentId?: string | null;
  agentName?: string;
  agentIcon?: string;
  threadId?: string | null;
}

interface GlobalChatContextValue {
  isOpen: boolean;
  config: ChatConfig | null;
  openChat: (c: ChatConfig) => void;
  closeChat: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const GlobalFloatingChatContext = createContext<GlobalChatContextValue>({
  isOpen: false,
  config: null,
  openChat: () => undefined,
  closeChat: () => undefined,
});

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGlobalChat() {
  return useContext(GlobalFloatingChatContext);
}

// ── Mount — renders the window at app level ───────────────────────────────────

export function GlobalChatMount() {
  const { isOpen, config, closeChat } = useGlobalChat();
  if (!config) return null;
  return (
    <FloatingChatWindow
      key={config.agentId ?? "__master__"}
      isOpen={isOpen}
      onClose={closeChat}
      agentId={config.agentId}
      agentName={config.agentName}
      agentIcon={config.agentIcon}
      threadId={config.threadId}
    />
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function GlobalFloatingChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ChatConfig | null>(null);

  function openChat(c: ChatConfig) {
    setConfig(c);
    setIsOpen(true);
  }

  function closeChat() {
    setIsOpen(false);
  }

  return (
    <GlobalFloatingChatContext.Provider value={{ isOpen, config, openChat, closeChat }}>
      {children}
    </GlobalFloatingChatContext.Provider>
  );
}
