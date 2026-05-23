"use client";

import { SAMPLE_PRODUCT } from "../shared/sampleProduct";

/**
 * V10 — Terminal-Core Catalog.
 * ASCII frames, monospace everywhere, phosphor green + amber, blinking cursor, command-palette feel.
 * Breaks: teal everywhere → phosphor green; generic Lucide → ASCII glyphs.
 */
const PHOS = "#7fff85";
const AMB  = "#ffb74d";
const DIM  = "#3d4a3d";

export function V10TerminalCore() {
  const lines = [
    `┌─ ELKAYAM/CATALOG ─────────────────────────────────────────┐`,
    `│ $ catalog show --id=${SAMPLE_PRODUCT.id.padEnd(34)}│`,
    `│                                                          │`,
    `│ NAME      ${SAMPLE_PRODUCT.title.padEnd(46)}│`,
    `│ CODE      ${SAMPLE_PRODUCT.code.padEnd(46)}│`,
    `│ CATEGORY  ${SAMPLE_PRODUCT.category.padEnd(46)}│`,
    `│ STATUS    ● ACTIVE${" ".repeat(38)}│`,
    `│                                                          │`,
    `│ ── SPEC ─────────────────────────────────────────────────│`,
  ];
  return (
    <div style={{ position: "absolute", inset: 0, background: "#020703", color: PHOS, fontFamily: "JetBrains Mono, Menlo, monospace", padding: 14, fontSize: 11, lineHeight: 1.42 }}>
      {/* phosphor flicker overlay */}
      <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg,rgba(127,255,133,0.04) 0 1px, transparent 1px 3px)", pointerEvents: "none" }} />

      {/* top status line */}
      <div style={{ display: "flex", justifyContent: "space-between", color: DIM, marginBottom: 6 }}>
        <span>tty/cat-01 · 80×24</span>
        <span style={{ color: AMB }}>14:08:22 · UTC+3</span>
      </div>

      {/* ascii box */}
      <pre dir="ltr" style={{ margin: 0, color: PHOS, whiteSpace: "pre" }}>
{lines.join("\n")}
      </pre>

      {/* spec inside box */}
      <div style={{ position: "relative", marginInline: 8, marginTop: -2 }}>
        {SAMPLE_PRODUCT.specs.map((s) => (
          <div key={s.label} style={{ display: "flex", color: PHOS }} dir="ltr">
            <span style={{ color: DIM }}>│ </span>
            <span style={{ width: 100, color: AMB }}>{s.label}</span>
            <span>{s.value}</span>
          </div>
        ))}
        <div style={{ color: DIM }} dir="ltr">│ ── METRICS ──────────────────────────────────────────────│</div>
        {SAMPLE_PRODUCT.metrics.map((m) => (
          <div key={m.label} style={{ display: "flex", color: PHOS }} dir="ltr">
            <span style={{ color: DIM }}>│ </span>
            <span style={{ width: 100, color: AMB }}>{m.label}</span>
            <span style={{ fontWeight: 700 }}>{String(m.value).padStart(4, "0")}</span>
          </div>
        ))}
        <div style={{ color: DIM }} dir="ltr">└──────────────────────────────────────────────────────────┘</div>
      </div>

      {/* ascii product art */}
      <div style={{ position: "absolute", right: 18, top: 36, color: PHOS, fontSize: 10, lineHeight: 1.0, opacity: 0.85 }}>
        <pre style={{ margin: 0 }}>{String.raw`
   ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱
  ╱  EK-SB-70-RBR ╱╱
 ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱
▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
█████████████████
        `}</pre>
      </div>

      {/* prompt with blinking cursor */}
      <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, display: "flex", alignItems: "center", gap: 6, color: AMB }} dir="ltr">
        <span style={{ color: PHOS }}>elkayam@catalog ~ $</span>
        <span>catalog next</span>
        <span className="holo-status-ring" style={{ width: 9, height: 9, background: PHOS, animation: "none", borderRadius: 0 }} />
      </div>

      {/* item list — right column */}
      <div style={{ position: "absolute", right: 18, bottom: 38, color: DIM, fontSize: 10 }} dir="ltr">
        <div style={{ color: AMB }}>NEXT ↓</div>
        <div>cones</div>
        <div>cat-eyes</div>
        <div>barrier</div>
        <div>arrow-board</div>
      </div>
    </div>
  );
}
