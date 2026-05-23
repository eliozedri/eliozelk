"use client";

import { SAMPLE_PRODUCT, SAMPLE_STRIP } from "../shared/sampleProduct";

/**
 * V01 — Gemini Reference (baseline).
 * Distilled current /holographic-catalog: cyan, 2 left panels + center stage + right panel + 3D-disc carousel.
 */
export function V01GeminiReference() {
  const accent = "#06b6d4";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse 55% 45% at 50% 38%, rgba(6,182,212,0.22) 0%, rgba(6,182,212,0.06) 45%, transparent 70%), linear-gradient(175deg,#040c1a 0%,#051220 45%,#030b18 100%)",
      }}
    >
      {/* grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(6,182,212,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(6,182,212,0.05) 1px,transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%,black 30%,transparent 80%)",
        }}
      />

      {/* 3-col main */}
      <div style={{ position: "absolute", inset: "8px 12px 100px", display: "grid", gridTemplateColumns: "180px 1fr 200px", gap: 10 }}>
        {/* LEFT panels */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
          <GlassCard accent={accent} tilt="rotateY(6deg)">
            <p style={{ fontSize: 11, fontWeight: 700, color: "#fff", margin: 0 }}>{SAMPLE_PRODUCT.title}</p>
            <p style={{ fontSize: 9, fontFamily: "monospace", color: `${accent}aa`, margin: "6px 0 8px", letterSpacing: "0.14em" }}>
              תיאור תפעולי
            </p>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, margin: 0 }}>
              {SAMPLE_PRODUCT.description.slice(0, 90)}…
            </p>
          </GlassCard>
          <GlassCard accent={accent} tilt="rotateY(6deg)">
            <p style={{ fontSize: 9, fontFamily: "monospace", color: `${accent}aa`, margin: 0, letterSpacing: "0.14em" }}>
              מפרט טכני
            </p>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {SAMPLE_PRODUCT.specs.slice(0, 3).map((s) => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.7)" }}>
                  <span style={{ opacity: 0.55 }}>{s.label}</span>
                  <span style={{ fontWeight: 600 }}>{s.value}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* CENTER stage */}
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 24 }}>
          {/* orbit rings */}
          <div style={{ position: "absolute", inset: "10% 18% 30%", border: `1px solid ${accent}40`, borderRadius: "50%", transform: "rotateX(70deg)" }} />
          <div style={{ position: "absolute", inset: "20% 26% 38%", border: "1px solid rgba(168,85,247,0.30)", borderRadius: "50%", transform: "rotateX(70deg)" }} />
          {/* product */}
          <div style={{
            fontSize: 110,
            filter: `drop-shadow(0 0 30px ${accent}cc) drop-shadow(0 12px 24px rgba(0,0,0,0.7))`,
            transform: "rotateX(15deg) rotateY(-10deg)",
          }}>{SAMPLE_PRODUCT.emoji}</div>
          {/* platform */}
          <div style={{ position: "absolute", bottom: 6, left: "20%", right: "20%", height: 24, borderRadius: "50%", border: `2px solid ${accent}cc`, boxShadow: `0 0 18px ${accent}66`, background: `radial-gradient(ellipse, ${accent}33, transparent 75%)` }} />
        </div>

        {/* RIGHT panel */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <GlassCard accent={accent} tilt="rotateY(-7deg)">
            <p style={{ fontSize: 12, fontWeight: 700, color: "#fff", margin: 0 }}>{SAMPLE_PRODUCT.title}</p>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", margin: "2px 0 8px" }}>{SAMPLE_PRODUCT.category}</p>
            <span style={{ fontSize: 9, padding: "3px 9px", borderRadius: 999, border: `1.2px solid ${accent}88`, color: accent, background: `${accent}18`, fontWeight: 700 }}>
              {SAMPLE_PRODUCT.tags[0]}
            </span>
            <div style={{ height: 1, background: "rgba(6,182,212,0.18)", margin: "10px 0" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {SAMPLE_PRODUCT.metrics.map((m) => (
                <div key={m.label} style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${accent}22`, background: `${accent}08`, textAlign: "left" }}>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>{m.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{m.value}</div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* carousel ellipse */}
      <div style={{ position: "absolute", bottom: 8, left: 24, right: 24, height: 84 }}>
        <div style={{ position: "absolute", inset: 0, perspective: "180px", perspectiveOrigin: "50% 100%" }}>
          <div style={{ position: "absolute", inset: 0, transform: "rotateX(78deg)", borderRadius: "50%", border: `2px solid ${accent}88`, boxShadow: `0 0 36px ${accent}33` }} />
        </div>
        <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 5, paddingTop: 6 }}>
          {SAMPLE_STRIP.map((p, i) => {
            const o = Math.abs(i - 4);
            const isActive = o === 0;
            return (
              <div key={p.id} style={{
                width: isActive ? 60 : o === 1 ? 42 : 34,
                height: isActive ? 56 : o === 1 ? 38 : 30,
                borderRadius: 6,
                background: "rgba(4,12,32,0.7)",
                border: isActive ? "1.5px solid rgba(168,85,247,0.85)" : `1px solid ${accent}30`,
                boxShadow: isActive ? "0 0 16px 4px rgba(168,85,247,0.4)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: isActive ? 22 : o === 1 ? 16 : 13,
                opacity: 1 - o * 0.16,
              }}>{p.emoji}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GlassCard({ children, accent, tilt }: { children: React.ReactNode; accent: string; tilt: string }) {
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${accent}40`,
      background: "linear-gradient(145deg, rgba(5,18,52,0.82), rgba(3,10,28,0.90))",
      boxShadow: `0 6px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`,
      transform: `perspective(700px) ${tilt}`,
    }}>{children}</div>
  );
}
