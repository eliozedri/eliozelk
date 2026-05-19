"use client";

import { useMemo, useState } from "react";
import type { Agent, AgentStats, AgentActivityFeedItem } from "@/types/agent";
import type { AgentMeeting } from "@/types/agentMeeting";
import {
  DEPT_ROOMS,
  EXECUTIVE_AGENT_ID,
  MEETING_ROOM_ID,
  computeAgentPresence,
  deriveRoomStatus,
  aggregateRoomStats,
  splitRoomAgents,
  buildSystemHealthSummary,
  mapFeedItem,
  relativeTime,
  type DeptRoomConfig,
  type RoomStatus,
  type AgentPresence,
  type PresenceStatus,
  type FeedSeverity,
  type ActivityEvent,
  type RoomAggregate,
} from "@/lib/agents/digitalOfficeState";

// ── Brand constants ───────────────────────────────────────────────────────────

const NAVY     = "#0d1b2e";
const EK_BLUE  = "#1d6fd8";
const EK_GOLD  = "#f59e0b";
const TEAL     = "#2dd4bf";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  agents: Agent[];
  stats: Record<string, AgentStats>;
  scanStatuses: Record<string, string>;
  meetings: AgentMeeting[];
  activityFeed?: AgentActivityFeedItem[];
  loading?: boolean;
  onAgentSelect: (agent: Agent) => void;
  onAgentChat: (agentId: string) => void;
  onMeetingOpen: (m: AgentMeeting) => void;
  onNewMeeting: () => void;
}

// ── Room status → visual style ────────────────────────────────────────────────

const ROOM_STYLE: Record<RoomStatus, { border: string; bg: string; shadow?: string }> = {
  critical: { border: "rgba(239,68,68,0.5)",   bg: "rgba(127,29,29,0.14)",  shadow: "0 0 20px rgba(239,68,68,0.07)" },
  warning:  { border: "rgba(249,115,22,0.42)", bg: "rgba(124,45,18,0.1)" },
  waiting:  { border: "rgba(245,158,11,0.38)", bg: "rgba(120,53,15,0.08)" },
  active:   { border: "rgba(29,111,216,0.4)",  bg: "rgba(29,111,216,0.05)" },
  healthy:  { border: "rgba(34,197,94,0.22)",  bg: "rgba(255,255,255,0.025)" },
  inactive: { border: "rgba(255,255,255,0.07)", bg: "transparent" },
};

// ── Presence → dot color ──────────────────────────────────────────────────────

const PRESENCE_DOT: Record<PresenceStatus, string> = {
  active:     "bg-green-400 shadow-green-400/50",
  idle:       "bg-slate-500",
  waiting:    "bg-amber-400",
  critical:   "bg-red-500 shadow-red-500/50",
  in_meeting: "bg-teal-400 shadow-teal-400/50",
};

const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  active:     "פעיל",
  idle:       "ממתין",
  waiting:    "ממתין לאישור",
  critical:   "קריטי",
  in_meeting: "בישיבה",
};

// ── Feed severity → style ────────────────────────────────────────────────────

const FEED_BORDER: Record<FeedSeverity, string> = {
  info:    EK_BLUE,
  ok:      "#22c55e",
  warn:    EK_GOLD,
  critical:"#ef4444",
  action:  "#a78bfa",
  meeting: TEAL,
};

const FEED_BG: Record<FeedSeverity, string> = {
  info:    "rgba(255,255,255,0.025)",
  ok:      "rgba(34,197,94,0.04)",
  warn:    "rgba(120,53,15,0.07)",
  critical:"rgba(127,29,29,0.1)",
  action:  "rgba(167,139,250,0.05)",
  meeting: "rgba(45,212,191,0.05)",
};

// ── Micro icons ───────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// ── AgentAvatarChip ───────────────────────────────────────────────────────────

function AgentAvatarChip({
  agent, presence, variant = "home", onClick,
}: {
  agent: Agent;
  presence?: AgentPresence;
  variant: "home" | "ghost" | "visitor";
  onClick?: () => void;
}) {
  const status = presence?.presenceStatus ?? "idle";
  const activity = presence?.currentActivity ?? "ממתין";
  const isGhost = variant === "ghost";

  const style = isGhost
    ? {
        background: "rgba(255,255,255,0.02)",
        border: "1px dashed rgba(255,255,255,0.12)",
        opacity: 0.5,
      }
    : variant === "visitor"
    ? {
        background: "rgba(167,139,250,0.08)",
        border: "1px solid rgba(167,139,250,0.28)",
      }
    : {
        background:
          status === "active" ? "rgba(34,197,94,0.07)"
          : status === "critical" ? "rgba(239,68,68,0.09)"
          : status === "waiting" ? "rgba(245,158,11,0.07)"
          : status === "in_meeting" ? "rgba(45,212,191,0.07)"
          : "rgba(255,255,255,0.04)",
        border: `1px solid ${
          status === "active"     ? "rgba(34,197,94,0.28)"
          : status === "critical"   ? "rgba(239,68,68,0.38)"
          : status === "waiting"    ? "rgba(245,158,11,0.3)"
          : status === "in_meeting" ? "rgba(45,212,191,0.28)"
          : "rgba(255,255,255,0.08)"
        }`,
      };

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-right transition-all hover:brightness-110"
      style={style}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRESENCE_DOT[isGhost ? "in_meeting" : status]}`} />
      <span className="text-sm flex-shrink-0">{agent.icon ?? "🤖"}</span>
      <span className="flex flex-col min-w-0">
        <span className="text-[10px] font-semibold text-white/90 leading-tight truncate">
          {agent.name}
        </span>
        <span className="text-[9px] leading-tight" style={{
          color: isGhost ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.45)",
          fontStyle: isGhost ? "italic" : undefined,
        }}>
          {isGhost ? (presence?.currentRoomId === MEETING_ROOM_ID ? "בחדר ישיבות" : "בחדר אחר") : activity}
        </span>
      </span>
    </button>
  );
}

// ── AgentChipsRow — with +N overflow ─────────────────────────────────────────

const MAX_CHIPS_PER_ROOM = 3;

function AgentChipsRow({
  presentAtHome, awayFromHome, presenceMap, onAgentSelect,
}: {
  presentAtHome: Agent[];
  awayFromHome: Agent[];
  presenceMap: Map<string, AgentPresence>;
  onAgentSelect: (a: Agent) => void;
}) {
  const homeVisible = presentAtHome.slice(0, MAX_CHIPS_PER_ROOM);
  const homeOverflow = presentAtHome.length - homeVisible.length;
  const ghostVisible = awayFromHome.slice(0, Math.max(0, MAX_CHIPS_PER_ROOM - homeVisible.length));

  return (
    <div className="flex flex-wrap gap-1.5">
      {homeVisible.map(a => (
        <AgentAvatarChip
          key={a.id}
          agent={a}
          presence={presenceMap.get(a.id)}
          variant="home"
          onClick={() => onAgentSelect(a)}
        />
      ))}
      {homeOverflow > 0 && (
        <div
          className="flex items-center px-2 py-1.5 rounded-lg text-[10px] font-semibold"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
        >
          +{homeOverflow}
        </div>
      )}
      {ghostVisible.map(a => (
        <AgentAvatarChip
          key={a.id}
          agent={a}
          presence={presenceMap.get(a.id)}
          variant="ghost"
        />
      ))}
    </div>
  );
}

// ── System Health Sidebar ─────────────────────────────────────────────────────

function SystemHealthSidebar({ summary, rooms, stats, presenceMap, scanStatuses }: {
  summary: ReturnType<typeof buildSystemHealthSummary>;
  rooms: DeptRoomConfig[];
  stats: Record<string, AgentStats>;
  presenceMap: Map<string, AgentPresence>;
  scanStatuses: Record<string, string>;
}) {
  const overallColor = summary.overall === "critical" ? "#f87171"
    : summary.overall === "warning" ? EK_GOLD
    : "#4ade80";

  return (
    <div className="flex flex-col gap-3" style={{ minWidth: 0 }}>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
        📊 בריאות מערכת
      </div>

      {/* Overall */}
      <div className="flex items-center justify-between rounded-lg px-3 py-2"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <span className="text-[10px] font-bold" style={{ color: overallColor }}>
          {summary.overall === "critical" ? "קריטי" : summary.overall === "warning" ? "אזהרה" : "תקין"}
        </span>
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>מצב כללי</span>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { val: summary.activeAgents, label: "סוכנים פעילים", color: "#4ade80", warn: false },
          { val: summary.inMeetingAgents, label: "בישיבות",  color: TEAL, warn: false },
          { val: summary.openTasks, label: "משימות", color: EK_GOLD, warn: summary.openTasks > 5 },
          { val: summary.criticalIssues, label: "קריטיות", color: "#f87171", warn: summary.criticalIssues > 0 },
          { val: summary.pendingApprovals, label: "ממתין אישור", color: "#fb923c", warn: summary.pendingApprovals > 2 },
          { val: summary.activeRooms, label: "חדרים פעילים", color: "rgba(255,255,255,0.6)", warn: false },
        ].map(({ val, label, color, warn }) => (
          <div key={label}
            className="rounded-lg px-2 py-2 text-center"
            style={{
              background: warn ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${warn ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.07)"}`,
            }}>
            <div className="text-lg font-black leading-none" style={{ color }}>{val}</div>
            <div className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Per-room status */}
      <div className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
        📡 חדרים
      </div>
      {rooms.map(room => {
        const status = deriveRoomStatus(room.agentIds, stats, presenceMap, scanStatuses);
        const color = status === "critical" ? "#f87171" : status === "warning" ? "#fb923c" : status === "waiting" ? EK_GOLD : status === "active" ? "#6eaaf4" : "#4ade80";
        const label = status === "critical" ? "קריטי" : status === "warning" ? "אזהרה" : status === "waiting" ? "ממתין" : status === "active" ? "פעיל" : "תקין";
        return (
          <div key={room.id}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-[11px] flex-shrink-0">{room.icon}</span>
            <span className="flex-1 text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>{room.titleHe}</span>
            <span className="text-[9px] font-semibold" style={{ color }}>{label}</span>
          </div>
        );
      })}

      {/* Last update */}
      <div className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
        {summary.totalAgents} סוכנים · {summary.activeRooms} חדרים פעילים
      </div>
    </div>
  );
}

// ── Activity Feed Sidebar ─────────────────────────────────────────────────────

function ActivityFeedSidebar({ events, loading }: {
  events: ActivityEvent[];
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2" style={{ minWidth: 0 }}>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
        📋 שיחת הסוכנים
      </div>
      <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>
        אירועי מערכת בזמן אמת
      </div>

      {loading && (
        <div className="text-center py-8 text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          טוען פעילות...
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="text-center py-8 px-4">
          <div className="text-3xl mb-2">📋</div>
          <div className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>אין פעילות אחרונה</div>
          <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
            הפעל סריקה כדי שהסוכנים יתחילו לדווח
          </div>
        </div>
      )}

      {events.map(ev => (
        <div
          key={ev.id}
          className="rounded-lg px-3 py-2.5 cursor-pointer transition-colors"
          style={{
            background: FEED_BG[ev.severity],
            border: `1px solid rgba(255,255,255,0.06)`,
            borderRight: `3px solid ${FEED_BORDER[ev.severity]}`,
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[13px] flex-shrink-0">{ev.agentIcon}</span>
            <span className="text-[10px] font-bold flex-1 truncate" style={{
              color: ev.severity === "critical" ? "#f87171" : ev.severity === "warn" ? EK_GOLD : ev.severity === "meeting" ? TEAL : ev.severity === "ok" ? "#4ade80" : "rgba(255,255,255,0.8)",
            }}>
              {ev.agentName}
            </span>
            <span className="text-[9px] flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
              {relativeTime(ev.time)}
            </span>
          </div>
          <div className="text-[11px] leading-snug mb-1" style={{ color: "rgba(255,255,255,0.8)" }}>
            {ev.text}
          </div>
          {ev.relatedEntity && (
            <div className="flex gap-1 flex-wrap">
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}>
                {ev.relatedEntity.type} {ev.relatedEntity.id}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Executive Control Card ────────────────────────────────────────────────────

function ExecutiveControlCard({
  agent, stats, presence, onSelect, onChat,
}: {
  agent: Agent | undefined;
  stats: AgentStats | undefined;
  presence: AgentPresence | undefined;
  onSelect: () => void;
  onChat: () => void;
}) {
  if (!agent) {
    return (
      <div className="rounded-xl p-4 text-center"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          מנהל פעילות ראשי לא נמצא במערכת
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4 cursor-pointer transition-all hover:brightness-105"
      style={{
        background: "linear-gradient(135deg, rgba(29,111,216,0.14) 0%, rgba(13,27,46,0.95) 100%)",
        border: "1.5px solid rgba(29,111,216,0.42)",
        boxShadow: "0 4px 32px rgba(29,111,216,0.07)",
      }}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Identity */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: "rgba(29,111,216,0.2)", border: "1.5px solid rgba(29,111,216,0.38)" }}>
            {agent.icon ?? "🏢"}
          </div>
          <div className="min-w-0">
            <div className="text-base font-black text-white tracking-tight">{agent.name}</div>
            <div className="text-[10px] mt-0.5" style={{ color: "#7ab0e8" }}>
              Operations Orchestrator · שכבת ניהול עליונה
            </div>
            <div className="text-[10px] mt-1.5 leading-relaxed max-w-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              {agent.description.split("。")[0]}
            </div>
          </div>
        </div>
        {/* Status + actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${PRESENCE_DOT[presence?.presenceStatus ?? "idle"]}`} />
            <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
              {PRESENCE_LABEL[presence?.presenceStatus ?? "idle"]}
            </span>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onChat(); }}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all"
            style={{ background: "rgba(29,111,216,0.18)", color: "#7ab0e8", border: "1px solid rgba(29,111,216,0.35)" }}
          >
            💬 שיחה
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        {[
          { val: stats?.openTasks ?? 0,          label: "משימות",        color: "#6eaaf4" },
          { val: stats?.criticalExceptions ?? 0,  label: "קריטיות",       color: "#f87171" },
          { val: stats?.pendingApprovals ?? 0,    label: "ממתין לאישור",  color: "#fb923c" },
          { val: stats?.openExceptions ?? 0,      label: "חריגות",        color: EK_GOLD },
        ].map(({ val, label, color }) => (
          <div key={label}
            className="rounded-lg px-3 py-2 text-center"
            style={{ background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-xl font-black" style={{ color: val > 0 ? color : "rgba(255,255,255,0.2)" }}>{val}</div>
            <div className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Meeting Room Strip ────────────────────────────────────────────────────────

function MeetingRoomStrip({
  meetings, agentMap, onMeetingOpen, onNewMeeting,
}: {
  meetings: AgentMeeting[];
  agentMap: Map<string, Agent>;
  onMeetingOpen: (m: AgentMeeting) => void;
  onNewMeeting: () => void;
}) {
  const active = meetings.filter(m => m.status === "active");

  return (
    <div className="rounded-xl p-3" style={{
      background: "rgba(45,212,191,0.04)",
      border: "1.5px solid rgba(45,212,191,0.25)",
    }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px]">📅</span>
          <span className="text-[11px] font-bold" style={{ color: TEAL }}>חדר ישיבות</span>
          {active.length > 0 && (
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: "rgba(45,212,191,0.15)", color: TEAL, border: "1px solid rgba(45,212,191,0.3)" }}>
              {active.length} {active.length === 1 ? "פגישה פעילה" : "פגישות פעילות"}
            </span>
          )}
        </div>
        <button
          onClick={onNewMeeting}
          className="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all hover:brightness-110"
          style={{ background: "rgba(29,111,216,0.12)", color: "#6eaaf4", border: "1px solid rgba(29,111,216,0.28)" }}
        >
          + פגישה חדשה
        </button>
      </div>

      {active.length === 0 ? (
        <div className="text-center py-3 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
          אין פגישות פעילות כרגע
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(active.length, 2)}, 1fr)` }}>
          {active.map(meeting => {
            const participants = meeting.participating_agents
              .slice(0, 5)
              .map(id => agentMap.get(id))
              .filter(Boolean) as Agent[];
            const overflow = meeting.participating_agents.length - participants.length;

            return (
              <button
                key={meeting.id}
                onClick={() => onMeetingOpen(meeting)}
                className="text-right rounded-lg p-3 transition-all hover:brightness-110 w-full"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(45,212,191,0.18)" }}
              >
                <div className="text-[11px] font-bold text-white mb-1 truncate">{meeting.title}</div>
                {meeting.topic && (
                  <div className="text-[10px] mb-2 truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{meeting.topic}</div>
                )}
                <div className="flex items-center gap-1 flex-wrap">
                  {participants.map(a => (
                    <span key={a.id} className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                      style={{ background: "rgba(45,212,191,0.1)", color: TEAL, border: "1px solid rgba(45,212,191,0.2)" }}>
                      {a.icon} {a.name}
                    </span>
                  ))}
                  {overflow > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: "rgba(255,255,255,0.35)" }}>
                      +{overflow}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Department Room Card ──────────────────────────────────────────────────────

function DepartmentRoomCard({
  room, status, aggregate, presentAtHome, awayFromHome, presenceMap, onAgentSelect, onRoomClick,
}: {
  room: DeptRoomConfig;
  status: RoomStatus;
  aggregate: RoomAggregate;
  presentAtHome: Agent[];
  awayFromHome: Agent[];
  presenceMap: Map<string, AgentPresence>;
  onAgentSelect: (a: Agent) => void;
  onRoomClick: () => void;
}) {
  const s = ROOM_STYLE[status];

  const statusLabel = status === "critical" ? "קריטי" : status === "warning" ? "אזהרה" : status === "waiting" ? "ממתין" : status === "active" ? "פעיל" : status === "inactive" ? "לא פעיל" : "תקין";
  const statusColor = status === "critical" ? "#f87171" : status === "warning" ? "#fb923c" : status === "waiting" ? EK_GOLD : status === "active" ? "#6eaaf4" : status === "inactive" ? "rgba(255,255,255,0.2)" : "#4ade80";

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2.5 cursor-pointer transition-all hover:brightness-105"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        boxShadow: s.shadow ?? "none",
        opacity: status === "inactive" ? 0.45 : 1,
      }}
      onClick={onRoomClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px] flex-shrink-0"
            style={{ background: `${room.accentColor}18`, border: `1px solid ${room.accentColor}30` }}>
            {room.icon}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-black text-white leading-tight">{room.titleHe}</div>
            <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>{room.titleEn}</div>
          </div>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}30` }}>
          {statusLabel}
        </span>
      </div>

      {/* Badges */}
      {(aggregate.openTasks > 0 || aggregate.criticalExceptions > 0 || aggregate.pendingApprovals > 0 || aggregate.openExceptions > 0) && (
        <div className="flex gap-1.5 flex-wrap">
          {aggregate.criticalExceptions > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(239,68,68,0.16)", color: "#f87171" }}>
              🔴 {aggregate.criticalExceptions} קריטי
            </span>
          )}
          {aggregate.pendingApprovals > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
              style={{ background: "rgba(249,115,22,0.14)", color: "#fb923c" }}>
              ⏳ {aggregate.pendingApprovals} אישורים
            </span>
          )}
          {aggregate.openExceptions > 0 && aggregate.criticalExceptions === 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(245,158,11,0.13)", color: EK_GOLD }}>
              ⚠ {aggregate.openExceptions} חריגות
            </span>
          )}
          {aggregate.openTasks > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(110,170,244,0.12)", color: "#6eaaf4" }}>
              📋 {aggregate.openTasks}
            </span>
          )}
        </div>
      )}
      {aggregate.openTasks === 0 && aggregate.criticalExceptions === 0 && aggregate.openExceptions === 0 && aggregate.pendingApprovals === 0 && (
        <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>✓ ללא בעיות</div>
      )}

      {/* Agent chips — stop propagation so clicking a chip opens agent, not room */}
      <div onClick={e => e.stopPropagation()}>
        <AgentChipsRow
          presentAtHome={presentAtHome}
          awayFromHome={awayFromHome}
          presenceMap={presenceMap}
          onAgentSelect={onAgentSelect}
        />
      </div>
    </div>
  );
}

// ── Active Agents Presence Bar ────────────────────────────────────────────────

function ActiveAgentsPresenceBar({
  agents, presenceMap, onAgentSelect,
}: {
  agents: Agent[];
  presenceMap: Map<string, AgentPresence>;
  onAgentSelect: (a: Agent) => void;
}) {
  return (
    <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap py-2 px-1">
      <span className="text-[9px] font-bold uppercase tracking-widest flex-shrink-0"
        style={{ color: "rgba(255,255,255,0.2)" }}>
        נוכחות:
      </span>
      <div className="w-px h-5 flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />

      {agents.map(agent => {
        const p = presenceMap.get(agent.id);
        const status = p?.presenceStatus ?? "idle";
        const inMeeting = status === "in_meeting";

        return (
          <button
            key={agent.id}
            onClick={() => onAgentSelect(agent)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 flex-shrink-0 transition-all hover:brightness-110"
            style={{
              background: inMeeting ? "rgba(45,212,191,0.07)" : status === "critical" ? "rgba(127,29,29,0.12)" : status === "waiting" ? "rgba(120,53,15,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${inMeeting ? "rgba(45,212,191,0.28)" : status === "critical" ? "rgba(239,68,68,0.35)" : status === "waiting" ? "rgba(245,158,11,0.28)" : "rgba(255,255,255,0.08)"}`,
              opacity: status === "idle" ? 0.6 : 1,
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRESENCE_DOT[status]}`} />
            <span className="text-[12px]">{agent.icon ?? "🤖"}</span>
            <span className="flex flex-col text-right leading-tight">
              <span className="text-[9px] font-semibold text-white whitespace-nowrap">{agent.name}</span>
              <span className="text-[8px] whitespace-nowrap" style={{
                color: inMeeting ? TEAL : status === "critical" ? "#f87171" : status === "waiting" ? EK_GOLD : "rgba(255,255,255,0.3)",
              }}>
                {inMeeting ? "📅 חדר ישיבות" : p?.currentActivity ?? PRESENCE_LABEL[status]}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Room Details Panel (local drawer) ─────────────────────────────────────────

function RoomDetailsPanel({
  room, status, aggregate, presentAtHome, awayFromHome, presenceMap, events, onClose, onAgentSelect,
}: {
  room: DeptRoomConfig;
  status: RoomStatus;
  aggregate: RoomAggregate;
  presentAtHome: Agent[];
  awayFromHome: Agent[];
  presenceMap: Map<string, AgentPresence>;
  events: ActivityEvent[];
  onClose: () => void;
  onAgentSelect: (a: Agent) => void;
}) {
  const statusLabel = status === "critical" ? "קריטי" : status === "warning" ? "אזהרה" : status === "waiting" ? "ממתין" : status === "active" ? "פעיל" : "תקין";

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative mr-auto w-full max-w-md flex flex-col shadow-2xl overflow-hidden"
        style={{ background: NAVY, borderRight: "1px solid rgba(255,255,255,0.1)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors mt-0.5">
            <CloseIcon />
          </button>
          <div className="text-right flex-1 mr-3">
            <div className="flex items-center justify-end gap-2 mb-1">
              <span className="text-lg font-black text-white">{room.titleHe}</span>
              <span className="text-xl">{room.icon}</span>
            </div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{room.titleEn}</div>
            <div className="text-[10px] mt-1 font-semibold" style={{ color: status === "critical" ? "#f87171" : EK_GOLD }}>
              {statusLabel}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {[
            { val: aggregate.openTasks,         label: "משימות",  color: "#6eaaf4" },
            { val: aggregate.criticalExceptions, label: "קריטיות", color: "#f87171" },
            { val: aggregate.pendingApprovals,   label: "אישורים", color: "#fb923c" },
          ].map(({ val, label, color }) => (
            <div key={label} className="text-center rounded-lg py-2" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-lg font-black" style={{ color: val > 0 ? color : "rgba(255,255,255,0.2)" }}>{val}</div>
              <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Agents */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {presentAtHome.length > 0 && (
            <div>
              <div className="text-[10px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>סוכנים בחדר</div>
              <div className="flex flex-col gap-1.5">
                {presentAtHome.map(a => (
                  <AgentAvatarChip key={a.id} agent={a} presence={presenceMap.get(a.id)} variant="home" onClick={() => { onAgentSelect(a); onClose(); }} />
                ))}
              </div>
            </div>
          )}
          {awayFromHome.length > 0 && (
            <div>
              <div className="text-[10px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>נמצאים בחדר אחר</div>
              <div className="flex flex-col gap-1.5">
                {awayFromHome.map(a => (
                  <AgentAvatarChip key={a.id} agent={a} presence={presenceMap.get(a.id)} variant="ghost" />
                ))}
              </div>
            </div>
          )}
          {presentAtHome.length === 0 && awayFromHome.length === 0 && (
            <div className="text-center py-4 text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              אין סוכנים משויכים לחדר זה
            </div>
          )}

          {/* Recent activity */}
          {events.length > 0 && (
            <div>
              <div className="text-[10px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>פעילות אחרונה</div>
              <div className="flex flex-col gap-2">
                {events.slice(0, 5).map(ev => (
                  <div key={ev.id} className="rounded-lg px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRight: `2px solid ${FEED_BORDER[ev.severity]}` }}>
                    <div className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>{ev.agentName}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{ev.text}</div>
                    <div className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>{relativeTime(ev.time)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl animate-pulse ${className}`}
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", minHeight: 100 }} />
  );
}

// ── Main DigitalHQ ────────────────────────────────────────────────────────────

export function DigitalHQ({
  agents, stats, scanStatuses, meetings, activityFeed = [], loading = false,
  onAgentSelect, onAgentChat, onMeetingOpen, onNewMeeting,
}: Props) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // ── Derived state (memoized) ─────────────────────────────────────────────
  const agentMap = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);

  const presenceMap = useMemo(
    () => computeAgentPresence(agents, meetings, stats, scanStatuses),
    [agents, meetings, stats, scanStatuses],
  );

  const systemHealth = useMemo(
    () => buildSystemHealthSummary(agents, stats, presenceMap),
    [agents, stats, presenceMap],
  );

  // Map real activity feed items
  const feedEvents = useMemo(
    () => activityFeed.map(item => mapFeedItem(item, agentMap)),
    [activityFeed, agentMap],
  );

  // Executive agent
  const execAgent = agentMap.get(EXECUTIVE_AGENT_ID);
  const execStats = stats[EXECUTIVE_AGENT_ID];
  const execPresence = presenceMap.get(EXECUTIVE_AGENT_ID);

  // Selected room data
  const selectedRoom = useMemo(
    () => DEPT_ROOMS.find(r => r.id === selectedRoomId) ?? null,
    [selectedRoomId],
  );

  const selectedRoomData = useMemo(() => {
    if (!selectedRoom) return null;
    const { presentAtHome, awayFromHome } = splitRoomAgents(selectedRoom.id, selectedRoom.agentIds, agentMap, presenceMap);
    const aggregate = aggregateRoomStats(selectedRoom.agentIds, stats);
    const status = deriveRoomStatus(selectedRoom.agentIds, stats, presenceMap, scanStatuses);
    const roomAgentIds = new Set(selectedRoom.agentIds);
    const roomEvents = feedEvents.filter(ev => roomAgentIds.has(ev.agentId));
    return { presentAtHome, awayFromHome, aggregate, status, roomEvents };
  }, [selectedRoom, agentMap, presenceMap, stats, scanStatuses, feedEvents]);

  // ── Loading state ────────────────────────────────────────────────────────
  // Only show skeletons on initial load (no data yet). Background refreshes
  // (e.g. post-scan) keep the existing UI mounted and update data in-place.
  if (loading && agents.length === 0) {
    return (
      <div dir="rtl" className="space-y-3">
        <SkeletonCard className="h-28" />
        <SkeletonCard className="h-20" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  // ── No agents state ──────────────────────────────────────────────────────
  if (agents.length === 0) {
    return (
      <div dir="rtl" className="text-center py-16">
        <div className="text-5xl mb-4">🏢</div>
        <div className="text-sm font-semibold text-white/60 mb-1">אין סוכנים פעילים</div>
        <div className="text-xs text-white/30 max-w-xs mx-auto leading-relaxed">
          הסוכנים טרם נוצרו במסד הנתונים. הפעל סריקה ראשונית או בדוק את הגדרות המערכת.
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="flex flex-col gap-0">

      {/* Presence bar — full width, above hierarchy */}
      <div className="px-4 pt-3 pb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <ActiveAgentsPresenceBar
          agents={agents}
          presenceMap={presenceMap}
          onAgentSelect={onAgentSelect}
        />
      </div>

      {/* Responsive layout: single column on mobile, 3-column on large screens */}
      <div
        className="flex flex-col lg:grid lg:gap-0"
        style={{ gridTemplateColumns: "minmax(180px, 210px) 1fr minmax(220px, 250px)" }}
      >

        {/* System Health — top on mobile, left column on desktop */}
        <div
          className="p-4 border-b border-white/[0.07] lg:border-b-0 lg:overflow-y-auto lg:min-h-0"
          style={{ borderLeft: "1px solid rgba(255,255,255,0.07)" }}
        >
          <SystemHealthSidebar
            summary={systemHealth}
            rooms={DEPT_ROOMS}
            stats={stats}
            presenceMap={presenceMap}
            scanStatuses={scanStatuses}
          />
        </div>

        {/* CENTER: Hierarchy — middle on mobile, center column on desktop */}
        <div className="p-4 flex flex-col gap-3 min-w-0">

          {/* 1. Executive card */}
          <ExecutiveControlCard
            agent={execAgent}
            stats={execStats}
            presence={execPresence}
            onSelect={() => execAgent && onAgentSelect(execAgent)}
            onChat={() => execAgent && onAgentChat(execAgent.id)}
          />

          {/* 2. Meeting Room */}
          <MeetingRoomStrip
            meetings={meetings}
            agentMap={agentMap}
            onMeetingOpen={onMeetingOpen}
            onNewMeeting={onNewMeeting}
          />

          {/* 3. Department grid label */}
          <div className="flex items-center gap-3 my-1">
            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
              מחלקות תפעוליות
            </div>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* 4. Department grid — 2 cols on mobile, 3 cols on sm+ */}
          {([1, 2, 3] as const).map(row => {
            const rowRooms = DEPT_ROOMS.filter(r => r.gridRow === row);
            return (
              <div key={row} className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {rowRooms.map(room => {
                  const status = deriveRoomStatus(room.agentIds, stats, presenceMap, scanStatuses);
                  const aggregate = aggregateRoomStats(room.agentIds, stats);
                  const { presentAtHome, awayFromHome } = splitRoomAgents(room.id, room.agentIds, agentMap, presenceMap);
                  return (
                    <DepartmentRoomCard
                      key={room.id}
                      room={room}
                      status={status}
                      aggregate={aggregate}
                      presentAtHome={presentAtHome}
                      awayFromHome={awayFromHome}
                      presenceMap={presenceMap}
                      onAgentSelect={onAgentSelect}
                      onRoomClick={() => setSelectedRoomId(room.id)}
                    />
                  );
                })}
              </div>
            );
          })}

        </div>

        {/* Activity Feed — bottom on mobile, right column on desktop.
            On desktop the outer div is a position:relative grid cell (no intrinsic height,
            so the grid row height is driven only by the center column). The inner div is
            position:absolute inset-0 so it fills whatever height the grid assigns, and
            overflow-y-auto creates internal scroll without stretching the page. */}
        <div
          className="border-t border-white/[0.07] lg:border-t-0 lg:relative"
          style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="p-4 max-h-[55vh] overflow-y-auto lg:absolute lg:inset-0 lg:max-h-none lg:overflow-y-auto">
            <ActivityFeedSidebar events={feedEvents} loading={loading} />
          </div>
        </div>
      </div>

      {/* Room Details Panel */}
      {selectedRoom && selectedRoomData && (
        <RoomDetailsPanel
          room={selectedRoom}
          status={selectedRoomData.status}
          aggregate={selectedRoomData.aggregate}
          presentAtHome={selectedRoomData.presentAtHome}
          awayFromHome={selectedRoomData.awayFromHome}
          presenceMap={presenceMap}
          events={selectedRoomData.roomEvents}
          onClose={() => setSelectedRoomId(null)}
          onAgentSelect={onAgentSelect}
        />
      )}
    </div>
  );
}
