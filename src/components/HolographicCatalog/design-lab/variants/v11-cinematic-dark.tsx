"use client";

import { SAMPLE_PRODUCT } from "../shared/sampleProduct";

/**
 * V11 — Cinematic Dark.
 * Film-grade gradients, anamorphic lens flares, oversized type, letterboxed.
 * Breaks: three-col grid → cinematic full-bleed.
 */
export function V11CinematicDark() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", color: "#fff", overflow: "hidden", fontFamily: "ui-sans-serif, system-ui" }}>
      {/* film gradient backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 60% at 65% 45%, #2b1a3e 0%, #0c0814 50%, #000 90%)" }} />

      {/* anamorphic horizontal flare */}
      <div style={{ position: "absolute", top: "44%", left: "-10%", right: "-10%", height: 4, background: "linear-gradient(to right,transparent,rgba(120,189,255,0.5) 30%,rgba(120,189,255,0.9) 50%,rgba(120,189,255,0.5) 70%,transparent)", filter: "blur(4px)" }} />
      <div style={{ position: "absolute", top: "calc(44% - 1px)", left: "30%", right: "30%", height: 1, background: "rgba(255,255,255,0.85)", filter: "blur(1px)" }} />

      {/* secondary cool flare */}
      <div style={{ position: "absolute", top: "20%", left: "45%", width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle,rgba(167,139,250,0.20),transparent 60%)", filter: "blur(20px)" }} />

      {/* letterbox bars */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 28, background: "#000", zIndex: 5 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, background: "#000", zIndex: 5 }} />

      {/* film label top */}
      <div style={{ position: "absolute", top: 6, left: 14, right: 14, display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.55)", letterSpacing: "0.25em", zIndex: 6 }}>
        <span>ELKAYAM · OP/CINEMA</span>
        <span>REC ● 24FPS · 4K</span>
        <span>TC 01:14:08:22</span>
      </div>

      {/* product centered, off-axis */}
      <div style={{ position: "absolute", top: 70, right: 80, width: 320, height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 200, filter: "drop-shadow(0 30px 50px rgba(0,0,0,0.85)) drop-shadow(0 0 40px rgba(167,139,250,0.5))", transform: "rotateY(-12deg) rotateX(8deg)" }}>
          {SAMPLE_PRODUCT.emoji}
        </div>
      </div>

      {/* huge editorial title — left */}
      <div dir="rtl" style={{ position: "absolute", bottom: 56, right: 28, maxWidth: 420 }}>
        <p style={{ margin: 0, fontSize: 9, letterSpacing: "0.4em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
          A R O A D · S P E C
        </p>
        <h1 style={{ margin: "6px 0 0", fontSize: 42, fontWeight: 200, letterSpacing: "-0.02em", lineHeight: 1, color: "#fff" }}>
          {SAMPLE_PRODUCT.title}
        </h1>
      </div>

      {/* slim spec row — left side */}
      <div dir="rtl" style={{ position: "absolute", bottom: 52, left: 24, width: 200, fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
        {SAMPLE_PRODUCT.specs.slice(0, 3).map((s) => (
          <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ opacity: 0.55 }}>{s.label}</span>
            <span style={{ fontWeight: 600 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
