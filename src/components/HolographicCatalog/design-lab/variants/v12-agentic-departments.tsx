"use client";

import { SAMPLE_PRODUCT } from "../shared/sampleProduct";

/**
 * V12 — Agentic Department Catalog.
 * Product surrounded by 4 agent badges (Inventory / Procurement / Field / Coordination).
 * SVG connector lines from product to each badge. Each badge pulses when its agent has activity.
 * Connects the catalog to the agent framework.
 */
const AGENTS = [
  { id: "inv",  hebrew: "מלאי",       color: "#22c55e", pos: { top: 36,  right: 36 }, count: 3, last: "+12 today" },
  { id: "proc", hebrew: "רכש",        color: "#3b82f6", pos: { top: 36,  left:  36 }, count: 1, last: "PO #4422 sent" },
  { id: "fld",  hebrew: "שטח",        color: "#f59e0b", pos: { bottom: 110, right: 36 }, count: 2, last: "2 active sites" },
  { id: "crd",  hebrew: "תיאום",      color: "#a855f7", pos: { bottom: 110, left:  36 }, count: 0, last: "no anomalies" },
];

export function V12AgenticDepartments() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#0b1020 0%,#0a0814 100%)", color: "#e2e8f0", fontFamily: "system-ui" }}>
      {/* faint hex grid */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.3,
        backgroundImage: "radial-gradient(rgba(148,163,184,0.18) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
      }} />

      {/* connector lines (SVG behind everything) */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} viewBox="0 0 720 440" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cInv" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22c55e" stopOpacity="0.55" />
            <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cProc" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b82f6" stopOpacity="0.55" />
            <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cFld" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#f59e0b" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cCrd" x1="1" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#a855f7" stopOpacity="0.55" />
            <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="360" y1="220" x2="624" y2="80"  stroke="url(#cInv)"  strokeWidth="1.5" />
        <line x1="360" y1="220" x2="96"  y2="80"  stroke="url(#cProc)" strokeWidth="1.5" />
        <line x1="360" y1="220" x2="624" y2="340" stroke="url(#cFld)"  strokeWidth="1.5" />
        <line x1="360" y1="220" x2="96"  y2="340" stroke="url(#cCrd)"  strokeWidth="1.5" />
      </svg>

      {/* central product */}
      <div style={{ position: "absolute", top: 110, left: 0, right: 0, height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: "1px solid rgba(148,163,184,0.30)", background: "radial-gradient(circle, rgba(148,163,184,0.10), transparent 65%)" }}>
          <div style={{ fontSize: 110, filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.6))" }}>{SAMPLE_PRODUCT.emoji}</div>
          {/* code label */}
          <div style={{ position: "absolute", bottom: -22, left: "50%", transform: "translateX(-50%)", fontSize: 10, fontFamily: "monospace", color: "rgba(226,232,240,0.7)", letterSpacing: "0.16em" }}>
            {SAMPLE_PRODUCT.code}
          </div>
        </div>
      </div>

      {/* product title at top center */}
      <div dir="rtl" style={{ position: "absolute", top: 14, left: 0, right: 0, textAlign: "center" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{SAMPLE_PRODUCT.title}</h2>
        <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(226,232,240,0.5)" }}>4 מחלקות מחוברות · {SAMPLE_PRODUCT.metrics[0].value} במלאי</p>
      </div>

      {/* 4 agent badges */}
      {AGENTS.map((a) => (
        <div key={a.id} dir="rtl" style={{
          position: "absolute",
          ...a.pos,
          width: 160,
          padding: 10,
          borderRadius: 12,
          border: `1px solid ${a.color}55`,
          background: "rgba(15,23,42,0.78)",
          backdropFilter: "blur(10px)",
          boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 22px ${a.color}22`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.color, boxShadow: `0 0 8px ${a.color}` }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{a.hebrew}</span>
            {a.count > 0 && (
              <span style={{ marginInlineStart: "auto", fontSize: 9, fontFamily: "monospace", padding: "1px 6px", borderRadius: 999, background: `${a.color}28`, color: a.color, fontWeight: 700 }}>
                {a.count}
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 10, color: "rgba(226,232,240,0.7)" }}>{a.last}</p>
        </div>
      ))}

      {/* bottom strip — flow / events */}
      <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, height: 76, padding: 10, borderRadius: 10, background: "rgba(15,23,42,0.7)", border: "1px solid rgba(148,163,184,0.15)" }}>
        <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(226,232,240,0.55)", letterSpacing: "0.18em" }} dir="ltr">AGENT EVENT FEED</div>
        <div style={{ marginTop: 6, display: "flex", gap: 10, fontSize: 10 }}>
          <Event dot="#22c55e" text="מלאי: +12 יחידות נכנסו (PO #4419)" time="14:02" />
          <Event dot="#a855f7" text="תיאום: סנכרון מסדר עבודה #318"     time="13:58" />
          <Event dot="#f59e0b" text="שטח: 2 אתרים פתוחים"                 time="13:46" />
        </div>
      </div>
    </div>
  );
}

function Event({ dot, text, time }: { dot: string; text: string; time: string }) {
  return (
    <div dir="rtl" style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.25)" }}>
      <span style={{ marginTop: 5, width: 6, height: 6, borderRadius: "50%", background: dot, boxShadow: `0 0 6px ${dot}`, flexShrink: 0 }} />
      <span style={{ flex: 1, color: "rgba(226,232,240,0.82)", lineHeight: 1.35 }}>{text}</span>
      <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(226,232,240,0.4)" }}>{time}</span>
    </div>
  );
}
