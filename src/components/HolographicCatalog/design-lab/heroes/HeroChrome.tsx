"use client";

import Link from "next/link";

/**
 * Tiny corner badge present on every hero — lets the user jump back to the lab.
 * Floats over the page; absolutely positioned in the top-left.
 */
export function HeroChrome({ label }: { label: string }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        left: 12,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 11px",
        borderRadius: 999,
        background: "rgba(2,6,23,0.78)",
        border: "1px solid rgba(148,163,184,0.30)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        fontFamily: "ui-sans-serif, system-ui",
      }}
    >
      <Link
        href="/holographic-catalog/design-lab"
        style={{
          fontSize: 11,
          color: "#94a3b8",
          textDecoration: "none",
          letterSpacing: "0.06em",
        }}
      >
        ← Design Lab
      </Link>
      <span style={{ width: 1, height: 12, background: "rgba(148,163,184,0.30)" }} />
      <span style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 600 }}>{label}</span>
    </div>
  );
}
