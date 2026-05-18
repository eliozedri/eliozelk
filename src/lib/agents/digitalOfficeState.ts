// Digital Office — centralized data adapter
// Real data: derived from agents[], meetings[], stats, activityFeed[] (Supabase via useAgentContext)
// Placeholder data: presence labels, mock room configs — clearly marked, isolated here only

import type { Agent, AgentStats, AgentActivityFeedItem } from "@/types/agent";
import type { AgentMeeting } from "@/types/agentMeeting";

// ── Department Room Config ────────────────────────────────────────────────────

export type RoomStatus = "healthy" | "active" | "waiting" | "warning" | "critical" | "inactive";

export interface DeptRoomConfig {
  id: string;
  titleHe: string;
  titleEn: string;
  icon: string;
  accentColor: string;
  agentIds: string[];
  gridRow: 1 | 2 | 3;
  gridCol: 1 | 2 | 3;
}

export const DEPT_ROOMS: DeptRoomConfig[] = [
  // Row 1 — coordination layer
  {
    id: "orders",
    titleHe: "הזמנות ותפעול",
    titleEn: "Orders & Operations",
    icon: "📋",
    accentColor: "#1d6fd8",
    agentIds: ["orders-agent"],
    gridRow: 1,
    gridCol: 1,
  },
  {
    id: "qa-coordination",
    titleHe: "תיאומים ו-QA",
    titleEn: "Coordination & QA",
    icon: "🔍",
    accentColor: "#2dd4bf",
    agentIds: ["coordination-qa-agent"],
    gridRow: 1,
    gridCol: 2,
  },
  {
    id: "graphics",
    titleHe: "גרפיקה וייצור",
    titleEn: "Graphics & Production",
    icon: "🎨",
    accentColor: "#a78bfa",
    agentIds: ["graphics-production-agent"],
    gridRow: 1,
    gridCol: 3,
  },
  // Row 2 — execution layer
  {
    id: "warehouse",
    titleHe: "מחסן ולוגיסטיקה",
    titleEn: "Warehouse & Logistics",
    icon: "📦",
    accentColor: "#22c55e",
    agentIds: ["inventory-agent", "equipment-fleet-agent"],
    gridRow: 2,
    gridCol: 1,
  },
  {
    id: "field",
    titleHe: "ביצוע שטח",
    titleEn: "Field Operations",
    icon: "🦺",
    accentColor: "#86efac",
    agentIds: ["field-ops-agent"],
    gridRow: 2,
    gridCol: 2,
  },
  {
    id: "finance",
    titleHe: "כספים וגבייה",
    titleEn: "Finance & Collections",
    icon: "💼",
    accentColor: "#fcd34d",
    agentIds: ["billing-collections-agent", "cfo-agent"],
    gridRow: 2,
    gridCol: 3,
  },
  // Row 3 — support layer
  {
    id: "catalog",
    titleHe: "קטלוג ותמחור",
    titleEn: "Catalog & Pricing",
    icon: "🗂️",
    accentColor: "#60a5fa",
    agentIds: ["catalog-pricing-agent"],
    gridRow: 3,
    gridCol: 1,
  },
  {
    id: "fabrication",
    titleHe: "מסגרייה",
    titleEn: "Fabrication",
    icon: "⚙️",
    accentColor: "#9ca3af",
    agentIds: ["fabrication-agent"],
    gridRow: 3,
    gridCol: 2,
  },
];

export const EXECUTIVE_ROOM_ID = "management";
export const EXECUTIVE_AGENT_ID = "ops-orchestrator";
export const MEETING_ROOM_ID = "meetings";

// Map from agentId → homeRoomId (built once at module load)
function buildHomeRoomMap(): Map<string, string> {
  const map = new Map<string, string>();
  map.set(EXECUTIVE_AGENT_ID, EXECUTIVE_ROOM_ID);
  for (const room of DEPT_ROOMS) {
    for (const id of room.agentIds) {
      map.set(id, room.id);
    }
  }
  return map;
}
export const HOME_ROOM_MAP = buildHomeRoomMap();

// ── Agent Presence ────────────────────────────────────────────────────────────

export type PresenceStatus = "active" | "idle" | "waiting" | "critical" | "in_meeting";

export interface AgentPresence {
  agentId: string;
  homeRoomId: string;
  currentRoomId: string;
  presenceStatus: PresenceStatus;
  currentActivity: string; // PLACEHOLDER — replace with real DB column later
}

// PLACEHOLDER: static activity labels per agent
// Replace with agent.currentActivity from DB when available
const AGENT_ACTIVITY_LABELS: Record<string, string> = {
  "ops-orchestrator":           "פיקוד כלל-ארגוני",
  "orders-agent":               "מעבד הזמנות",
  "coordination-qa-agent":      "בדיקת שערי מוכנות",
  "graphics-production-agent":  "מעבד גרפיקה",
  "inventory-agent":            "מעקב מלאי",
  "equipment-fleet-agent":      "בדיקת ציוד",
  "field-ops-agent":            "ניהול שטח",
  "billing-collections-agent":  "מעקב גבייה",
  "cfo-agent":                  "ניתוח פיננסי",
  "catalog-pricing-agent":      "עדכון קטלוג",
  "fabrication-agent":          "ניהול ייצור",
};

export function computeAgentPresence(
  agents: Agent[],
  meetings: AgentMeeting[],
  stats: Record<string, AgentStats>,
  scanStatuses: Record<string, string>,
): Map<string, AgentPresence> {
  const inMeetingSet = new Set<string>();
  for (const m of meetings) {
    if (m.status === "active") {
      for (const id of m.participating_agents) inMeetingSet.add(id);
    }
  }

  const result = new Map<string, AgentPresence>();
  for (const agent of agents) {
    const homeRoomId = HOME_ROOM_MAP.get(agent.id) ?? EXECUTIVE_ROOM_ID;
    const inMeeting = inMeetingSet.has(agent.id);
    const currentRoomId = inMeeting ? MEETING_ROOM_ID : homeRoomId;
    const stat = stats[agent.id];
    const scanRunning = scanStatuses[agent.id] === "running";

    let presenceStatus: PresenceStatus;
    if (inMeeting) {
      presenceStatus = "in_meeting";
    } else if (agent.status === "error" || (stat?.criticalExceptions ?? 0) > 0) {
      presenceStatus = "critical";
    } else if ((stat?.pendingApprovals ?? 0) > 0) {
      presenceStatus = "waiting";
    } else if (agent.status === "active" || scanRunning) {
      presenceStatus = "active";
    } else {
      presenceStatus = "idle";
    }

    result.set(agent.id, {
      agentId: agent.id,
      homeRoomId,
      currentRoomId,
      presenceStatus,
      currentActivity: AGENT_ACTIVITY_LABELS[agent.id] ?? "ממתין",
    });
  }
  return result;
}

// ── Room Status Derivation ────────────────────────────────────────────────────

export function deriveRoomStatus(
  agentIds: string[],
  stats: Record<string, AgentStats>,
  presence: Map<string, AgentPresence>,
  scanStatuses: Record<string, string>,
): RoomStatus {
  if (agentIds.length === 0) return "inactive";

  let hasCritical = false;
  let hasPendingApprovals = false;
  let hasOpenExceptions = false;
  let allInMeeting = true;
  let anyScanRunning = false;

  for (const id of agentIds) {
    const stat = stats[id];
    if (stat?.criticalExceptions > 0) hasCritical = true;
    if (stat?.pendingApprovals > 0) hasPendingApprovals = true;
    if (stat?.openExceptions > 0) hasOpenExceptions = true;
    if (scanStatuses[id] === "running") anyScanRunning = true;
    const p = presence.get(id);
    if (!p || p.presenceStatus !== "in_meeting") allInMeeting = false;
  }

  if (hasCritical) return "critical";
  if (hasPendingApprovals) return "warning";
  if (hasOpenExceptions) return "waiting";
  if (allInMeeting) return "waiting";
  if (anyScanRunning) return "active";
  return "healthy";
}

// ── Room Aggregate Stats ──────────────────────────────────────────────────────

export interface RoomAggregate {
  openTasks: number;
  openExceptions: number;
  criticalExceptions: number;
  pendingApprovals: number;
}

export function aggregateRoomStats(
  agentIds: string[],
  stats: Record<string, AgentStats>,
): RoomAggregate {
  return agentIds.reduce<RoomAggregate>(
    (acc, id) => {
      const s = stats[id];
      if (!s) return acc;
      return {
        openTasks:          acc.openTasks + s.openTasks,
        openExceptions:     acc.openExceptions + s.openExceptions,
        criticalExceptions: acc.criticalExceptions + s.criticalExceptions,
        pendingApprovals:   acc.pendingApprovals + s.pendingApprovals,
      };
    },
    { openTasks: 0, openExceptions: 0, criticalExceptions: 0, pendingApprovals: 0 },
  );
}

// ── Agent split for a room ────────────────────────────────────────────────────

export interface RoomAgentSplit {
  presentAtHome: Agent[];  // home here AND currently here
  awayFromHome: Agent[];   // home here BUT currently elsewhere
}

export function splitRoomAgents(
  roomId: string,
  homeAgentIds: string[],
  agentMap: Map<string, Agent>,
  presence: Map<string, AgentPresence>,
): RoomAgentSplit {
  const presentAtHome: Agent[] = [];
  const awayFromHome: Agent[] = [];
  for (const id of homeAgentIds) {
    const agent = agentMap.get(id);
    if (!agent) continue;
    const p = presence.get(id);
    if (!p || p.currentRoomId === roomId) {
      presentAtHome.push(agent);
    } else {
      awayFromHome.push(agent);
    }
  }
  return { presentAtHome, awayFromHome };
}

// ── System Health Summary ─────────────────────────────────────────────────────

export interface SystemHealthSummary {
  overall: "ok" | "warning" | "critical";
  activeAgents: number;
  inMeetingAgents: number;
  totalAgents: number;
  openTasks: number;
  criticalIssues: number;
  pendingApprovals: number;
  activeRooms: number;
}

export function buildSystemHealthSummary(
  agents: Agent[],
  stats: Record<string, AgentStats>,
  presence: Map<string, AgentPresence>,
): SystemHealthSummary {
  let openTasks = 0, criticalIssues = 0, pendingApprovals = 0;
  let activeAgents = 0, inMeetingAgents = 0;
  const activeRoomSet = new Set<string>();

  for (const agent of agents) {
    const s = stats[agent.id];
    const p = presence.get(agent.id);
    if (s) {
      openTasks        += s.openTasks;
      criticalIssues   += s.criticalExceptions;
      pendingApprovals += s.pendingApprovals;
    }
    if (p?.presenceStatus === "active" || p?.presenceStatus === "in_meeting") {
      activeAgents++;
      activeRoomSet.add(p.currentRoomId);
    }
    if (p?.presenceStatus === "in_meeting") inMeetingAgents++;
  }

  const overall: SystemHealthSummary["overall"] =
    criticalIssues > 0 ? "critical"
    : (openTasks > 5 || pendingApprovals > 2) ? "warning"
    : "ok";

  return {
    overall, activeAgents, inMeetingAgents, totalAgents: agents.length,
    openTasks, criticalIssues, pendingApprovals, activeRooms: activeRoomSet.size,
  };
}

// ── Activity Event (mapped from real AgentActivityFeedItem) ───────────────────

export type FeedSeverity = "info" | "ok" | "warn" | "critical" | "action" | "meeting";

export interface ActivityEvent {
  id: string;
  time: string;
  agentId: string;
  agentIcon: string;
  agentName: string;
  sourceDept: string;
  text: string;
  relatedEntity?: { type: string; id: string };
  severity: FeedSeverity;
  eventType: string;
}

const FEED_SEVERITY_MAP: Record<string, FeedSeverity> = {
  detection:        "info",
  task_created:     "action",
  exception:        "warn",
  recommendation:   "info",
  approval_request: "warn",
  action_taken:     "ok",
  collaboration:    "meeting",
  status_change:    "info",
};

export function mapFeedItem(
  item: AgentActivityFeedItem,
  agentMap: Map<string, Agent>,
): ActivityEvent {
  const agent = agentMap.get(item.agent_id);
  return {
    id: item.id,
    time: item.created_at,
    agentId: item.agent_id,
    agentIcon: agent?.icon ?? "🤖",
    agentName: agent?.name ?? item.agent_id,
    sourceDept: agent?.department ?? "operations",
    text: item.content,
    relatedEntity: item.related_entity_type
      ? { type: item.related_entity_type, id: item.related_entity_id ?? "" }
      : undefined,
    severity: FEED_SEVERITY_MAP[item.message_type] ?? "info",
    eventType: item.message_type,
  };
}

// ── Relative time helper ──────────────────────────────────────────────────────

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  const h = diff / 3_600_000;
  if (m < 2) return "עכשיו";
  if (h < 1) return `${m} דק׳`;
  if (h < 24) return `${Math.round(h)} ש׳`;
  if (h < 48) return "אתמול";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}
