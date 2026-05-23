"use client";

import { SAMPLE_PRODUCT } from "../shared/sampleProduct";

/**
 * V08 — Minimal Premium Glass.
 * Lots of negative space, single accent, no orbital rings, no scanlines, no animations.
 * Breaks: blinking dot (none); accent bar on every card (none); container soup → 2 cards max.
 */
const ACCENT = "#a5b4fc"; // soft indigo — not cyan, not magenta

export function V08MinimalGlass() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#1e1b3a 0%,#0c0a1f 100%)", color: "#f5f3ff", fontFamily: "ui-sans-serif, system-ui" }}>
      {/* one soft glow */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 30% 80%, rgba(165,180,252,0.14), transparent 70%)" }} />

      {/* category tag */}
      <p dir="rtl" style={{ position: "absolute", top: 22, right: 28, margin: 0, fontSize: 10, color: "rgba(245,243,255,0.5)", letterSpacing: "0.3em" }}>
        {SAMPLE_PRODUCT.category}
      </p>

      {/* product floats, larger than UI */}
      <div style={{ position: "absolute", top: 60, left: 0, right: 360, bottom: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 180, filter: "drop-shadow(0 24px 36px rgba(0,0,0,0.6))" }}>{SAMPLE_PRODUCT.emoji}</div>
      </div>

      {/* single glass card — right */}
      <div dir="rtl" style={{
        position: "absolute",
        top: 90, right: 36, width: 300,
        padding: 22,
        borderRadius: 18,
        border: "1px solid rgba(245,243,255,0.10)",
        background: "rgba(245,243,255,0.03)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "0 12px 60px rgba(0,0,0,0.45)",
      }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
          {SAMPLE_PRODUCT.title}
        </h2>
        <p style={{ margin: "12px 0 0", fontSize: 12, lineHeight: 1.7, color: "rgba(245,243,255,0.65)" }}>
          {SAMPLE_PRODUCT.description.slice(0, 110)}…
        </p>

        <div style={{ height: 1, background: "rgba(245,243,255,0.08)", margin: "20px 0" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SAMPLE_PRODUCT.specs.slice(0, 3).map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "rgba(245,243,255,0.45)" }}>{s.label}</span>
              <span style={{ fontWeight: 500 }}>{s.value}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 9, letterSpacing: "0.2em", color: "rgba(245,243,255,0.4)" }}>במלאי</span>
          <span style={{ fontSize: 28, fontWeight: 300, color: ACCENT, fontVariantNumeric: "tabular-nums" }}>
            {SAMPLE_PRODUCT.metrics[0].value}
          </span>
        </div>
      </div>

      {/* understated bottom strip — just dots */}
      <div style={{ position: "absolute", bottom: 24, left: 0, right: 360, display: "flex", justifyContent: "center", gap: 10 }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} style={{
            width: i === 4 ? 24 : 5, height: 5, borderRadius: 4,
            background: i === 4 ? ACCENT : "rgba(245,243,255,0.18)",
          }} />
        ))}
      </div>
    </div>
  );
}
