"use client";

import { SAMPLE_PRODUCT } from "../shared/sampleProduct";

/**
 * V09 — Editorial Catalog.
 * Magazine spread. Big serif title, long descriptive paragraph, product as photograph.
 * Breaks: teal everywhere → warm cream + clay; blinking dot (none); accent bar (none); three-col grid (asymmetric); container soup → minimal.
 */
const CREAM = "#f4ede0";
const CLAY  = "#9a3f2a";
const INK   = "#1c1815";

export function V09Editorial() {
  return (
    <div style={{ position: "absolute", inset: 0, background: CREAM, color: INK, fontFamily: "'Georgia','Iowan Old Style',serif" }}>
      {/* paper grain */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.4,
        backgroundImage:
          "radial-gradient(circle at 30% 20%,rgba(154,63,42,0.05) 0,transparent 60%),radial-gradient(circle at 80% 70%,rgba(28,24,21,0.06) 0,transparent 50%)",
      }} />

      {/* eyebrow */}
      <p dir="rtl" style={{ position: "absolute", top: 22, right: 28, margin: 0, fontSize: 10, color: CLAY, letterSpacing: "0.35em", fontFamily: "ui-sans-serif, system-ui", textTransform: "uppercase" }}>
        מס׳ 14 · {SAMPLE_PRODUCT.category}
      </p>

      {/* page number left */}
      <p style={{ position: "absolute", top: 22, left: 28, margin: 0, fontSize: 10, color: CLAY, letterSpacing: "0.18em", fontFamily: "ui-sans-serif, system-ui" }}>
        EK · 2026 / SPRING
      </p>

      {/* big serif title — wraps */}
      <div dir="rtl" style={{ position: "absolute", top: 60, right: 28, left: 340 }}>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1.05, color: INK }}>
          {SAMPLE_PRODUCT.title}.
        </h1>
        <div style={{ width: 56, height: 2, background: CLAY, margin: "16px 0" }} />
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.85, color: "rgba(28,24,21,0.78)", maxWidth: 320 }}>
          {SAMPLE_PRODUCT.description}
        </p>
        <div style={{ marginTop: 18, fontSize: 10, fontFamily: "ui-sans-serif, system-ui", color: CLAY, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          קרא עוד —
        </div>
      </div>

      {/* product as polaroid photograph — left */}
      <div style={{ position: "absolute", top: 56, left: 28, width: 280, height: 320, padding: 14, background: "#fff", boxShadow: "0 18px 36px rgba(28,24,21,0.18), 0 2px 6px rgba(28,24,21,0.08)", transform: "rotate(-3deg)" }}>
        <div style={{ width: "100%", height: 248, background: "#1f2632", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 130 }}>{SAMPLE_PRODUCT.emoji}</div>
        </div>
        <p dir="rtl" style={{ margin: "10px 0 0", textAlign: "center", fontSize: 11, color: "#52473d", fontStyle: "italic" }}>
          {SAMPLE_PRODUCT.code} · אביב 2026
        </p>
      </div>

      {/* bottom byline / metadata */}
      <div dir="rtl" style={{ position: "absolute", bottom: 16, right: 28, left: 28, display: "flex", justifyContent: "space-between", borderTop: `1px solid ${CLAY}55`, paddingTop: 8, fontSize: 10, color: "rgba(28,24,21,0.55)", fontFamily: "ui-sans-serif, system-ui", letterSpacing: "0.06em" }}>
        <span>חומר · {SAMPLE_PRODUCT.specs[0].value}</span>
        <span>ממדים · {SAMPLE_PRODUCT.specs[1].value}</span>
        <span>עומס · {SAMPLE_PRODUCT.specs[2].value}</span>
        <span>במלאי · {SAMPLE_PRODUCT.metrics[0].value}</span>
        <span style={{ color: CLAY, fontWeight: 700 }}>elkayam.co.il</span>
      </div>
    </div>
  );
}
