"use client";

import { SAMPLE_PRODUCT } from "../shared/sampleProduct";

/**
 * V07 — Traffic Control Room.
 * Real traffic-light palette (red/amber/green), lane dividers as section breaks, signal-light chips.
 * Breaks: teal everywhere → traffic palette; accent bars → signal pucks; generic Lucide → drawn signals.
 */
const RED   = "#ef4444";
const AMBER = "#f59e0b";
const GREEN = "#22c55e";

export function V07TrafficControl() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#0b0f14", color: "#e5e7eb", fontFamily: "system-ui" }}>
      {/* road texture top */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, background: "#1f2937", display: "flex", alignItems: "center", justifyContent: "center", gap: 18, fontSize: 10 }}>
        <Signal color={GREEN} label="פעיל" />
        <Signal color={AMBER} label="המתנה" />
        <Signal color={RED}   label="עצור" />
        <span style={{ marginInlineStart: 24, color: "#9ca3af", fontFamily: "monospace" }}>TRAFFIC OPS · TLV-01</span>
      </div>

      {/* dashed lane divider */}
      <DashLane top={154} />
      <DashLane top={304} />

      {/* row 1 — incident left, product center, status right */}
      <div style={{ position: "absolute", top: 36, left: 8, right: 8, bottom: 132, display: "grid", gridTemplateColumns: "190px 1fr 200px", gap: 10 }}>
        {/* left panel — signal lights stack */}
        <div style={{ background: "rgba(31,41,55,0.6)", border: `1px solid ${GREEN}33`, borderRadius: 8, padding: 10 }} dir="rtl">
          <p style={{ margin: 0, fontSize: 9, letterSpacing: "0.18em", color: GREEN, textTransform: "uppercase" }}>סטטוס מוצר</p>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { c: GREEN, label: "מלאי תקין",  v: "OK" },
              { c: GREEN, label: "ייצור פעיל", v: "ON" },
              { c: AMBER, label: "המתנה ספק", v: "WAIT" },
              { c: GREEN, label: "אישור בטיחות", v: "PASS" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", background: "rgba(0,0,0,0.3)", borderRadius: 6 }}>
                <SignalLight color={row.c} />
                <span style={{ fontSize: 10 }}>{row.label}</span>
                <span style={{ marginInlineStart: "auto", fontSize: 9, fontFamily: "monospace", color: row.c, fontWeight: 700 }}>{row.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* center — product on road */}
        <div style={{ position: "relative", background: "rgba(31,41,55,0.4)", border: "1px solid #374151", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* asphalt */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#0b0f14 0%,#111827 70%,#1f2937 100%)" }} />
          {/* lane markings — converging */}
          <div style={{ position: "absolute", bottom: 8, left: "30%", right: "30%", height: 4, background: `repeating-linear-gradient(to right,${AMBER} 0 18px,transparent 18px 30px)`, opacity: 0.7 }} />
          <div style={{ position: "absolute", bottom: 40, left: "40%", right: "40%", height: 3, background: `repeating-linear-gradient(to right,${AMBER}aa 0 14px,transparent 14px 24px)`, opacity: 0.5 }} />
          <div style={{ fontSize: 140, filter: `drop-shadow(0 0 32px ${AMBER}66)`, position: "relative", zIndex: 2 }}>{SAMPLE_PRODUCT.emoji}</div>
          {/* corner signal */}
          <div style={{ position: "absolute", top: 8, left: 8, display: "flex", flexDirection: "column", gap: 2, padding: 4, background: "#000", borderRadius: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#000" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#000" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: GREEN, boxShadow: `0 0 8px ${GREEN}` }} />
          </div>
        </div>

        {/* right — metrics */}
        <div style={{ background: "rgba(31,41,55,0.6)", border: "1px solid #374151", borderRadius: 8, padding: 10 }} dir="rtl">
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{SAMPLE_PRODUCT.title}</p>
          <p style={{ margin: "2px 0 8px", fontSize: 9, color: "#9ca3af" }}>{SAMPLE_PRODUCT.category}</p>
          {SAMPLE_PRODUCT.metrics.map((m, i) => {
            const c = i === 0 ? GREEN : i === 1 ? AMBER : i === 2 ? AMBER : GREEN;
            return (
              <div key={m.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderTop: i ? "1px solid #374151" : "none" }}>
                <SignalLight color={c} small />
                <span style={{ fontSize: 10, flex: 1, marginInline: 8 }}>{m.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{m.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* bottom carousel — items as little traffic-light cards */}
      <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, height: 110, background: "rgba(31,41,55,0.6)", border: "1px solid #374151", borderRadius: 8, padding: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>LANE · ALL EQUIPMENT</span>
          <span style={{ fontSize: 9, color: GREEN }}>● 9 פעילים</span>
        </div>
        <div style={{ display: "flex", gap: 6, height: 70 }}>
          {["🚧","🟥","🟨","🛑","➡️","🔆","👁️","🛞","🟧"].map((e, i) => (
            <div key={i} style={{ flex: 1, position: "relative", background: i === 4 ? "#0a0f14" : "rgba(0,0,0,0.4)", border: i === 4 ? `2px solid ${GREEN}` : "1px solid #374151", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              {e}
              <SignalLight color={i === 1 ? RED : i === 6 ? AMBER : GREEN} small style={{ position: "absolute", top: 4, right: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Signal({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
      {label}
    </span>
  );
}
function SignalLight({ color, small, style }: { color: string; small?: boolean; style?: React.CSSProperties }) {
  const s = small ? 8 : 12;
  return <span style={{ width: s, height: s, borderRadius: "50%", background: color, boxShadow: `0 0 ${small ? 6 : 10}px ${color}99`, ...style }} />;
}
function DashLane({ top }: { top: number }) {
  return <div style={{ position: "absolute", top, left: 8, right: 8, height: 2, background: `repeating-linear-gradient(to right,#fbbf24 0 14px,transparent 14px 24px)`, opacity: 0.35 }} />;
}
