"use client";

import { SAMPLE_PRODUCT } from "../shared/sampleProduct";

/**
 * V06 — Blueprint / CAD Scanner.
 * White-on-blueprint-blue, technical drawing, dimension lines, north-arrow, sheet markers.
 * Breaks: teal everywhere → blueprint blue; generic Lucide icons → CAD glyphs (drawn).
 */
const BG    = "#0e3a6b";
const PAPER = "#e6efff";
const LINE  = "rgba(230,239,255,0.8)";

export function V06BlueprintCad() {
  return (
    <div style={{ position: "absolute", inset: 0, background: BG, color: PAPER, fontFamily: "ui-monospace, Consolas, monospace" }}>
      {/* blueprint grid */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.85,
        backgroundImage:
          "linear-gradient(rgba(230,239,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(230,239,255,0.06) 1px,transparent 1px), linear-gradient(rgba(230,239,255,0.14) 1px,transparent 1px),linear-gradient(90deg,rgba(230,239,255,0.14) 1px,transparent 1px)",
        backgroundSize: "12px 12px,12px 12px,72px 72px,72px 72px",
      }} />

      {/* title block (engineering drawing style) */}
      <div style={{ position: "absolute", top: 8, right: 8, width: 200, border: `1px solid ${LINE}`, padding: 6, fontSize: 9, lineHeight: 1.3, background: "rgba(8,42,82,0.4)" }} dir="rtl">
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${LINE}`, paddingBottom: 3 }}>
          <span>ELKAYAM ENG.</span>
          <span>DWG № 158</span>
        </div>
        <div style={{ marginTop: 3 }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>{SAMPLE_PRODUCT.title}</div>
          <div style={{ opacity: 0.7 }}>{SAMPLE_PRODUCT.category}</div>
        </div>
        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 3, display: "flex", justifyContent: "space-between" }}>
          <span>SCALE 1:5</span><span>UNIT mm</span><span>SHEET 01/12</span>
        </div>
      </div>

      {/* north arrow */}
      <div style={{ position: "absolute", top: 10, left: 14, fontSize: 9, textAlign: "center" }}>
        <div style={{ width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: `18px solid ${PAPER}`, margin: "0 auto" }} />
        <div style={{ marginTop: 2, fontWeight: 700 }}>N</div>
      </div>

      {/* product front view */}
      <div style={{ position: "absolute", top: 64, left: 36, width: 360, height: 240, border: `1px solid ${LINE}`, padding: 6, background: "rgba(8,42,82,0.3)" }}>
        <div style={{ fontSize: 9, opacity: 0.7, marginBottom: 4 }}>FRONT ELEVATION · {SAMPLE_PRODUCT.code}</div>
        <div style={{ position: "relative", width: "100%", height: "calc(100% - 18px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* dimension lines */}
          <div style={{ position: "absolute", top: 20, left: 14, right: 14, borderTop: `1px solid ${LINE}` }}>
            <div style={{ position: "absolute", left: -1, top: -4, width: 1, height: 8, background: LINE }} />
            <div style={{ position: "absolute", right: -1, top: -4, width: 1, height: 8, background: LINE }} />
            <span style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontSize: 9, background: BG, padding: "0 4px" }}>500</span>
          </div>
          <div style={{ position: "absolute", bottom: 14, top: 14, left: 20, borderLeft: `1px solid ${LINE}` }}>
            <div style={{ position: "absolute", top: -1, left: -4, height: 1, width: 8, background: LINE }} />
            <div style={{ position: "absolute", bottom: -1, left: -4, height: 1, width: 8, background: LINE }} />
            <span style={{ position: "absolute", top: "50%", left: -18, transform: "translateY(-50%) rotate(-90deg)", fontSize: 9, background: BG, padding: "0 4px" }}>350</span>
          </div>
          <div style={{ fontSize: 110, filter: "saturate(0) brightness(1.6)", opacity: 0.9 }}>{SAMPLE_PRODUCT.emoji}</div>
        </div>
      </div>

      {/* spec table */}
      <div style={{ position: "absolute", top: 64, right: 220, left: 408, border: `1px solid ${LINE}`, fontSize: 10, background: "rgba(8,42,82,0.3)" }} dir="rtl">
        <div style={{ background: "rgba(230,239,255,0.10)", padding: "4px 6px", borderBottom: `1px solid ${LINE}` }}>BOM · BILL OF SPEC</div>
        {SAMPLE_PRODUCT.specs.map((s, i) => (
          <div key={s.label} style={{ display: "flex", padding: "3px 6px", borderBottom: i < SAMPLE_PRODUCT.specs.length - 1 ? `1px solid ${LINE}55` : "none" }}>
            <span style={{ width: 14, opacity: 0.6 }}>{i + 1}</span>
            <span style={{ flex: 1, opacity: 0.85 }}>{s.label}</span>
            <span style={{ fontWeight: 700 }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* side legend / metrics */}
      <div style={{ position: "absolute", top: 220, right: 220, left: 408, border: `1px solid ${LINE}`, padding: 6, fontSize: 10, background: "rgba(8,42,82,0.3)" }} dir="rtl">
        <div style={{ marginBottom: 4 }}>STOCK SUMMARY</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {SAMPLE_PRODUCT.metrics.map((m) => (
            <div key={m.label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ opacity: 0.7 }}>{m.label}</span>
              <span style={{ fontWeight: 700 }}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* sheet bottom — section views thumbnails */}
      <div style={{ position: "absolute", bottom: 8, left: 36, right: 220, height: 64, border: `1px solid ${LINE}`, padding: 4, display: "flex", gap: 4 }}>
        {["FRT","TOP","SIDE","ISO","DET-A","DET-B","SEC 1-1"].map((label, i) => (
          <div key={i} style={{ flex: 1, border: `1px solid ${LINE}55`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 9 }}>
            <div style={{ fontSize: 16, opacity: 0.6 }}>▢</div>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
