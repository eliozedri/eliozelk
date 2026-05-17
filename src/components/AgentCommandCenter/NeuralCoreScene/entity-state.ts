import type { AgentStats } from "@/types/agent";

// ── Core types ────────────────────────────────────────────────────────────────
export type StatsLive = AgentStats & { speaking: boolean };
export type StatusKey = "critical" | "warning" | "approval" | "active" | "normal" | "unassigned";
export type DataSource = "live" | "mock";

// ── Mock fallback stats (9 active agents, engineering-plan-agent excluded) ────
export const MOCK_STATS: Record<string, StatsLive> = {
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

// ── Status metadata ───────────────────────────────────────────────────────────
export const STATUS_META: Record<StatusKey, { dot: string; label: string }> = {
  critical:   { dot: "#EF4444", label: "חריגה קריטית" },
  warning:    { dot: "#F59E0B", label: "חריגה פתוחה"  },
  approval:   { dot: "#3B82F6", label: "ממתין לאישור" },
  active:     { dot: "#22C55E", label: "פעיל"         },
  normal:     { dot: "#3A5070", label: "תקין"         },
  unassigned: { dot: "#2A3A50", label: "לא מוגדר"    },
};

// ── Derive status from live stats ─────────────────────────────────────────────
export function deriveStatus(stats: StatsLive | null): StatusKey {
  if (!stats) return "unassigned";
  if (stats.criticalExceptions > 0) return "critical";
  if (stats.openExceptions > 0)     return "warning";
  if (stats.pendingApprovals > 0)   return "approval";
  if (stats.inProgressTasks > 0)    return "active";
  return "normal";
}

// ── Aggregate totals from a stats record ──────────────────────────────────────
export function aggregateStats(src: Record<string, StatsLive>) {
  const vals = Object.values(src);
  return {
    openTasks:    vals.reduce((s, v) => s + v.openTasks, 0),
    inProgress:   vals.reduce((s, v) => s + v.inProgressTasks, 0),
    exceptions:   vals.reduce((s, v) => s + v.openExceptions, 0),
    critical:     vals.reduce((s, v) => s + v.criticalExceptions, 0),
    approvals:    vals.reduce((s, v) => s + v.pendingApprovals, 0),
    speaking:     vals.filter(v => v.speaking).length,
  };
}
