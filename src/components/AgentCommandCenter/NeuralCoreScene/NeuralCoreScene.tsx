"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Agent, AgentActivityFeedItem } from "@/types/agent";

import { PODS, AGENT_MAP } from "./scene-config";
import { MOCK_STATS, aggregateStats } from "./entity-state";
import type { StatsLive, DataSource } from "./entity-state";

import { SceneBackground } from "./SceneBackground";
import { PipelineLayer } from "./PipelineLayer";
import { DepartmentPod } from "./DepartmentPod";
import { SystemHealthPanel } from "./SystemHealthPanel";
import { CommandDock } from "./CommandDock";
import type { DockChip } from "./CommandDock";

// ── CSS keyframes (scoped to this component via <style> tag) ──────────────────
const SCENE_KEYFRAMES = `
  @keyframes beacon-pulse {
    0%, 100% { opacity: 1;   transform: scale(1);    }
    50%       { opacity: 0.5; transform: scale(0.88); }
  }
  @keyframes beacon-pulse-alert {
    0%, 100% { opacity: 1;   transform: scale(1);    }
    50%       { opacity: 0.3; transform: scale(0.75); }
  }
`;

// ── Props — identical to NeuralOperationsCore so index.tsx needs no other changes ──
interface Props {
  activityFeed?: AgentActivityFeedItem[];
  agents?: Agent[];
}

export function NeuralCoreScene({ activityFeed: _activityFeed = [], agents: _agents = [] }: Props) {
  const [liveStats,   setLiveStats]   = useState<Record<string, StatsLive> | null>(null);
  const [dataSource,  setDataSource]  = useState<DataSource>("mock");
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Polling: same pattern as NeuralOperationsCore ─────────────────────────
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

  // ── Resolved stats source ──────────────────────────────────────────────────
  const statsSrc = useMemo(
    () => liveStats ?? MOCK_STATS,
    [liveStats],
  );

  function getStats(hsId: string): StatsLive | null {
    const agentId = AGENT_MAP[hsId];
    if (!agentId) return null;
    return statsSrc[agentId] ?? null;
  }

  // ── Selected pod ───────────────────────────────────────────────────────────
  const selectedPod   = useMemo(() => PODS.find(p => p.id === selectedId) ?? null, [selectedId]);
  const selectedStats = selectedPod ? getStats(selectedPod.id) : null;

  function handlePodClick(id: string) {
    setSelectedId(prev => prev === id ? null : id);
  }

  // ── Aggregate stats for CommandDock ────────────────────────────────────────
  const agg = useMemo(() => aggregateStats(statsSrc), [statsSrc]);

  const dockChips: DockChip[] = [
    { label: "AGENTS",     value: "9 / 9",         color: "rgba(34,197,94,0.9)",   glow: false },
    { label: "TASKS",      value: String(agg.openTasks + agg.inProgress),
      color: (agg.openTasks + agg.inProgress) > 0 ? "#f59e0b" : "rgba(255,255,255,0.28)",
      glow:  (agg.openTasks + agg.inProgress) > 0 },
    { label: "EXCEPTIONS", value: String(agg.exceptions),
      color: agg.exceptions > 0 ? "#f97316" : "rgba(255,255,255,0.28)",
      glow:  agg.exceptions > 0 },
    { label: "CRITICAL",   value: String(agg.critical),
      color: agg.critical > 0 ? "#ef4444" : "rgba(255,255,255,0.28)",
      glow:  agg.critical > 0 },
    { label: "APPROVALS",  value: String(agg.approvals),
      color: agg.approvals > 0 ? "#3b82f6" : "rgba(255,255,255,0.28)",
      glow:  agg.approvals > 0 },
    ...(dataSource === "live" && agg.speaking > 0
      ? [{ label: "SPEAKING", value: String(agg.speaking), color: "#06b6d4", glow: true }]
      : []),
  ];

  return (
    <div dir="rtl">
      {/* Beacon keyframe animation — injected once per mount */}
      <style>{SCENE_KEYFRAMES}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-mono px-2 py-0.5 rounded"
            style={{
              background: dataSource === "live" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
              color:      dataSource === "live" ? "#22c55e"               : "#f59e0b",
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
          <h2
            className="text-sm font-black text-white/90"
            style={{ letterSpacing: ".12em" }}
          >
            NEURAL OPERATIONS CORE
          </h2>
          <p className="text-[10px] text-white/30">ליבת הפיקוד · 9 סוכנים פעילים</p>
        </div>
      </div>

      {/* ── Two-column layout: stage (1fr) | right panel (220px) ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3 items-start">

        {/* Stage */}
        <div
          className="relative overflow-hidden rounded-xl"
          style={{ aspectRatio: "3/2", background: "#020612" }}
          onClick={() => setSelectedId(null)}
        >
          {/* Layer z:0 — background */}
          <SceneBackground />

          {/* Layer z:10 — pipeline SVG */}
          <PipelineLayer />

          {/* Layer z:20 — department pods */}
          {PODS.map(pod => (
            <DepartmentPod
              key={pod.id}
              pod={pod}
              stats={getStats(pod.id)}
              isSelected={selectedId === pod.id}
              onClick={() => handlePodClick(pod.id)}
            />
          ))}
        </div>

        {/* Right column */}
        <SystemHealthPanel
          stats={statsSrc}
          dataSource={dataSource}
          selectedPod={selectedPod}
          selectedStats={selectedStats}
          onClose={() => setSelectedId(null)}
        />
      </div>

      {/* ── Command dock ─────────────────────────────────────────────────── */}
      <CommandDock chips={dockChips} dataSource={dataSource} />
    </div>
  );
}
