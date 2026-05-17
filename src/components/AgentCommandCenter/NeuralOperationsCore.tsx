"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { NEURAL_HOTSPOTS, type NeuralHotspot } from "@/lib/agents/neural-core-hotspots";
import type { AgentStats } from "@/types/agent";

// ── Hotspot color map (matches Phase 1C calibration) ─────────────────────────
const HOTSPOT_COLORS: Record<string, string> = {
  orchestrator:    "rgba(0,194,255,0.75)",
  data_core:       "rgba(0,229,255,0.75)",
  cfo:             "rgba(34,197,94,0.75)",
  warehouse:       "rgba(250,204,21,0.75)",
  coordination_qa: "rgba(6,182,212,0.75)",
  graphics:        "rgba(168,85,247,0.75)",
  accounting:      "rgba(59,130,246,0.75)",
  catalog:         "rgba(139,92,246,0.75)",
  fabrication:     "rgba(249,115,22,0.75)",
  meeting:         "rgba(96,165,250,0.75)",
  field_ops:       "rgba(74,222,128,0.75)",
};

// ── Hotspot → agent id (data_core and meeting have no agent) ──────────────────
const AGENT_MAP: Record<string, string | null> = {
  orchestrator:    "ops-orchestrator",
  cfo:             "cfo-agent",
  warehouse:       "inventory-agent",
  graphics:        "graphics-production-agent",
  accounting:      "billing-collections-agent",
  catalog:         "catalog-pricing-agent",
  fabrication:     "fabrication-agent",
  field_ops:       "field-ops-agent",
  coordination_qa: "coordination-qa-agent",
  data_core:       null,
  meeting:         null,
};

// ── Extended stats type (speaking field from stats-summary API) ───────────────
type StatsLive = AgentStats & { speaking: boolean };

// ── Mock fallback — matches AgentStats schema exactly ────────────────────────
const MOCK_STATS: Record<string, StatsLive> = {
  "ops-orchestrator":          { openTasks: 0, inProgressTasks: 0, openExceptions: 0, criticalExceptions: 0, pendingApprovals: 2, speaking: false },
  "cfo-agent":                 { openTasks: 3, inProgressTasks: 1, openExceptions: 1, criticalExceptions: 0, pendingApprovals: 0, speaking: false },
  "inventory-agent":           { openTasks: 5, inProgressTasks: 2, openExceptions: 0, criticalExceptions: 0, pendingApprovals: 1, speaking: false },
  "graphics-production-agent": { openTasks: 4, inProgressTasks: 1, openExceptions: 0, criticalExceptions: 0, pendingApprovals: 0, speaking: false },
  "billing-collections-agent": { openTasks: 2, inProgressTasks: 0, openExceptions: 2, criticalExceptions: 1, pendingApprovals: 1, speaking: false },
  "catalog-pricing-agent":     { openTasks: 0, inProgressTasks: 0, openExceptions: 0, criticalExceptions: 0, pendingApprovals: 0, speaking: false },
  "fabrication-agent":         { openTasks: 2, inProgressTasks: 1, openExceptions: 0, criticalExceptions: 0, pendingApprovals: 0, speaking: false },
  "field-ops-agent":           { openTasks: 6, inProgressTasks: 3, openExceptions: 1, criticalExceptions: 0, pendingApprovals: 0, speaking: false },
  "coordination-qa-agent":     { openTasks: 3, inProgressTasks: 2, openExceptions: 0, criticalExceptions: 0, pendingApprovals: 1, speaking: false },
};

// ── Status ────────────────────────────────────────────────────────────────────
type StatusKey = "critical" | "warning" | "approval" | "active" | "normal" | "unassigned";

const STATUS_META: Record<StatusKey, { dot: string; label: string }> = {
  critical:   { dot: "#ef4444", label: "חריגה קריטית" },
  warning:    { dot: "#f59e0b", label: "חריגה פתוחה"  },
  approval:   { dot: "#3b82f6", label: "ממתין לאישור" },
  active:     { dot: "#22c55e", label: "פעיל"         },
  normal:     { dot: "#3a5070", label: "תקין"         },
  unassigned: { dot: "#2a3a50", label: "לא מוגדר"    },
};

function deriveStatus(stats: StatsLive | null): StatusKey {
  if (!stats) return "unassigned";
  if (stats.criticalExceptions > 0) return "critical";
  if (stats.openExceptions > 0)     return "warning";
  if (stats.pendingApprovals > 0)   return "approval";
  if (stats.inProgressTasks > 0)    return "active";
  return "normal";
}

// ── SVG pipeline pulse paths (1536×1024 coordinate space) ────────────────────
const PIPELINE_PULSES = [
  { d: "M770,248 L770,385",    stroke: "rgba(0,210,255,0.20)",  dur: "1.1s" }, // Orchestrator → Data Core
  { d: "M455,335 L685,415",    stroke: "rgba(34,197,94,0.18)",  dur: "1.5s" }, // CFO          → Data Core
  { d: "M1062,335 L808,415",   stroke: "rgba(168,85,247,0.18)", dur: "1.5s" }, // Graphics     → Data Core
] as const;

// ─────────────────────────────────────────────────────────────────────────────

export function NeuralOperationsCore() {
  const [liveStats, setLiveStats] = useState<Record<string, StatsLive> | null>(null);
  const [dataSource, setDataSource] = useState<"live" | "mock">("mock");
  const [selected, setSelected] = useState<NeuralHotspot | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/stats-summary", {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        setLiveStats(await res.json() as Record<string, StatsLive>);
        setDataSource("live");
      }
    } catch { /* server unreachable — stay on mock */ }
    timerRef.current = setTimeout(() => { void fetchStats(); }, 30_000);
  }, []);

  useEffect(() => {
    void fetchStats();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [fetchStats]);

  function getStats(hsId: string): StatsLive | null {
    const agentId = AGENT_MAP[hsId];
    if (!agentId) return null;
    const src: Record<string, StatsLive> = liveStats ?? MOCK_STATS;
    return src[agentId] ?? null;
  }

  function handleHotspotClick(hs: NeuralHotspot) {
    setSelected(prev => prev?.id === hs.id ? null : hs);
  }

  // ── Panel derived values ───────────────────────────────────────────────────
  const panelStats   = selected ? getStats(selected.id) : null;
  const panelStatus  = deriveStatus(panelStats);
  const panelMeta    = STATUS_META[panelStatus];
  const panelAgentId = selected ? (AGENT_MAP[selected.id] ?? null) : null;
  const panelColor   = selected ? (HOTSPOT_COLORS[selected.id] ?? "rgba(255,255,255,0.75)") : "rgba(255,255,255,0.75)";
  const panelBorder  = panelColor.replace("0.75)", "0.35)");

  return (
    <div dir="rtl">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-mono px-2 py-1 rounded"
            style={{
              background: dataSource === "live" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
              color:      dataSource === "live" ? "#22c55e"              : "#f59e0b",
              border:     `1px solid ${dataSource === "live" ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
            }}
          >
            {dataSource === "live" ? "● LIVE" : "○ MOCK"}
          </span>
          <span className="text-[10px] text-white/25">
            {dataSource === "live" ? "נתונים בזמן אמת" : "נתוני הדגמה — שרת לא זמין"}
          </span>
        </div>
        <div className="text-right">
          <h2 className="text-sm font-black text-white/90" style={{ letterSpacing: ".12em" }}>
            NEURAL OPERATIONS CORE
          </h2>
          <p className="text-[10px] text-white/30">ליבת הפיקוד · 9 סוכנים פעילים</p>
        </div>
      </div>

      {/* ── Stage (locked 3:2, matches reference image) ─────────────────────── */}
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{ aspectRatio: "3/2", background: "#020918" }}
        onClick={() => setSelected(null)}
      >
        {/* z1: Reference image */}
        <Image
          src="/neural-core/reference.png"
          alt="Elkayam Neural Operations Core"
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 1280px"
          style={{ objectFit: "contain", userSelect: "none", pointerEvents: "none" }}
          draggable={false}
        />

        {/* z2: SVG overlay — pipeline pulses, heartbeat, status beacons, speaking dots */}
        <svg
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            pointerEvents: "none", overflow: "visible",
            zIndex: 2,
          }}
          viewBox="0 0 1536 1024"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Data Core heartbeat — extremely subtle, max 6% opacity */}
          <ellipse cx="741" cy="431" rx="87" ry="86"
            stroke="rgba(0,229,255,1)" strokeWidth="1" fill="none" strokeOpacity="0">
            <animate attributeName="rx" values="87;110;87" dur="3.5s" repeatCount="indefinite" />
            <animate attributeName="ry" values="86;109;86" dur="3.5s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values="0.06;0;0.06" dur="3.5s" repeatCount="indefinite" />
          </ellipse>

          {/* Pipeline pulses: flow toward Data Core */}
          {PIPELINE_PULSES.map((p, i) => (
            <path key={i} d={p.d} stroke={p.stroke} strokeWidth="1.2"
              fill="none" strokeDasharray="6,18" strokeLinecap="round">
              <animate attributeName="stroke-dashoffset" from="24" to="0" dur={p.dur} repeatCount="indefinite" />
            </path>
          ))}

          {/* Status beacons — upper-right edge of each hotspot ellipse */}
          {NEURAL_HOTSPOTS.map(hs => {
            const stats  = getStats(hs.id);
            const status = deriveStatus(stats);
            if (!["critical", "warning", "approval"].includes(status)) return null;
            const meta = STATUS_META[status];
            const cx = ((hs.x + hs.w * 0.42) / 100) * 1536;
            const cy = ((hs.y - hs.h * 0.42) / 100) * 1024;
            const r  = status === "critical" ? 8 : status === "warning" ? 7 : 6;
            return (
              <g key={`beacon-${hs.id}`}>
                {status === "critical" && (
                  <circle cx={cx} cy={cy} r={8} fill="none" stroke={meta.dot} strokeWidth="1.5">
                    <animate attributeName="r"              values="8;18;8"       dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.35;0;0.35"  dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={cx} cy={cy} r={r} fill={meta.dot} fillOpacity={0.92}>
                  {status === "critical" && (
                    <animate attributeName="r" values="8;11.5;8" dur="1.8s" repeatCount="indefinite" />
                  )}
                  {status === "warning" && (
                    <animate attributeName="r" values="7;8.5;7"  dur="2.2s" repeatCount="indefinite" />
                  )}
                </circle>
              </g>
            );
          })}

          {/* Speaking dots — live mode only, upper-left edge of hotspot */}
          {dataSource === "live" && NEURAL_HOTSPOTS.map(hs => {
            if (!AGENT_MAP[hs.id]) return null;
            const stats = getStats(hs.id);
            if (!stats?.speaking) return null;
            const cx = ((hs.x - hs.w * 0.38) / 100) * 1536;
            const cy = ((hs.y - hs.h * 0.40) / 100) * 1024;
            const fill = (HOTSPOT_COLORS[hs.id] ?? "rgba(255,255,255,0.75)").replace("0.75)", "1)");
            return (
              <circle key={`spk-${hs.id}`} cx={cx} cy={cy} r={5} fill={fill} fillOpacity={0.9}>
                <animate attributeName="fill-opacity" values="0.9;0.35;0.9" dur="1.4s" repeatCount="indefinite" />
              </circle>
            );
          })}
        </svg>

        {/* z20: Hotspot interaction divs */}
        {NEURAL_HOTSPOTS.map(hs => {
          const color      = HOTSPOT_COLORS[hs.id] ?? "rgba(255,255,255,0.4)";
          const isSelected = selected?.id === hs.id;
          return (
            <div
              key={hs.id}
              role="button"
              tabIndex={0}
              aria-label={hs.labelHe}
              aria-selected={isSelected}
              onClick={e => { e.stopPropagation(); handleHotspotClick(hs); }}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleHotspotClick(hs); } }}
              onMouseEnter={e => {
                if (!isSelected) {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.background = "rgba(255,255,255,0.15)";
                  el.style.boxShadow  = "0 0 10px rgba(255,255,255,0.08)";
                }
              }}
              onMouseLeave={e => {
                if (!isSelected) {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.background = "transparent";
                  el.style.boxShadow  = "none";
                }
              }}
              style={{
                position:     "absolute",
                left:         `${hs.x}%`,
                top:          `${hs.y}%`,
                width:        `${hs.w}%`,
                height:       `${hs.h}%`,
                transform:    "translate(-50%, -50%)",
                borderRadius: "50%",
                cursor:       "pointer",
                outline:      "none",
                zIndex:       20,
                transition:   "background 0.14s ease, box-shadow 0.14s ease",
                background:   isSelected ? color.replace("0.75)", "0.22)") : "transparent",
                boxShadow:    isSelected ? `0 0 14px ${color.replace("0.75)", "0.12)")}` : "none",
              }}
            />
          );
        })}

        {/* z50: Selected-agent detail panel */}
        {selected && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position:   "absolute",
              bottom:     "12px",
              right:      "12px",
              zIndex:     50,
              width:      "270px",
              background: "rgba(3,8,22,0.97)",
              border:     `1px solid ${panelBorder}`,
              borderRadius: "10px",
              padding:    "11px 15px",
              boxShadow:  "0 6px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            {/* Close */}
            <button
              onClick={() => setSelected(null)}
              style={{ position: "absolute", top: "8px", left: "10px", background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: "12px", lineHeight: 1, padding: "2px" }}
              aria-label="סגור"
            >
              ✕
            </button>

            <div style={{ fontSize: "13px", fontWeight: 700, color: "#e8f0ff" }}>{selected.labelHe}</div>
            <div style={{ fontSize: "9px", color: "#506888", letterSpacing: ".07em", textTransform: "uppercase", marginTop: "1px" }}>
              {selected.labelEn}
            </div>

            {panelStats ? (
              <>
                {/* KPI grid — open tasks / in-progress */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px", paddingTop: "9px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                  <div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#d0e4ff", lineHeight: 1 }}>{panelStats.openTasks}</div>
                    <div style={{ fontSize: "7.5px", color: "#3a5070", textTransform: "uppercase", marginTop: "3px", letterSpacing: ".05em" }}>פתוחות</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#d0e4ff", lineHeight: 1 }}>{panelStats.inProgressTasks}</div>
                    <div style={{ fontSize: "7.5px", color: "#3a5070", textTransform: "uppercase", marginTop: "3px", letterSpacing: ".05em" }}>בביצוע</div>
                  </div>
                </div>

                {/* Status tag chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}>
                  {panelStats.criticalExceptions > 0 && (
                    <span style={{ fontSize: "8px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: "rgba(239,68,68,0.18)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", letterSpacing: ".04em", textTransform: "uppercase" }}>
                      {panelStats.criticalExceptions} קריטי
                    </span>
                  )}
                  {panelStats.openExceptions > 0 && (
                    <span style={{ fontSize: "8px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)", letterSpacing: ".04em", textTransform: "uppercase" }}>
                      {panelStats.openExceptions} חריגות
                    </span>
                  )}
                  {panelStats.pendingApprovals > 0 && (
                    <span style={{ fontSize: "8px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: "rgba(59,130,246,0.15)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.25)", letterSpacing: ".04em", textTransform: "uppercase" }}>
                      {panelStats.pendingApprovals} אישורים
                    </span>
                  )}
                  {panelStats.criticalExceptions === 0 && panelStats.openExceptions === 0 && panelStats.pendingApprovals === 0 && (
                    <span style={{ fontSize: "8px", padding: "2px 8px", borderRadius: "20px", background: "rgba(100,120,150,0.1)", color: "#4a6080", border: "1px solid rgba(100,120,150,0.18)", letterSpacing: ".04em", textTransform: "uppercase" }}>
                      תקין
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ marginTop: "10px", paddingTop: "9px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                <span style={{ fontSize: "8px", padding: "2px 8px", borderRadius: "20px", background: "rgba(100,120,150,0.1)", color: "#4a6080", border: "1px solid rgba(100,120,150,0.18)" }}>
                  —
                </span>
              </div>
            )}

            {/* Status row */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "9px", fontSize: "10px", color: "#6080a0" }}>
              <span style={{
                display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0,
                background: panelMeta.dot, boxShadow: `0 0 5px ${panelMeta.dot}`,
              }} />
              {panelMeta.label}
            </div>

            {/* Agent id + data source */}
            <div style={{ marginTop: "5px", fontSize: "7.5px", color: "#283850", fontFamily: "monospace", letterSpacing: ".04em" }}>
              {panelAgentId
                ? <>{panelAgentId}<span style={{ marginLeft: "5px", fontSize: "6.5px", color: "rgba(255,200,60,0.6)", textTransform: "uppercase" }}>{dataSource}</span></>
                : <span>{selected.id === "data_core" ? "hub node" : "dynamic"}</span>
              }
            </div>
          </div>
        )}
      </div>

      {/* ── Footer hint ─────────────────────────────────────────────────────── */}
      <p className="text-[10px] text-white/15 text-center mt-3">
        לחץ על אזור כדי לראות מצב הסוכן · ● LIVE = נתונים אמיתיים · ○ MOCK = הדגמה
      </p>
    </div>
  );
}
