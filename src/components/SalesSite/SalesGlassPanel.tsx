"use client";

import type { ReactNode } from "react";

export function SalesGlassPanel({
  children,
  className = "",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)] ${
        glow ? "ring-1 ring-ek-blue/30" : ""
      } ${className}`}
    >
      {glow && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ek-blue/10 via-transparent to-ek-gold/10" />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
