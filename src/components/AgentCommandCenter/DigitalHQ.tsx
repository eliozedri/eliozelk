"use client";

import { ROOMS, MEETING_ROOM, type RoomConfig } from "@/lib/agents/room-config";
import { AGENT_REGISTRY } from "@/lib/agents/agent-registry";
import type { Agent, AgentStats } from "@/types/agent";
import type { AgentMeeting } from "@/types/agentMeeting";

// ── Constants ─────────────────────────────────────────────────────────────────

const NAVY     = "#0d1b2e";
const NAVY_MID = "#1a2d4a";
const EK_BLUE  = "#1d6fd8";
const EK_GOLD  = "#f59e0b";

// ── Types ─────────────────────────────────────────────────────────────────────

type RoomStatus = "critical" | "warning" | "approval" | "active" | "normal";

// ── Status derivation ─────────────────────────────────────────────────────────

function deriveRoomStatus(
  room: RoomConfig,
  agentMap: Map<string, Agent>,
  stats: Record<string, AgentStats>,
  scanStatuses: Record<string, string>
): RoomStatus {
  for (const id of room.agentIds) {
    const stat = stats[id];
    if (!stat) continue;
    if (stat.criticalExceptions > 0) return "critical";
    if (stat.openExceptions > 0) return "warning";
    if (stat.pendingApprovals > 0) return "approval";
    if (scanStatuses[id] === "running") return "active";
  }
  return "normal";
}

const ROOM_STATUS_STYLE: Record<RoomStatus, { border: string; bg: string; glow?: string }> = {
  critical: { border: "rgba(239,68,68,0.5)", bg: "rgba(127,29,29,0.18)", glow: "rgba(239,68,68,0.12)" },
  warning:  { border: "rgba(245,158,11,0.45)", bg: "rgba(120,53,15,0.15)", glow: undefined },
  approval: { border: "rgba(249,115,22,0.45)", bg: "rgba(124,45,18,0.15)", glow: undefined },
  active:   { border: "rgba(29,111,216,0.5)", bg: "rgba(30,58,138,0.15)", glow: "rgba(29,111,216,0.1)" },
  normal:   { border: "rgba(255,255,255,0.1)", bg: "rgba(255,255,255,0.025)", glow: undefined },
};

const STATUS_DOT: Record<string, string> = {
  active:  "bg-green-400",
  idle:    "bg-gray-500",
  paused:  "bg-amber-400",
  error:   "bg-red-500",
};

// ── Agent node ────────────────────────────────────────────────────────────────

function AgentNode({
  agent,
  stat,
  scanRunning,
  onSelect,
  onChat,
}: {
  agent: Agent;
  stat: AgentStats;
  scanRunning: boolean;
  onSelect: () => void;
  onChat: () => void;
}) {
  const hasCritical = stat.criticalExceptions > 0;
  const hasExc = stat.openExceptions > 0;
  const hasApproval = stat.pendingApprovals > 0;

  return (
    <div
      className="rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.02] group"
      style={{
        backgroundColor: "rgba(255,255,255,0.04)",
        border: `1px solid ${hasCritical ? "rgba(239,68,68,0.4)" : hasExc ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.07)"}`,
      }}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0 relative"
          style={{ backgroundColor: `${agent.color ?? EK_BLUE}22`, border: `1px solid ${agent.color ?? EK_BLUE}33` }}
        >
          {agent.icon ?? "🤖"}
          {scanRunning && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse border border-[#0d1b2e]" />
          )}
          {!scanRunning && (hasCritical
            ? <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-[#0d1b2e]" />
            : hasApproval
            ? <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-400 border border-[#0d1b2e]" />
            : hasExc
            ? <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-[#0d1b2e]" />
            : null
          )}
        </div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-xs font-bold text-white/90 leading-tight truncate">{agent.name}</p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status] ?? "bg-gray-500"}`} />
            <span className="text-[10px] text-white/40">{agent.status === "active" ? "פעיל" : "מחכה"}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1.5">
        <div className="flex gap-1.5">
          {stat.openExceptions > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
              {stat.openExceptions} חריגות
            </span>
          )}
          {stat.pendingApprovals > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300">
              {stat.pendingApprovals} אישורים
            </span>
          )}
          {stat.openTasks > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300">
              {stat.openTasks} משימות
            </span>
          )}
          {stat.openExceptions === 0 && stat.pendingApprovals === 0 && stat.openTasks === 0 && (
            <span className="text-[10px] text-white/20">תקין</span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onChat(); }}
          className="opacity-0 group-hover:opacity-100 text-[10px] px-2 py-0.5 rounded-lg transition-all"
          style={{ backgroundColor: `${EK_BLUE}25`, color: EK_BLUE, border: `1px solid ${EK_BLUE}40` }}
        >
          שיחה
        </button>
      </div>
    </div>
  );
}

// ── Ghost node (agent not in DB yet) ─────────────────────────────────────────

function GhostNode({ agentId }: { agentId: string }) {
  const meta = AGENT_REGISTRY[agentId];
  return (
    <div
      className="rounded-xl p-3 opacity-35"
      style={{ border: "1px dashed rgba(255,255,255,0.12)", backgroundColor: "transparent" }}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base bg-white/5 shrink-0">
          {meta?.icon ?? "🤖"}
        </div>
        <div className="text-right flex-1">
          <p className="text-xs text-white/40">{meta?.label ?? agentId}</p>
          <p className="text-[10px] text-white/20">{meta?.shortDesc ?? "טרם הופעל"}</p>
        </div>
      </div>
    </div>
  );
}

// ── Room card ─────────────────────────────────────────────────────────────────

function RoomCard({
  room, status, agentMap, stats, scanStatuses,
  onAgentSelect, onAgentChat,
}: {
  room: RoomConfig;
  status: RoomStatus;
  agentMap: Map<string, Agent>;
  stats: Record<string, AgentStats>;
  scanStatuses: Record<string, string>;
  onAgentSelect: (agent: Agent) => void;
  onAgentChat: (agentId: string) => void;
}) {
  const style = ROOM_STATUS_STYLE[status];

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3 min-h-[140px] transition-all"
      style={{
        border: `1px solid ${style.border}`,
        backgroundColor: style.bg,
        boxShadow: style.glow ? `0 0 24px 0 ${style.glow}` : "none",
        gridColumn: room.gridColSpan && room.gridColSpan > 1 ? `span ${room.gridColSpan}` : undefined,
      }}
    >
      {/* Room header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === "critical" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-semibold">קריטי</span>
          )}
          {status === "warning" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">אזהרה</span>
          )}
          {status === "approval" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400">ממתין לאישור</span>
          )}
          {status === "active" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 animate-pulse">סורק</span>
          )}
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-sm font-bold text-white/90">{room.name}</span>
            <span className="text-base">{room.icon}</span>
          </div>
          <p className="text-[10px] text-white/30 mt-0.5">{room.nameEn}</p>
        </div>
      </div>

      {/* Agents */}
      <div className="flex flex-col gap-2">
        {room.agentIds.map(agentId => {
          const agent = agentMap.get(agentId);
          if (!agent) return <GhostNode key={agentId} agentId={agentId} />;
          return (
            <AgentNode
              key={agentId}
              agent={agent}
              stat={stats[agentId] ?? { openTasks: 0, inProgressTasks: 0, openExceptions: 0, criticalExceptions: 0, pendingApprovals: 0 }}
              scanRunning={scanStatuses[agentId] === "running"}
              onSelect={() => onAgentSelect(agent)}
              onChat={() => onAgentChat(agentId)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Meeting room card ─────────────────────────────────────────────────────────

function MeetingRoomCard({
  meetings,
  onMeetingOpen,
  onNewMeeting,
}: {
  meetings: AgentMeeting[];
  onMeetingOpen: (m: AgentMeeting) => void;
  onNewMeeting: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{
        border: "1px solid rgba(29,111,216,0.25)",
        backgroundColor: "rgba(30,58,138,0.08)",
        gridColumn: `span ${MEETING_ROOM.gridColSpan ?? 1}`,
      }}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={onNewMeeting}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
          style={{ backgroundColor: `${EK_BLUE}25`, color: EK_BLUE, border: `1px solid ${EK_BLUE}40` }}
        >
          + פגישה חדשה
        </button>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-sm font-bold text-white/90">{MEETING_ROOM.name}</span>
            <span className="text-base">{MEETING_ROOM.icon}</span>
          </div>
          <p className="text-[10px] text-white/30 mt-0.5">{MEETING_ROOM.nameEn}</p>
        </div>
      </div>

      {meetings.length === 0 ? (
        <p className="text-xs text-white/25 text-center py-3">אין פגישות פעילות</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {meetings.map(m => (
            <button
              key={m.id}
              onClick={() => onMeetingOpen(m)}
              className="text-right rounded-xl p-3 transition-all hover:scale-[1.01] w-full"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="text-xs font-bold text-white/90 truncate">{m.title}</p>
              {m.topic && <p className="text-[10px] text-white/40 mt-0.5 truncate">{m.topic}</p>}
              <p className="text-[10px] text-blue-400 mt-1">
                {m.participating_agents.length} סוכנים · פעיל
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main DigitalHQ ────────────────────────────────────────────────────────────

interface Props {
  agents: Agent[];
  stats: Record<string, AgentStats>;
  scanStatuses: Record<string, string>;
  meetings: AgentMeeting[];
  onAgentSelect: (agent: Agent) => void;
  onAgentChat: (agentId: string) => void;
  onMeetingOpen: (m: AgentMeeting) => void;
  onNewMeeting: () => void;
}

export function DigitalHQ({
  agents, stats, scanStatuses, meetings,
  onAgentSelect, onAgentChat, onMeetingOpen, onNewMeeting,
}: Props) {
  const agentMap = new Map(agents.map(a => [a.id, a]));
  const showMeetingRoom = true; // always show meeting room so new meetings can be created

  return (
    <div dir="rtl">
      {/* HQ Header */}
      <div className="flex items-center justify-end mb-5">
        <div className="text-right">
          <h2 className="text-base font-black text-white">משרד דיגיטלי</h2>
          <p className="text-[10px]" style={{ color: EK_GOLD }}>Elkayam Digital HQ</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 flex-wrap justify-end">
        {[
          { color: "rgb(239,68,68)", label: "קריטי" },
          { color: "rgb(245,158,11)", label: "אזהרה" },
          { color: "rgb(249,115,22)", label: "ממתין לאישור" },
          { color: "rgb(29,111,216)", label: "סריקה פעילה" },
          { color: "rgba(255,255,255,0.3)", label: "תקין" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-white/40">{label}</span>
          </div>
        ))}
      </div>

      {/* 2D Room Grid */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {/* Row 1: Management (span 2), Accounting, Finance */}
        {ROOMS.filter(r => r.gridRow === 1).map(room => {
          const status = deriveRoomStatus(room, agentMap, stats, scanStatuses);
          return (
            <RoomCard
              key={room.id}
              room={room}
              status={status}
              agentMap={agentMap}
              stats={stats}
              scanStatuses={scanStatuses}
              onAgentSelect={onAgentSelect}
              onAgentChat={onAgentChat}
            />
          );
        })}

        {/* Row 2: Field, Warehouse, Graphics, Catalog */}
        {ROOMS.filter(r => r.gridRow === 2).map(room => {
          const status = deriveRoomStatus(room, agentMap, stats, scanStatuses);
          return (
            <RoomCard
              key={room.id}
              room={room}
              status={status}
              agentMap={agentMap}
              stats={stats}
              scanStatuses={scanStatuses}
              onAgentSelect={onAgentSelect}
              onAgentChat={onAgentChat}
            />
          );
        })}

        {/* Row 3: Engineering + Meeting Room */}
        {ROOMS.filter(r => r.gridRow === 3).map(room => {
          const status = deriveRoomStatus(room, agentMap, stats, scanStatuses);
          return (
            <RoomCard
              key={room.id}
              room={room}
              status={status}
              agentMap={agentMap}
              stats={stats}
              scanStatuses={scanStatuses}
              onAgentSelect={onAgentSelect}
              onAgentChat={onAgentChat}
            />
          );
        })}
        {showMeetingRoom && (
          <MeetingRoomCard
            meetings={meetings}
            onMeetingOpen={onMeetingOpen}
            onNewMeeting={onNewMeeting}
          />
        )}
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-white/15 text-center mt-4">
        הצגת נתונים אמיתיים בלבד · לחץ על סוכן כדי לפתוח את חדרו · לחץ &quot;שיחה&quot; כדי לשוחח
      </p>
    </div>
  );
}
