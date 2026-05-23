"use client";

import { SAMPLE_PRODUCT } from "../shared/sampleProduct";

/**
 * V02 — Operational Command Center.
 * Top telemetry ticker, left agent rail, center product + ops overlay, right department stacks, mini-map.
 * Less cinematic, more live-ops dashboard.
 */

const AGENTS = [
  { id: "inv",  hebrew: "מלאי",       color: "#22c55e", status: "OK"   },
  { id: "fab",  hebrew: "ייצור",      color: "#facc15", status: "WARN" },
  { id: "proc", hebrew: "רכש",        color: "#22c55e", status: "OK"   },
  { id: "fld",  hebrew: "שטח",        color: "#22c55e", status: "OK"   },
  { id: "qa",   hebrew: "בקרת איכות", color: "#22c55e", status: "OK"   },
  { id: "crd",  hebrew: "תיאום",      color: "#ef4444", status: "ALRT" },
];

export function V02CommandCenter() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#0a0f1c", color: "#e2e8f0", fontFamily: "system-ui" }}>
      {/* top telemetry strip */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 24, background: "#000", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", paddingInline: 10, gap: 18, fontSize: 10, fontFamily: "monospace" }}>
        <span style={{ color: "#22c55e" }}>● SYS OK</span>
        <span>FAB <b style={{ color: "#facc15" }}>78%</b></span>
        <span>STOCK <b style={{ color: "#22c55e" }}>{SAMPLE_PRODUCT.metrics[0].value}</b></span>
        <span>QUEUE <b>{SAMPLE_PRODUCT.metrics[1].value}</b></span>
        <span style={{ marginInlineStart: "auto", color: "#94a3b8" }}>2026-05-22 · 14:08:22 · OPS</span>
      </div>

      {/* left agent rail */}
      <div style={{ position: "absolute", top: 30, left: 8, bottom: 30, width: 140, padding: 8, background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 8 }}>
        <p style={{ margin: 0, fontSize: 9, letterSpacing: "0.18em", color: "#64748b" }}>AGENTS</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {AGENTS.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 6, background: "rgba(0,0,0,0.3)", border: "1px solid #1e293b" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: a.color, boxShadow: `0 0 6px ${a.color}` }} />
              <span style={{ fontSize: 11 }} dir="rtl">{a.hebrew}</span>
              <span style={{ marginInlineStart: "auto", fontSize: 8, fontFamily: "monospace", color: a.color }}>{a.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* center product + ops overlay */}
      <div style={{ position: "absolute", top: 36, left: 158, right: 232, bottom: 110, background: "rgba(15,23,42,0.4)", border: "1px solid #1e293b", borderRadius: 8, padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, fontFamily: "monospace", color: "#64748b" }}>
          <span>PRODUCT VIEW · {SAMPLE_PRODUCT.id}</span>
          <span>SKU: {SAMPLE_PRODUCT.id}</span>
        </div>
        <div style={{ position: "relative", height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 130, opacity: 0.95 }}>{SAMPLE_PRODUCT.emoji}</div>
          {/* corner brackets */}
          {[
            { top: 30, left: 50 }, { top: 30, right: 50 },
            { bottom: 30, left: 50 }, { bottom: 30, right: 50 },
          ].map((p, i) => (
            <div key={i} style={{ position: "absolute", width: 16, height: 16, borderColor: "#38bdf8", borderStyle: "solid", borderWidth: 0,
              ...(p.top !== undefined ? { top: p.top, borderTopWidth: 2 } : { bottom: p.bottom, borderBottomWidth: 2 }),
              ...(p.left !== undefined ? { left: p.left, borderLeftWidth: 2 } : { right: p.right, borderRightWidth: 2 }),
            }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "monospace", color: "#94a3b8", marginTop: 4 }}>
          <span>FORECAST 90D · +12% DEMAND</span>
          <span>FAB TIME · 4.2H/UNIT</span>
        </div>
      </div>

      {/* right department stack */}
      <div style={{ position: "absolute", top: 30, right: 8, bottom: 30, width: 218, display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { label: "מלאי שוטף",  value: SAMPLE_PRODUCT.metrics[0].value, delta: "+12", color: "#22c55e" },
          { label: "מוזמן",      value: SAMPLE_PRODUCT.metrics[1].value, delta: "−3",  color: "#ef4444" },
          { label: "ייצור פתוח", value: SAMPLE_PRODUCT.metrics[2].value, delta: "+5",  color: "#22c55e" },
          { label: "פעולות היום", value: 7,                                delta: "OK",  color: "#facc15" },
        ].map((row, i) => (
          <div key={i} style={{ padding: 8, borderRadius: 6, background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8" }} dir="rtl">
              <span>{row.label}</span>
              <span style={{ fontFamily: "monospace", color: row.color, fontSize: 9 }}>{row.delta}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", textAlign: "left", fontVariantNumeric: "tabular-nums" }}>{row.value}</div>
          </div>
        ))}
      </div>

      {/* mini-map / warehouse heat */}
      <div style={{ position: "absolute", bottom: 8, left: 158, right: 232, height: 90, background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 8, padding: 8 }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#64748b", marginBottom: 4 }}>WAREHOUSE GRID · BAY MAP</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(18,1fr)", gridAutoRows: "10px", gap: 2 }}>
          {Array.from({ length: 54 }).map((_, i) => {
            const t = (i * 37) % 100;
            const c = t > 80 ? "#ef4444" : t > 55 ? "#facc15" : t > 25 ? "#22c55e" : "#1e293b";
            return <span key={i} style={{ background: c, borderRadius: 2, opacity: c === "#1e293b" ? 0.5 : 0.9 }} />;
          })}
        </div>
      </div>
    </div>
  );
}
