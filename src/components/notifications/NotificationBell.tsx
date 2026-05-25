"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import { NotificationCenter } from "./NotificationCenter";

// Match the bottom-left chat launcher circles (GlobalChatLauncher).
const NAVY_MID = "#1a2d4a";
const EK_BLUE = "#1d6fd8";

export function NotificationBell() {
  const { unseen } = useNotifications();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hasUnseen = unseen > 0;

  return (
    <>
      {/* Fixed circle stacked ABOVE the chat launcher (which sits at bottom:24,
          left:24 with up to two 48px buttons). bottom:144 clears that stack. */}
      <div className="fixed left-6 z-40 no-print" style={{ bottom: 144 }}>
        <div className="relative flex items-center" dir="ltr">
          {hovered && (
            <div
              className="absolute left-14 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white pointer-events-none z-10"
              style={{
                backgroundColor: NAVY_MID,
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              }}
            >
              מרכז התראות
            </div>
          )}

          <button
            onClick={() => setOpen(true)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            aria-label="מרכז התראות"
            className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: hasUnseen ? EK_BLUE : NAVY_MID,
              color: hasUnseen ? "white" : "rgba(255,255,255,0.65)",
              border: hasUnseen ? `2px solid ${EK_BLUE}` : "1px solid rgba(255,255,255,0.15)",
              boxShadow: hovered
                ? `0 0 0 2px ${EK_BLUE}40, 0 8px 24px rgba(0,0,0,0.4)`
                : "0 4px 16px rgba(0,0,0,0.35)",
              outlineColor: EK_BLUE,
              transform: hovered ? "scale(1.06)" : "scale(1)",
            }}
          >
            <Bell className="w-5 h-5" />
            {hasUnseen && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border border-white/20">
                {unseen > 99 ? "99+" : unseen}
              </span>
            )}
          </button>
        </div>
      </div>

      <NotificationCenter open={open} onClose={() => setOpen(false)} />
    </>
  );
}
