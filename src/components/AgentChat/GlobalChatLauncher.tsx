"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useGlobalChat } from "@/context/GlobalFloatingChatContext";
import { canPerformAction } from "@/types/auth";
import type { ActionPermission } from "@/types/auth";

// ── Colors (match system palette) ────────────────────────────────────────────

const NAVY_MID = "#1a2d4a";
const EK_BLUE  = "#1d6fd8";

// ── Channel definitions ───────────────────────────────────────────────────────

interface ChatChannel {
  id: string;
  labelHe: string;
  tooltipHe: string;
  agentId: string | null;
  agentName: string;
  agentIcon: string;
  requiredPermission: ActionPermission | null; // null = any authenticated user
  ButtonIcon: () => React.ReactElement;
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <path d="M12 11V7"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M8 15h.01M12 15h.01M16 15h.01"/>
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  );
}

const CHAT_CHANNELS: ChatChannel[] = [
  {
    id: "command-center",
    labelHe: "מרכז הפיקוד",
    tooltipHe: "פתח צ׳אט עם מרכז הפיקוד",
    agentId: null,
    agentName: "מרכז הפיקוד",
    agentIcon: "🤖",
    requiredPermission: null,
    ButtonIcon: BotIcon,
  },
  {
    id: "ops-manager",
    labelHe: "מנהל התפעול",
    tooltipHe: "פנה למנהל התפעול",
    agentId: "ceo",
    agentName: "מנהל התפעול",
    agentIcon: "🎯",
    requiredPermission: "chat_ops_manager",
    ButtonIcon: TargetIcon,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isChannelActive(
  channel: ChatChannel,
  isOpen: boolean,
  activeAgentId: string | null | undefined,
): boolean {
  if (!isOpen) return false;
  return channel.agentId === (activeAgentId ?? null);
}

// ── Single circular button ────────────────────────────────────────────────────

function LauncherButton({
  channel,
  active,
  onClick,
}: {
  channel: ChatChannel;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { ButtonIcon } = channel;

  return (
    <div className="relative flex items-center" dir="ltr">
      {/* Tooltip — appears to the right of the button (visually right since buttons are on left edge) */}
      {hovered && (
        <div
          className="absolute left-14 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white pointer-events-none z-10"
          style={{
            backgroundColor: NAVY_MID,
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {channel.tooltipHe}
        </div>
      )}

      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-label={channel.tooltipHe}
        className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          backgroundColor: active ? EK_BLUE : NAVY_MID,
          color: active ? "white" : "rgba(255,255,255,0.65)",
          border: active
            ? `2px solid ${EK_BLUE}`
            : "1px solid rgba(255,255,255,0.15)",
          boxShadow: active
            ? `0 0 0 4px ${EK_BLUE}30, 0 8px 24px rgba(0,0,0,0.45)`
            : hovered
            ? `0 0 0 2px ${EK_BLUE}40, 0 8px 24px rgba(0,0,0,0.4)`
            : "0 4px 16px rgba(0,0,0,0.35)",
          outlineColor: EK_BLUE,
          transform: hovered && !active ? "scale(1.06)" : "scale(1)",
        }}
      >
        <ButtonIcon />
      </button>
    </div>
  );
}

// ── GlobalChatLauncher ────────────────────────────────────────────────────────

export function GlobalChatLauncher() {
  const { profile } = useAuth();
  const { isOpen, config, openChat, closeChat } = useGlobalChat();

  if (!profile) return null;

  // Filter channels to those the current user is permitted to see
  const visibleChannels = CHAT_CHANNELS.filter(ch =>
    ch.requiredPermission === null || canPerformAction(profile, ch.requiredPermission)
  );

  if (visibleChannels.length === 0) return null;

  function handleChannelClick(channel: ChatChannel) {
    const active = isChannelActive(channel, isOpen, config?.agentId);
    if (active) {
      closeChat();
    } else {
      openChat({
        agentId: channel.agentId,
        agentName: channel.agentName,
        agentIcon: channel.agentIcon,
      });
    }
  }

  return (
    <div
      className="fixed z-40 flex flex-col-reverse gap-3 no-print"
      style={{ bottom: 24, left: 24 }}
      aria-label="הפעל שיחה עם סוכן"
      role="group"
    >
      {visibleChannels.map(channel => (
        <LauncherButton
          key={channel.id}
          channel={channel}
          active={isChannelActive(channel, isOpen, config?.agentId)}
          onClick={() => handleChannelClick(channel)}
        />
      ))}
    </div>
  );
}
