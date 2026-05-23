"use client";

import { SAMPLE_PRODUCT } from "../shared/sampleProduct";

/**
 * V05 — Neon Industrial.
 * Heavy black, warm amber neon, brutalist oversized numerals, monospace everywhere.
 * Breaks: teal everywhere → amber; three-col grid → asymmetric.
 */
const NEON = "#fbbf24";

export function V05NeonIndustrial() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#08070a", color: "#f4f4f5", fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace" }}>
      {/* metal noise */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.4,
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 5px)",
      }} />

      {/* corner code */}
      <div style={{ position: "absolute", top: 10, left: 12, fontSize: 9, color: NEON, letterSpacing: "0.2em" }}>
        EK//{SAMPLE_PRODUCT.code}
      </div>
      <div style={{ position: "absolute", top: 10, right: 12, fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.2em" }}>
        REV.04 · NEON-INDUSTRIAL
      </div>

      {/* brutalist hero numeral — overlaps everything */}
      <div style={{ position: "absolute", top: 24, left: 0, right: 0, textAlign: "center", lineHeight: 0.9 }}>
        <span style={{
          fontSize: 260,
          fontWeight: 900,
          color: "transparent",
          WebkitTextStroke: `2px ${NEON}`,
          fontFamily: "system-ui",
          letterSpacing: "-0.05em",
          opacity: 0.55,
        }}>158</span>
      </div>

      {/* product slab — left positioned */}
      <div style={{ position: "absolute", top: 86, left: 36, width: 280, height: 220, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", border: `1px solid ${NEON}`, boxShadow: `0 0 32px ${NEON}55, inset 0 0 24px rgba(251,191,36,0.10)` }}>
        <div style={{ fontSize: 140, filter: `drop-shadow(0 0 24px ${NEON}aa)` }}>{SAMPLE_PRODUCT.emoji}</div>
      </div>

      {/* right info column */}
      <div style={{ position: "absolute", top: 86, left: 332, right: 24, color: "#fff" }} dir="rtl">
        <p style={{ margin: 0, fontSize: 11, color: NEON, letterSpacing: "0.22em" }}>PRODUCT_ID</p>
        <h2 style={{ margin: "4px 0 12px", fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {SAMPLE_PRODUCT.title}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, border: `1px solid ${NEON}55` }}>
          {SAMPLE_PRODUCT.specs.map((s, i) => (
            <div key={s.label} style={{
              padding: "8px 10px",
              borderRight: i % 2 === 0 ? `1px solid ${NEON}30` : "none",
              borderBottom: i < 2 ? `1px solid ${NEON}30` : "none",
            }}>
              <div style={{ fontSize: 8, color: NEON, letterSpacing: "0.16em" }}>{s.label.toUpperCase()}</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* bottom huge metrics row */}
      <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0, border: `1px solid ${NEON}` }}>
        {SAMPLE_PRODUCT.metrics.map((m, i) => (
          <div key={i} style={{ padding: "8px 12px", borderRight: i < 3 ? `1px solid ${NEON}50` : "none", textAlign: "left" }}>
            <div style={{ fontSize: 9, color: NEON, letterSpacing: "0.22em" }} dir="rtl">{m.label.toUpperCase()}</div>
            <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, marginTop: 2, color: "#fff", letterSpacing: "-0.04em" }}>
              {String(m.value).padStart(3, "0")}
            </div>
          </div>
        ))}
      </div>

      {/* warning stripe */}
      <div style={{ position: "absolute", bottom: 96, left: 0, right: 0, height: 8, background: `repeating-linear-gradient(45deg, ${NEON} 0 10px, #000 10px 20px)`, opacity: 0.6 }} />
    </div>
  );
}
