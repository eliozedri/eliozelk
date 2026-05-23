"use client";

import { SAMPLE_PRODUCT, SAMPLE_STRIP } from "../shared/sampleProduct";

/**
 * V03 — Premium Product Showcase.
 * Apple-keynote style. Huge centered product, near-empty chrome, single spec strip, indexed dots.
 * Breaks: blinking dot (none), three-col grid (none), container soup (single card).
 */
export function V03PremiumShowcase() {
  const accent = "#e2e8f0";
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#000 0%,#0a0a0a 60%,#1a1a1a 100%)", color: "#fafafa" }}>
      {/* subtle vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,255,255,0.04), transparent 65%)" }} />

      {/* tiny top label */}
      <div style={{ position: "absolute", top: 18, left: 0, right: 0, textAlign: "center" }}>
        <p dir="rtl" style={{ margin: 0, fontSize: 10, letterSpacing: "0.4em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
          ELKAYAM · {SAMPLE_PRODUCT.category}
        </p>
      </div>

      {/* hero product */}
      <div style={{ position: "absolute", top: 56, left: 0, right: 0, height: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 200, lineHeight: 1, filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.7))" }}>{SAMPLE_PRODUCT.emoji}</div>
      </div>

      {/* hero title */}
      <div style={{ position: "absolute", top: 296, left: 0, right: 0, textAlign: "center" }} dir="rtl">
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: "#fff" }}>
          {SAMPLE_PRODUCT.title}
        </h1>
        <p style={{ margin: "8px auto 0", maxWidth: 460, fontSize: 12, lineHeight: 1.55, color: "rgba(255,255,255,0.55)" }}>
          ייצור מודולרי, עמיד UV, מתאים לחניונים ומתקנים תעשייתיים. תקן ישראלי.
        </p>
      </div>

      {/* single spec strip */}
      <div style={{ position: "absolute", bottom: 56, left: 56, right: 56, display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }} dir="rtl">
        {SAMPLE_PRODUCT.specs.map((s) => (
          <div key={s.label} style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>{s.label}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* index dots */}
      <div style={{ position: "absolute", bottom: 18, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
        {SAMPLE_STRIP.map((_, i) => (
          <span key={i} style={{
            width: i === 4 ? 22 : 6, height: 6, borderRadius: 3,
            background: i === 4 ? accent : "rgba(255,255,255,0.25)",
            transition: "all 0.2s",
          }} />
        ))}
      </div>
    </div>
  );
}
