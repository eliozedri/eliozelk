"use client";

import { SAMPLE_PRODUCT } from "../shared/sampleProduct";

/**
 * V04 — Tactical Field Equipment.
 * Safety-orange + black + olive. Crosshair targeting, GPS readouts, grid measurements, stencil type.
 * Breaks: teal everywhere → safety-orange + olive; accent bars → corner brackets only.
 */
const ORANGE = "#f97316";
const OLIVE  = "#3f4a2a";

export function V04TacticalField() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#0d0e0a", color: "#e7e1cf", fontFamily: "Menlo, Consolas, monospace" }}>
      {/* tactical grid */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.5,
        backgroundImage:
          "linear-gradient(rgba(231,225,207,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(231,225,207,0.06) 1px,transparent 1px)",
        backgroundSize: "20px 20px",
      }} />

      {/* top status strip */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 22, display: "flex", alignItems: "center", paddingInline: 10, gap: 14, fontSize: 9, background: "#1a1c14", borderBottom: `1px solid ${OLIVE}` }}>
        <span style={{ color: ORANGE, fontWeight: 700, letterSpacing: "0.18em" }}>TAC · FIELD-OPS</span>
        <span>GPS 32.0853°N · 34.7818°E</span>
        <span>HDG 047°</span>
        <span style={{ marginInlineStart: "auto" }}>UNIT 14:08:22Z · SECURE</span>
      </div>

      {/* left meta */}
      <div style={{ position: "absolute", top: 30, left: 8, width: 168 }} dir="rtl">
        <div style={{ padding: 8, border: `1px solid ${OLIVE}`, background: "rgba(63,74,42,0.18)", marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: 9, color: ORANGE, letterSpacing: "0.2em" }}>ASSET CLASS</p>
          <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: "#fff" }}>SPEED CONTROL</p>
        </div>
        <div style={{ padding: 8, border: `1px solid ${OLIVE}`, background: "rgba(63,74,42,0.18)" }}>
          <p style={{ margin: 0, fontSize: 9, color: ORANGE, letterSpacing: "0.2em" }}>SPEC</p>
          {SAMPLE_PRODUCT.specs.slice(0, 3).map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 4 }}>
              <span style={{ opacity: 0.7 }}>{s.label}</span>
              <span style={{ fontWeight: 700, color: "#fff" }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* center targeting frame */}
      <div style={{ position: "absolute", top: 32, left: 184, right: 184, bottom: 80, border: `1px dashed ${ORANGE}77`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* crosshair */}
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: `${ORANGE}55` }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: `${ORANGE}55` }} />
        {/* corner brackets */}
        {[
          { top: 8, left: 8 }, { top: 8, right: 8 },
          { bottom: 8, left: 8 }, { bottom: 8, right: 8 },
        ].map((p, i) => (
          <div key={i} style={{ position: "absolute", width: 18, height: 18, borderStyle: "solid", borderWidth: 0, borderColor: ORANGE,
            ...(p.top !== undefined ? { top: p.top, borderTopWidth: 2 } : { bottom: p.bottom, borderBottomWidth: 2 }),
            ...(p.left !== undefined ? { left: p.left, borderLeftWidth: 2 } : { right: p.right, borderRightWidth: 2 }),
          }} />
        ))}
        {/* target ID label */}
        <span style={{ position: "absolute", top: 8, left: 30, fontSize: 9, color: ORANGE }}>TGT · {SAMPLE_PRODUCT.code}</span>
        {/* product */}
        <div style={{ fontSize: 130, filter: "drop-shadow(0 0 22px rgba(249,115,22,0.4))" }}>{SAMPLE_PRODUCT.emoji}</div>
        {/* range tags */}
        <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 9, color: "#e7e1cf" }}>500×350 MM</span>
        <span style={{ position: "absolute", bottom: 8, left: 10, fontSize: 9, color: "#e7e1cf" }}>70 T MAX</span>
      </div>

      {/* right metrics */}
      <div style={{ position: "absolute", top: 30, right: 8, width: 168 }} dir="rtl">
        {SAMPLE_PRODUCT.metrics.map((m, i) => (
          <div key={i} style={{ padding: "6px 8px", border: `1px solid ${OLIVE}`, background: "rgba(63,74,42,0.18)", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: ORANGE }}>{m.label}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "Menlo, monospace" }}>{m.value}</span>
          </div>
        ))}
        <div style={{ marginTop: 8, fontSize: 9, color: "rgba(231,225,207,0.6)", textAlign: "center", border: `1px solid ${ORANGE}`, padding: "4px 0", letterSpacing: "0.16em" }}>
          ● TARGET ACQUIRED
        </div>
      </div>

      {/* bottom equipment row */}
      <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, height: 56, display: "flex", gap: 4 }}>
        {["🚧","🟧","🟨","🛑","➡️","🔆","🟥","🛞","👁️"].map((e, i) => (
          <div key={i} style={{ flex: 1, border: i === 4 ? `2px solid ${ORANGE}` : `1px solid ${OLIVE}`, background: "rgba(15,18,10,0.7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, position: "relative" }}>
            {e}
            <span style={{ position: "absolute", top: 2, right: 4, fontSize: 7, color: ORANGE }}>{String(i+1).padStart(2,"0")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
