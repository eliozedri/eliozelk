import type { PodConfig } from "./scene-config";
import type { StatsLive, DataSource } from "./entity-state";
import { deriveStatus, STATUS_META, aggregateStats } from "./entity-state";

interface Props {
  stats: Record<string, StatsLive>;
  dataSource: DataSource;
  selectedPod: PodConfig | null;
  selectedStats: StatsLive | null;
  onClose: () => void;
}

const PANEL: React.CSSProperties = {
  borderRadius: "12px",
  padding: "12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
};

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "8px",
  paddingTop: "6px",
  paddingBottom: "6px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
};

// Right-column panel (220px) — aggregate stats when idle, dept detail when selected.
export function SystemHealthPanel({ stats, dataSource, selectedPod, selectedStats, onClose }: Props) {
  const agg = aggregateStats(stats);

  return (
    <div className="flex flex-col gap-3">

      {/* ── System Health Card ──────────────────────────────────────────── */}
      <div style={PANEL}>
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-[8px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: dataSource === "live" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
              color:      dataSource === "live" ? "#22c55e"               : "#f59e0b",
              border:     `1px solid ${dataSource === "live" ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
            }}
          >
            {dataSource === "live" ? "● LIVE" : "○ MOCK"}
          </span>
          <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">מצב מערכת</span>
        </div>

        <div>
          {([
            { label: "סוכנים פעילים", value: "9 / 9",        color: "rgba(255,255,255,0.65)" },
            { label: "משימות פתוחות", value: agg.openTasks,  color: agg.openTasks  > 0 ? "#f59e0b" : "rgba(255,255,255,0.28)" },
            { label: "בביצוע",        value: agg.inProgress,  color: agg.inProgress > 0 ? "#3b82f6" : "rgba(255,255,255,0.28)" },
            { label: "חריגות",        value: agg.exceptions,  color: agg.exceptions > 0 ? "#f97316" : "rgba(255,255,255,0.28)" },
            { label: "קריטי",         value: agg.critical,    color: agg.critical   > 0 ? "#ef4444" : "rgba(255,255,255,0.28)" },
            { label: "אישורים",       value: agg.approvals,   color: agg.approvals  > 0 ? "#f59e0b" : "rgba(255,255,255,0.28)" },
            ...(dataSource === "live" && agg.speaking > 0
              ? [{ label: "מדברים", value: agg.speaking, color: "#06b6d4" }]
              : []),
          ] as { label: string; value: string | number; color: string }[]).map(row => (
            <div key={row.label} style={ROW}>
              <span className="text-[10px] font-semibold" style={{ color: row.color }}>
                {String(row.value)}
              </span>
              <span className="text-[9px] text-white/35">{row.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Selected Department Panel ───────────────────────────────────── */}
      {selectedPod && (
        <div
          style={{
            ...PANEL,
            borderColor: `${selectedPod.color}30`,
            boxShadow: `0 0 18px ${selectedPod.color}12`,
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <button
              onClick={onClose}
              aria-label="סגור"
              className="text-white/20 hover:text-white/50 transition-colors text-sm leading-none"
            >
              ✕
            </button>
            <div className="text-right">
              <div
                className="text-[11px] font-bold leading-tight"
                style={{ color: selectedPod.color }}
                dir="rtl"
              >
                {selectedPod.labelHe}
              </div>
              <div
                className="text-[8px] font-semibold mt-0.5"
                style={{ color: selectedPod.color, opacity: 0.6, letterSpacing: "0.08em" }}
              >
                {selectedPod.labelEn}
              </div>
            </div>
          </div>

          {/* Status row */}
          {selectedStats ? (
            <>
              {/* Status badge */}
              {(() => {
                const sk   = deriveStatus(selectedStats);
                const meta = STATUS_META[sk];
                return (
                  <div className="flex items-center justify-end gap-1.5 mb-2">
                    <span style={{ fontSize: "9px", color: meta.dot }}>{meta.label}</span>
                    <span
                      style={{
                        display: "inline-block",
                        width: "7px", height: "7px",
                        borderRadius: "50%",
                        background: meta.dot,
                        boxShadow: `0 0 5px ${meta.dot}`,
                        flexShrink: 0,
                      }}
                    />
                  </div>
                );
              })()}

              {/* KPI rows */}
              {([
                { label: "משימות פתוחות", value: selectedStats.openTasks,         color: selectedStats.openTasks         > 0 ? "#f59e0b" : "rgba(255,255,255,0.3)" },
                { label: "בביצוע",        value: selectedStats.inProgressTasks,    color: selectedStats.inProgressTasks   > 0 ? "#3b82f6" : "rgba(255,255,255,0.3)" },
                { label: "חריגות",        value: selectedStats.openExceptions,     color: selectedStats.openExceptions    > 0 ? "#f97316" : "rgba(255,255,255,0.3)" },
                { label: "קריטי",         value: selectedStats.criticalExceptions, color: selectedStats.criticalExceptions > 0 ? "#ef4444" : "rgba(255,255,255,0.3)" },
                { label: "אישורים",       value: selectedStats.pendingApprovals,   color: selectedStats.pendingApprovals  > 0 ? "#f59e0b" : "rgba(255,255,255,0.3)" },
              ]).map(row => (
                <div key={row.label} style={ROW}>
                  <span className="text-[10px] font-semibold" style={{ color: row.color }}>
                    {row.value}
                  </span>
                  <span className="text-[9px] text-white/35">{row.label}</span>
                </div>
              ))}

              {/* Agent ID */}
              {selectedPod.agentId && (
                <div
                  className="mt-2 text-[7.5px] font-mono text-right"
                  style={{ color: "#283850", letterSpacing: "0.04em" }}
                >
                  {selectedPod.agentId}
                </div>
              )}
            </>
          ) : (
            <div className="text-[9px] text-white/20 text-right mt-1">אין נתונים</div>
          )}
        </div>
      )}
    </div>
  );
}
