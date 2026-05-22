"use client";

import { Box, ScanLine, LayoutGrid, MousePointer2, Settings2, PieChart, Settings, LogOut } from "lucide-react";

const TOOLS = [
  { icon: Box,            color: "#06b6d4" },
  { icon: ScanLine,       color: "#06b6d4" },
  { icon: LayoutGrid,     color: "#06b6d4" },
  { icon: MousePointer2,  color: "#a855f7" },
  { icon: Settings2,      color: "#06b6d4" },
  { icon: PieChart,       color: "#a855f7" },
  { icon: Settings,       color: "#475569" },
  { icon: LogOut,         color: "#475569" },
];

export function VerticalToolbar() {
  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 30,
        width: 54,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        padding: "14px 0",
        background: "linear-gradient(180deg, rgba(3,9,24,0.92) 0%, rgba(4,14,40,0.85) 100%)",
        borderLeft: "1px solid rgba(6,182,212,0.18)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.35)",
      }}
    >
      {TOOLS.map(({ icon: Icon, color }, i) => (
        <button
          key={i}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${color}16`,
            border: `1px solid ${color}40`,
            boxShadow: `0 0 10px ${color}1e, inset 0 1px 0 rgba(255,255,255,0.06)`,
            cursor: "pointer",
            flexShrink: 0,
            transition: "all 0.18s ease",
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.boxShadow = `0 0 20px ${color}55, inset 0 1px 0 rgba(255,255,255,0.08)`;
            btn.style.background = `${color}28`;
            btn.style.borderColor = `${color}70`;
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.boxShadow = `0 0 10px ${color}1e, inset 0 1px 0 rgba(255,255,255,0.06)`;
            btn.style.background = `${color}16`;
            btn.style.borderColor = `${color}40`;
          }}
        >
          <Icon size={15} color={color} />
        </button>
      ))}
    </div>
  );
}
