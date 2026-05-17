"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { NEURAL_HOTSPOTS, type NeuralHotspot } from "@/lib/agents/neural-core-hotspots";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_COLORS } from "@/types/agent";
import type { Agent, AgentActivityFeedItem, AgentStats } from "@/types/agent";

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

// ── Hotspot → agent id ────────────────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────────────────────
type StatsLive = AgentStats & { speaking: boolean };
type StatusKey = "critical" | "warning" | "approval" | "active" | "normal" | "unassigned";

// ── Mock fallback stats ───────────────────────────────────────────────────────
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

// ── Status meta ───────────────────────────────────────────────────────────────
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
  { d: "M770,248 L770,385",  stroke: "rgba(0,210,255,0.20)",  dur: "1.1s" }, // Orchestrator → Data Core
  { d: "M455,335 L685,415",  stroke: "rgba(34,197,94,0.18)",  dur: "1.5s" }, // CFO          → Data Core
  { d: "M1062,335 L808,415", stroke: "rgba(168,85,247,0.18)", dur: "1.5s" }, // Graphics     → Data Core
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  const h = diff / 3_600_000;
  if (m < 2)  return "עכשיו";
  if (h < 1)  return `${m}ד׳`;
  if (h < 24) return `${Math.round(h)}ש׳`;
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  activityFeed?: AgentActivityFeedItem[];
  agents?: Agent[];
}

// ─────────────────────────────────────────────────────────────────────────────

export function NeuralOperationsCore({ activityFeed = [], agents = [] }: Props) {
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

  // ── Aggregate stats (for health panel + dock) ──────────────────────────────
  const statsSrc       = liveStats ?? MOCK_STATS;
  const statValues     = Object.values(statsSrc) as StatsLive[];
  const totalOpenTasks = statValues.reduce((s, v) => s + v.openTasks, 0);
  const totalInProgress= statValues.reduce((s, v) => s + v.inProgressTasks, 0);
  const totalExceptions= statValues.reduce((s, v) => s + v.openExceptions, 0);
  const totalCritical  = statValues.reduce((s, v) => s + v.criticalExceptions, 0);
  const totalApprovals = statValues.reduce((s, v) => s + v.pendingApprovals, 0);
  const speakingCount  = dataSource === "live"
    ? statValues.filter(v => v.speaking).length
    : 0;

  const agentById      = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);
  const recentActivity = activityFeed.slice(0, 10);

  // ── Selected panel derived values ──────────────────────────────────────────
  const panelStats   = selected ? getStats(selected.id) : null;
  const panelStatus  = deriveStatus(panelStats);
  const panelMeta    = STATUS_META[panelStatus];
  const panelAgentId = selected ? (AGENT_MAP[selected.id] ?? null) : null;
  const panelColor   = selected
    ? (HOTSPOT_COLORS[selected.id] ?? "rgba(255,255,255,0.75)")
    : "rgba(255,255,255,0.75)";

  // ── Bottom dock chips ──────────────────────────────────────────────────────
  type DockChip = { label: string; value: string; color: string; glow: boolean };
  const dockChips: DockChip[] = [
    { label: "AGENTS",     value: "9 / 9",              color: "rgba(34,197,94,0.9)",  glow: false },
    { label: "TASKS",      value: String(totalOpenTasks + totalInProgress),
      color: (totalOpenTasks + totalInProgress) > 0 ? "#f59e0b" : "rgba(255,255,255,0.28)",
      glow:  (totalOpenTasks + totalInProgress) > 0 },
    { label: "EXCEPTIONS", value: String(totalExceptions),
      color: totalExceptions > 0 ? "#f97316" : "rgba(255,255,255,0.28)",
      glow:  totalExceptions > 0 },
    { label: "CRITICAL",   value: String(totalCritical),
      color: totalCritical > 0 ? "#ef4444" : "rgba(255,255,255,0.28)",
      glow:  totalCritical > 0 },
    { label: "APPROVALS",  value: String(totalApprovals),
      color: totalApprovals > 0 ? "#3b82f6" : "rgba(255,255,255,0.28)",
      glow:  totalApprovals > 0 },
    ...(dataSource === "live" && speakingCount > 0
      ? [{ label: "SPEAKING", value: String(speakingCount), color: "#06b6d4", glow: true }]
      : []),
  ];

  return (
    <div dir="rtl">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-mono px-2 py-0.5 rounded"
            style={{
              background: dataSource === "live" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
              color:      dataSource === "live" ? "#22c55e"              : "#f59e0b",
              border:     `1px solid ${dataSource === "live" ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
            }}
          >
            {dataSource === "live" ? "● LIVE" : "○ MOCK"}
          </span>
          <span className="text-[10px] text-white/25">
            {dataSource === "live" ? "נתונים בזמן אמת" : "הדגמה — שרת לא זמין"}
          </span>
        </div>
        <div className="text-right">
          <h2 className="text-sm font-black text-white/90" style={{ letterSpacing: ".12em" }}>
            NEURAL OPERATIONS CORE
          </h2>
          <p className="text-[10px] text-white/30">ליבת הפיקוד · 9 סוכנים פעילים</p>
        </div>
      </div>

      {/* ── Two-column layout: stage (1fr) | right panels (220px) ───────────── */}
      {/* Stage is naturally ~15–18% narrower than full-width due to the right panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3 items-start">

        {/* ── Left: image stage ────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-xl"
          style={{ aspectRatio: "3/2", background: "#020918" }}
          onClick={() => setSelected(null)}
        >
          {/* z1: Reference image */}
          <Image
            src="/neural-core/reference.png"
            alt="Elkayam Neural Operations Core"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, calc(100vw - 300px)"
            style={{ objectFit: "contain", userSelect: "none", pointerEvents: "none" }}
            draggable={false}
          />

          {/* z2: SVG overlay — pipeline pulses + heartbeat + beacons + speaking */}
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
            {/* Data Core heartbeat — max 6% opacity, 3.5s cycle */}
            <ellipse cx="741" cy="431" rx="87" ry="86"
              stroke="rgba(0,229,255,1)" strokeWidth="1" fill="none" strokeOpacity="0">
              <animate attributeName="rx"             values="87;110;87"      dur="3.5s" repeatCount="indefinite" />
              <animate attributeName="ry"             values="86;109;86"      dur="3.5s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.06;0;0.06"   dur="3.5s" repeatCount="indefinite" />
            </ellipse>

            {/* Pipeline pulses */}
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
              const cx   = ((hs.x + hs.w * 0.42) / 100) * 1536;
              const cy   = ((hs.y - hs.h * 0.42) / 100) * 1024;
              const r    = status === "critical" ? 8 : status === "warning" ? 7 : 6;
              return (
                <g key={`beacon-${hs.id}`}>
                  {status === "critical" && (
                    <circle cx={cx} cy={cy} r={8} fill="none" stroke={meta.dot} strokeWidth="1.5">
                      <animate attributeName="r"              values="8;18;8"      dur="1.8s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" values="0.35;0;0.35" dur="1.8s" repeatCount="indefinite" />
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

            {/* Speaking dots — live mode only */}
            {dataSource === "live" && NEURAL_HOTSPOTS.map(hs => {
              if (!AGENT_MAP[hs.id]) return null;
              const stats = getStats(hs.id);
              if (!stats?.speaking) return null;
              const cx   = ((hs.x - hs.w * 0.38) / 100) * 1536;
              const cy   = ((hs.y - hs.h * 0.40) / 100) * 1024;
              const fill = (HOTSPOT_COLORS[hs.id] ?? "rgba(255,255,255,0.75)").replace("0.75)", "1)");
              return (
                <circle key={`spk-${hs.id}`} cx={cx} cy={cy} r={5} fill={fill} fillOpacity={0.9}>
                  <animate attributeName="fill-opacity" values="0.9;0.35;0.9" dur="1.4s" repeatCount="indefinite" />
                </circle>
              );
            })}
          </svg>

          {/* z5: Baked-label patch — covers "PROCUREMENT / מחלקת רכש" in reference.png */}
          {/* coordination_qa hub is at (17.4%, 73.2%); baked label is just below at ~78–88% */}
          <div
            style={{
              position:       "absolute",
              left:           "8.5%",
              top:            "77.8%",
              width:          "18%",
              height:         "10%",
              zIndex:         5,
              background:     "rgba(2,6,18,0.97)",
              borderRadius:   "4px",
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              gap:            "2px",
              pointerEvents:  "none",
              textAlign:      "center",
              direction:      "rtl",
            }}
          >
            <span style={{ fontSize: "clamp(7px,0.85vw,10px)", fontWeight: 700, color: "rgba(6,182,212,0.92)", letterSpacing: ".02em", lineHeight: 1.25 }}>
              מחלקת תיאומים ו-QA
            </span>
            <span style={{ fontSize: "clamp(5px,0.62vw,8px)", fontWeight: 500, color: "rgba(6,182,212,0.50)", letterSpacing: ".10em", textTransform: "uppercase", direction: "ltr" }}>
              COORDINATION / QA
            </span>
          </div>

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
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleHotspotClick(hs); }
                }}
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
                position:     "absolute",
                bottom:       "12px",
                right:        "12px",
                zIndex:       50,
                width:        "260px",
                background:   "rgba(3,8,22,0.97)",
                border:       `1px solid ${panelColor.replace("0.75)", "0.35)")}`,
                borderRadius: "10px",
                padding:      "11px 15px",
                boxShadow:    "0 6px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <button
                onClick={() => setSelected(null)}
                style={{ position: "absolute", top: "8px", left: "10px", background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: "12px", lineHeight: 1, padding: "2px" }}
                aria-label="סגור"
              >✕</button>

              <div style={{ fontSize: "13px", fontWeight: 700, color: "#e8f0ff" }}>{selected.labelHe}</div>
              <div style={{ fontSize: "9px", color: "#506888", letterSpacing: ".07em", textTransform: "uppercase", marginTop: "1px" }}>
                {selected.labelEn}
              </div>

              {panelStats ? (
                <>
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
                  <span style={{ fontSize: "8px", padding: "2px 8px", borderRadius: "20px", background: "rgba(100,120,150,0.1)", color: "#4a6080", border: "1px solid rgba(100,120,150,0.18)" }}>—</span>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "9px", fontSize: "10px", color: "#6080a0" }}>
                <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0, background: panelMeta.dot, boxShadow: `0 0 5px ${panelMeta.dot}` }} />
                {panelMeta.label}
              </div>
              <div style={{ marginTop: "5px", fontSize: "7.5px", color: "#283850", fontFamily: "monospace", letterSpacing: ".04em" }}>
                {panelAgentId
                  ? <>{panelAgentId}<span style={{ marginLeft: "5px", fontSize: "6.5px", color: "rgba(255,200,60,0.6)", textTransform: "uppercase" }}>{dataSource}</span></>
                  : <>{selected.id === "data_core" ? "hub node" : "dynamic"}</>
                }
              </div>
            </div>
          )}
        </div>

        {/* ── Right: system health + activity feed ────────────────────────── */}
        <div className="flex flex-col gap-3 h-full">

          {/* System Health Card */}
          <div
            className="rounded-xl p-3 shrink-0"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: dataSource === "live" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
                  color:      dataSource === "live" ? "#22c55e"              : "#f59e0b",
                  border:     `1px solid ${dataSource === "live" ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
                }}
              >
                {dataSource === "live" ? "● LIVE" : "○ MOCK"}
              </span>
              <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">מצב מערכת</span>
            </div>

            <div className="space-y-2.5">
              {([
                { label: "סוכנים פעילים", value: "9",                  color: "rgba(255,255,255,0.65)" },
                { label: "משימות פתוחות", value: totalOpenTasks,        color: totalOpenTasks  > 0 ? "#f59e0b" : "rgba(255,255,255,0.28)" },
                { label: "בביצוע",         value: totalInProgress,      color: totalInProgress > 0 ? "#3b82f6" : "rgba(255,255,255,0.28)" },
                { label: "חריגות פתוחות", value: totalExceptions,       color: totalExceptions > 0 ? "#f97316" : "rgba(255,255,255,0.28)" },
                { label: "קריטי",          value: totalCritical,        color: totalCritical   > 0 ? "#ef4444" : "rgba(255,255,255,0.28)" },
                { label: "אישורים",        value: totalApprovals,       color: totalApprovals  > 0 ? "#f59e0b" : "rgba(255,255,255,0.28)" },
                ...(dataSource === "live"
                  ? [{ label: "מדברים", value: speakingCount, color: speakingCount > 0 ? "#06b6d4" : "rgba(255,255,255,0.28)" }]
                  : []),
              ] as { label: string; value: string | number; color: string }[]).map(row => (
                <div key={row.label} className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-semibold" style={{ color: String(row.color) }}>
                    {String(row.value)}
                  </span>
                  <span className="text-[9px] text-white/35">{row.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed Card */}
          <div
            className="rounded-xl p-3 flex flex-col overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              flex: "1 1 0",
              minHeight: 0,
            }}
          >
            <div className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2.5 text-right shrink-0">
              פעילות אחרונה
            </div>

            {recentActivity.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[10px] text-white/20">אין פעילות</span>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-3 pr-0.5">
                {recentActivity.map(item => {
                  const agent = agentById.get(item.agent_id);
                  return (
                    <div
                      key={item.id}
                      className="text-right pb-2.5"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[9px] text-white/25 shrink-0">
                          {relativeTime(item.created_at)}
                        </span>
                        <span className={`text-[8px] font-bold shrink-0 ${ACTIVITY_TYPE_COLORS[item.message_type] ?? "text-white/40"}`}>
                          {ACTIVITY_TYPE_LABELS[item.message_type] ?? item.message_type}
                        </span>
                      </div>
                      {agent && (
                        <div className="text-[9px] mb-0.5" style={{ color: agent.color ?? "#aaa" }}>
                          {agent.icon} {agent.name}
                        </div>
                      )}
                      <div className="text-[10px] text-white/55 leading-snug line-clamp-2">
                        {item.content}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Command Dock ──────────────────────────────────────────────── */}
      <div
        className="mt-3 rounded-xl px-4 py-2.5"
        style={{
          background:    "rgba(255,255,255,0.025)",
          border:        "1px solid rgba(255,255,255,0.07)",
          backdropFilter: "blur(6px)",
        }}
        dir="ltr"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[8px] text-white/20 font-mono uppercase tracking-[.16em]">
            COMMAND DOCK
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {dockChips.map(chip => (
              <div
                key={chip.label}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border:     "1px solid rgba(255,255,255,0.07)",
                  boxShadow:  chip.glow ? `0 0 10px ${chip.color}28` : "none",
                }}
              >
                <span className="text-[12px] font-bold leading-none" style={{ color: chip.color }}>
                  {chip.value}
                </span>
                <span className="text-[8px] text-white/25 font-mono uppercase tracking-wider">
                  {chip.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
