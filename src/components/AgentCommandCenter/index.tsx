"use client";

import { useMemo, useState } from "react";
import { useAgentContext } from "@/context/AgentContext";
import type {
  Agent,
  AgentTask,
  AgentException,
  AgentApproval,
  AgentActivityFeedItem,
} from "@/types/agent";
import {
  AGENT_STATUS_LABELS,
  AGENT_STATUS_DOT,
  AUTONOMY_LEVEL_LABELS,
  AUTONOMY_LEVEL_COLORS,
  DEPARTMENT_LABELS,
  EXCEPTION_SEVERITY_LABELS,
  EXCEPTION_SEVERITY_COLORS,
  EXCEPTION_SEVERITY_DOT,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  RISK_LEVEL_LABELS,
  RISK_LEVEL_COLORS,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_COLORS,
  AGENT_ORG,
} from "@/types/agent";

// ── Colors ───────────────────────────────────────────────────────────────────
const NAVY = "#0d1b2e";
const NAVY_MID = "#1a2d4a";
const EK_BLUE = "#1d6fd8";
const EK_GOLD = "#f59e0b";

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  const h = diff / 3_600_000;
  if (m < 2) return "עכשיו";
  if (h < 1) return `לפני ${m} דקות`;
  if (h < 24) return `לפני ${Math.round(h)} שעות`;
  if (h < 48) return "אתמול";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function RefreshIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
}
function CheckIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function XIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function ChevronRightIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
}
function CloseIcon() {
  return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function EyeIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ value, label, sub, accent, onClick }: {
  value: number | string;
  label: string;
  sub?: string;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex-1 min-w-[110px] rounded-xl border border-white/10 p-4 text-right transition-all"
      style={{ backgroundColor: "rgba(255,255,255,0.04)", cursor: onClick ? "pointer" : "default" }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)"; }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.04)"; }}
    >
      <div className="text-3xl font-black leading-none mb-1" style={{ color: accent ?? "#ffffff" }}>
        {value}
      </div>
      <div className="text-xs font-semibold text-white/70">{label}</div>
      {sub && <div className="text-[10px] text-white/40 mt-0.5">{sub}</div>}
    </button>
  );
}

// ── Org Chart ────────────────────────────────────────────────────────────────

function OrgChart({ agents, onSelect }: { agents: Agent[]; onSelect: (a: Agent) => void }) {
  const byId = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);
  const root = byId.get("ops-orchestrator");
  const rootNode = AGENT_ORG[0];

  if (!root) return null;

  return (
    <div className="space-y-4">
      {/* CEO node */}
      <div className="flex justify-center">
        <div className="rounded-xl border border-white/20 px-4 py-2 text-center"
          style={{ backgroundColor: NAVY_MID }}>
          <div className="text-[10px] text-white/40 mb-0.5">מנהל ראשי / CEO</div>
          <div className="text-sm font-bold text-white">אלקיים סימון כבישים</div>
        </div>
      </div>

      {/* Connector */}
      <div className="flex justify-center">
        <div className="w-px h-6 bg-white/20" />
      </div>

      {/* Orchestrator */}
      <div className="flex justify-center">
        <button
          onClick={() => onSelect(root)}
          className="rounded-xl border-2 px-4 py-2 text-center transition-all hover:scale-105"
          style={{ borderColor: root.color ?? EK_BLUE, backgroundColor: `${root.color ?? EK_BLUE}20` }}
        >
          <div className="text-lg mb-0.5">{root.icon}</div>
          <div className="text-sm font-bold text-white">{root.name}</div>
          <div className="text-[10px] text-white/50">מתאם כל המחלקות</div>
        </button>
      </div>

      {/* Connector line */}
      <div className="flex justify-center">
        <div className="w-px h-4 bg-white/20" />
      </div>

      {/* Horizontal connector */}
      <div className="relative flex justify-center">
        <div className="absolute top-0 left-[12.5%] right-[12.5%] h-px bg-white/20" />
      </div>

      {/* Child agents grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {(rootNode.children ?? []).map(childId => {
          const agent = byId.get(childId);
          if (!agent) return null;
          return (
            <button
              key={childId}
              onClick={() => onSelect(agent)}
              className="rounded-xl border border-white/10 p-3 text-center transition-all hover:border-white/30 hover:scale-105"
              style={{ backgroundColor: `${agent.color ?? "#666"}15` }}
            >
              <div className="text-xl mb-1">{agent.icon}</div>
              <div className="text-xs font-semibold text-white leading-tight">{agent.name}</div>
              <div className="text-[10px] mt-1 px-1.5 py-0.5 rounded-full inline-block"
                style={{ backgroundColor: `${agent.color ?? "#666"}30`, color: agent.color ?? "#aaa" }}>
                {DEPARTMENT_LABELS[agent.department]}
              </div>
              {agent.autonomy_level === 0 && (
                <div className="text-[9px] text-white/30 mt-1">לא פעיל</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Agent Card ────────────────────────────────────────────────────────────────

function AgentCard({ agent, stats, onSelect }: {
  agent: Agent;
  stats: { openTasks: number; openExceptions: number; pendingApprovals: number; criticalExceptions: number };
  onSelect: () => void;
}) {
  const hasAlert = stats.criticalExceptions > 0 || stats.pendingApprovals > 0;

  return (
    <button
      onClick={onSelect}
      className="relative rounded-2xl border text-right w-full p-4 transition-all hover:scale-[1.02] group"
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        borderColor: hasAlert ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)",
      }}
    >
      {hasAlert && (
        <span className="absolute top-2 left-2 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${AGENT_STATUS_DOT[agent.status]}`} />
          <span className="text-[11px] text-white/50">{AGENT_STATUS_LABELS[agent.status]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-2xl">{agent.icon}</span>
          <ChevronRightIcon />
        </div>
      </div>

      <div className="text-sm font-bold text-white mb-0.5">{agent.name}</div>
      <div className="text-[11px] text-white/50 mb-3 line-clamp-2 leading-snug">{agent.description.split("。")[0]}</div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: `${agent.color ?? "#666"}25`, color: agent.color ?? "#aaa" }}>
          {DEPARTMENT_LABELS[agent.department]}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${AUTONOMY_LEVEL_COLORS[agent.autonomy_level]}`}>
          L{agent.autonomy_level} · {AUTONOMY_LEVEL_LABELS[agent.autonomy_level]}
        </span>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="rounded-lg py-1.5" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
          <div className="text-sm font-bold" style={{ color: stats.openTasks > 0 ? EK_GOLD : "rgba(255,255,255,0.4)" }}>
            {stats.openTasks}
          </div>
          <div className="text-[9px] text-white/30">משימות</div>
        </div>
        <div className="rounded-lg py-1.5" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
          <div className="text-sm font-bold" style={{ color: stats.openExceptions > 0 ? "#f97316" : "rgba(255,255,255,0.4)" }}>
            {stats.openExceptions}
          </div>
          <div className="text-[9px] text-white/30">חריגות</div>
        </div>
        <div className="rounded-lg py-1.5" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
          <div className="text-sm font-bold" style={{ color: stats.pendingApprovals > 0 ? "#ef4444" : "rgba(255,255,255,0.4)" }}>
            {stats.pendingApprovals}
          </div>
          <div className="text-[9px] text-white/30">אישורים</div>
        </div>
      </div>

      {/* Hover CTA */}
      <div className="mt-3 text-[10px] text-white/0 group-hover:text-white/40 transition-colors text-center">
        לחץ לפתיחת חדר הסוכן ←
      </div>
    </button>
  );
}

// ── Agent Room (slide-over) ───────────────────────────────────────────────────

type RoomTab = "tasks" | "exceptions" | "approvals" | "activity";

function AgentRoom({ agent, tasks, exceptions, approvals, activity, onClose, onApprove, onReject, onDismissException, onAcknowledgeException, onTaskStatus }: {
  agent: Agent;
  tasks: AgentTask[];
  exceptions: AgentException[];
  approvals: AgentApproval[];
  activity: AgentActivityFeedItem[];
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDismissException: (id: string) => void;
  onAcknowledgeException: (id: string) => void;
  onTaskStatus: (id: string, s: AgentTask["status"]) => void;
}) {
  const [tab, setTab] = useState<RoomTab>("tasks");

  const TABS: { id: RoomTab; label: string; count?: number }[] = [
    { id: "tasks", label: "משימות", count: tasks.length },
    { id: "exceptions", label: "חריגות", count: exceptions.length },
    { id: "approvals", label: "אישורים", count: approvals.length },
    { id: "activity", label: "פעילות" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative mr-auto w-full max-w-xl flex flex-col shadow-2xl overflow-hidden"
        style={{ backgroundColor: NAVY, borderRight: `1px solid ${NAVY_MID}` }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5" style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors p-1 mt-1 rounded">
            <CloseIcon />
          </button>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 mb-1">
              <span className="text-2xl">{agent.icon}</span>
              <h2 className="text-xl font-black text-white">{agent.name}</h2>
            </div>
            <div className="flex items-center justify-end gap-2 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${AUTONOMY_LEVEL_COLORS[agent.autonomy_level]}`}>
                L{agent.autonomy_level} · {AUTONOMY_LEVEL_LABELS[agent.autonomy_level]}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${agent.color ?? "#666"}25`, color: agent.color ?? "#aaa" }}>
                {DEPARTMENT_LABELS[agent.department]}
              </span>
              <div className="flex items-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-full ${AGENT_STATUS_DOT[agent.status]}`} />
                <span className="text-[11px] text-white/50">{AGENT_STATUS_LABELS[agent.status]}</span>
              </div>
            </div>
            <p className="text-xs text-white/50 mt-2 leading-relaxed max-w-xs">{agent.description}</p>
          </div>
        </div>

        {/* Scopes */}
        <div className="px-5 py-3 flex gap-3 flex-wrap" style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
          <div className="text-[10px] text-white/30">
            <span className="text-white/50 font-semibold">קריאה: </span>
            {agent.allowed_read_scopes.join(", ") || "—"}
          </div>
          <div className="text-[10px] text-white/30">
            <span className="text-white/50 font-semibold">כתיבה: </span>
            {agent.allowed_write_scopes.join(", ") || "—"}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-0" style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 pb-2 text-xs font-semibold transition-all relative"
              style={{ color: tab === t.id ? "white" : "rgba(255,255,255,0.4)" }}
            >
              {t.label}
              {(t.count ?? 0) > 0 && (
                <span className="mr-1 text-[9px] px-1 rounded-full"
                  style={{ backgroundColor: EK_GOLD + "33", color: EK_GOLD }}>
                  {t.count}
                </span>
              )}
              {tab === t.id && (
                <span className="absolute bottom-0 right-0 left-0 h-0.5 rounded-full" style={{ backgroundColor: EK_GOLD }} />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* ── Tasks tab ── */}
          {tab === "tasks" && (
            <>
              {tasks.length === 0
                ? <RoomEmptyState agent={agent} type="tasks" />
                : tasks.map(task => (
                  <div key={task.id} className="rounded-xl border border-white/8 p-4"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex gap-1">
                        <button onClick={() => onTaskStatus(task.id, "completed")}
                          className="text-green-400 hover:text-green-300 transition-colors p-1 rounded hover:bg-white/10" title="סמן כהושלמה">
                          <CheckIcon />
                        </button>
                        <button onClick={() => onTaskStatus(task.id, "dismissed")}
                          className="text-white/30 hover:text-white/60 transition-colors p-1 rounded hover:bg-white/10" title="בטל">
                          <XIcon />
                        </button>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-white">{task.title}</div>
                        {task.description && <div className="text-xs text-white/50 mt-0.5">{task.description}</div>}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${TASK_PRIORITY_COLORS[task.priority]}`}>
                        {TASK_PRIORITY_LABELS[task.priority]}
                      </span>
                      {task.requires_approval && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">דרוש אישור</span>
                      )}
                      {task.related_entity_type && (
                        <span className="text-[10px] text-white/30">{task.related_entity_type} · {task.related_entity_id}</span>
                      )}
                      <span className="text-[10px] text-white/30">{relativeTime(task.created_at)}</span>
                    </div>
                    {task.recommended_action && (
                      <div className="mt-2 text-[11px] text-white/50 border-r-2 pr-2" style={{ borderColor: agent.color ?? EK_BLUE }}>
                        פעולה מומלצת: {task.recommended_action}
                      </div>
                    )}
                  </div>
                ))
              }
            </>
          )}

          {/* ── Exceptions tab ── */}
          {tab === "exceptions" && (
            <>
              {exceptions.length === 0
                ? <RoomEmptyState agent={agent} type="exceptions" />
                : exceptions.map(exc => (
                  <div key={exc.id} className="rounded-xl border border-white/8 p-4"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex gap-1">
                        <button onClick={() => onAcknowledgeException(exc.id)}
                          className="text-blue-400 hover:text-blue-300 transition-colors p-1 rounded hover:bg-white/10" title="אישור קבלה">
                          <EyeIcon />
                        </button>
                        <button onClick={() => onDismissException(exc.id)}
                          className="text-white/30 hover:text-white/60 transition-colors p-1 rounded hover:bg-white/10" title="בטל">
                          <XIcon />
                        </button>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5 mb-1">
                          <span className={`w-2 h-2 rounded-full ${EXCEPTION_SEVERITY_DOT[exc.severity]}`} />
                          <span className="text-sm font-semibold text-white">{exc.title}</span>
                        </div>
                        {exc.description && <div className="text-xs text-white/50">{exc.description}</div>}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${EXCEPTION_SEVERITY_COLORS[exc.severity]}`}>
                        {EXCEPTION_SEVERITY_LABELS[exc.severity]}
                      </span>
                      <span className="text-[10px] text-white/30">{exc.category}</span>
                      {exc.status === "acknowledged" && (
                        <span className="text-[10px] text-blue-400">ידוע</span>
                      )}
                      <span className="text-[10px] text-white/30">{relativeTime(exc.created_at)}</span>
                    </div>
                    {exc.recommended_resolution && (
                      <div className="mt-2 text-[11px] text-white/50 border-r-2 pr-2" style={{ borderColor: agent.color ?? EK_BLUE }}>
                        פתרון מומלץ: {exc.recommended_resolution}
                      </div>
                    )}
                  </div>
                ))
              }
            </>
          )}

          {/* ── Approvals tab ── */}
          {tab === "approvals" && (
            <>
              {approvals.length === 0
                ? <RoomEmptyState agent={agent} type="approvals" />
                : approvals.map(appr => (
                  <div key={appr.id} className="rounded-xl border border-amber-500/20 p-4"
                    style={{ backgroundColor: "rgba(245,158,11,0.05)" }}>
                    <div className="text-right mb-3">
                      <div className="text-sm font-semibold text-white mb-1">{appr.action_type}</div>
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${RISK_LEVEL_COLORS[appr.risk_level]}`}>
                          סיכון: {RISK_LEVEL_LABELS[appr.risk_level]}
                        </span>
                        <span className="text-[10px] text-white/30">{relativeTime(appr.created_at)}</span>
                      </div>
                    </div>
                    {Object.keys(appr.action_payload).length > 0 && (
                      <div className="mb-3 text-[11px] text-white/40 bg-white/5 rounded-lg p-2 font-mono text-left" dir="ltr">
                        {JSON.stringify(appr.action_payload, null, 2)}
                      </div>
                    )}
                    <div className="flex gap-2 justify-start">
                      <button onClick={() => onReject(appr.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-red-500/15 text-red-400 hover:bg-red-500/30">
                        <XIcon /> דחה
                      </button>
                      <button onClick={() => onApprove(appr.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-green-500/15 text-green-400 hover:bg-green-500/30">
                        <CheckIcon /> אשר
                      </button>
                    </div>
                  </div>
                ))
              }
            </>
          )}

          {/* ── Activity tab ── */}
          {tab === "activity" && (
            <>
              {activity.length === 0
                ? <RoomEmptyState agent={agent} type="activity" />
                : activity.map(item => (
                  <div key={item.id} className="flex items-start gap-3 text-right">
                    <div className="text-[10px] text-white/30 pt-0.5 shrink-0 text-left w-16">
                      {relativeTime(item.created_at)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-end gap-1.5 mb-0.5">
                        <div className="text-xs text-white/80">{item.content}</div>
                        <span className={`text-[10px] font-semibold ${ACTIVITY_TYPE_COLORS[item.message_type]}`}>
                          {ACTIVITY_TYPE_LABELS[item.message_type]}
                        </span>
                      </div>
                      {item.related_entity_type && (
                        <div className="text-[10px] text-white/30">
                          {item.related_entity_type} · {item.related_entity_id}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              }
            </>
          )}
        </div>

        {/* Approval requirements footer */}
        {agent.requires_approval_for.length > 0 && (
          <div className="px-5 py-3" style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }}>
            <div className="text-[10px] text-white/30">
              <span className="text-white/50 font-semibold">דרוש אישור אנושי עבור: </span>
              {agent.requires_approval_for.join(" · ")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Room empty state ──────────────────────────────────────────────────────────

function RoomEmptyState({ agent, type }: { agent: Agent; type: string }) {
  const messages: Record<string, { title: string; body: string }> = {
    tasks:      { title: "אין משימות פתוחות", body: "הסוכן יצור משימות אוטומטיות בעת זיהוי בעיות תפעוליות — Phase 2" },
    exceptions: { title: "אין חריגות פתוחות", body: "הסוכן יזהה חריגות עסקיות כגון מלאי חסר, יומנים לא מושלמים, ותקיעות בתהליך" },
    approvals:  { title: "אין בקשות אישור ממתינות", body: "הסוכן יבקש אישור אנושי לפני ביצוע פעולות בעלות סיכון" },
    activity:   { title: "פעילות מינימלית", body: "כל פעולה, המלצה וזיהוי של הסוכן יופיעו כאן עם חתימת זמן" },
  };
  const msg = messages[type] ?? messages.tasks;

  return (
    <div className="text-center py-10 px-4">
      <div className="text-4xl mb-3">{agent.icon}</div>
      <div className="text-sm font-semibold text-white/60 mb-1">{msg.title}</div>
      <div className="text-xs text-white/30 max-w-xs mx-auto leading-relaxed">{msg.body}</div>
    </div>
  );
}

// ── Tasks full-page list ──────────────────────────────────────────────────────

function TasksPanel({ tasks, agents, onUpdate }: { tasks: AgentTask[]; agents: Agent[]; onUpdate: (id: string, s: AgentTask["status"]) => void }) {
  const byId = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);
  if (tasks.length === 0) {
    return (
      <div className="text-center py-20 text-white/30">
        <div className="text-5xl mb-4">✅</div>
        <div className="text-sm font-semibold">אין משימות פתוחות</div>
        <div className="text-xs mt-1">הסוכנים יצרו משימות כשיזהו בעיות — Phase 2</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {tasks.map(task => {
        const agent = byId.get(task.agent_id);
        return (
          <div key={task.id} className="rounded-xl border border-white/8 p-4"
            style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
            <div className="flex items-start justify-between">
              <div className="flex gap-1 shrink-0">
                <button onClick={() => onUpdate(task.id, "completed")}
                  className="text-green-400 hover:text-green-300 transition-colors p-1 rounded hover:bg-white/10">
                  <CheckIcon />
                </button>
                <button onClick={() => onUpdate(task.id, "dismissed")}
                  className="text-white/30 hover:text-white/60 transition-colors p-1 rounded hover:bg-white/10">
                  <XIcon />
                </button>
              </div>
              <div className="text-right flex-1 mr-2">
                <div className="text-sm font-semibold text-white mb-0.5">{task.title}</div>
                {task.description && <div className="text-xs text-white/50">{task.description}</div>}
                <div className="flex items-center justify-end gap-2 mt-2 flex-wrap">
                  {agent && (
                    <span className="text-[10px]" style={{ color: agent.color ?? "#aaa" }}>
                      {agent.icon} {agent.name}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${TASK_PRIORITY_COLORS[task.priority]}`}>
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </span>
                  {task.requires_approval && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">דרוש אישור</span>}
                  <span className="text-[10px] text-white/30">{relativeTime(task.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Exceptions panel ──────────────────────────────────────────────────────────

function ExceptionsPanel({ exceptions, agents, onDismiss, onAcknowledge }: {
  exceptions: AgentException[];
  agents: Agent[];
  onDismiss: (id: string) => void;
  onAcknowledge: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);
  if (exceptions.length === 0) {
    return (
      <div className="text-center py-20 text-white/30">
        <div className="text-5xl mb-4">🟢</div>
        <div className="text-sm font-semibold">אין חריגות פתוחות</div>
        <div className="text-xs mt-1">הסוכנים יזהו חריגות עסקיות ויציגו אותן כאן</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {exceptions.map(exc => {
        const agent = byId.get(exc.agent_id);
        return (
          <div key={exc.id} className="rounded-xl border border-white/8 p-4"
            style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
            <div className="flex items-start justify-between">
              <div className="flex gap-1 shrink-0">
                <button onClick={() => onAcknowledge(exc.id)}
                  className="text-blue-400 hover:text-blue-300 transition-colors p-1 rounded hover:bg-white/10" title="אישור קבלה">
                  <EyeIcon />
                </button>
                <button onClick={() => onDismiss(exc.id)}
                  className="text-white/30 hover:text-white/60 transition-colors p-1 rounded hover:bg-white/10">
                  <XIcon />
                </button>
              </div>
              <div className="text-right flex-1 mr-2">
                <div className="flex items-center justify-end gap-1.5 mb-0.5">
                  <span className={`w-2 h-2 rounded-full ${EXCEPTION_SEVERITY_DOT[exc.severity]}`} />
                  <div className="text-sm font-semibold text-white">{exc.title}</div>
                </div>
                {exc.description && <div className="text-xs text-white/50">{exc.description}</div>}
                {exc.recommended_resolution && (
                  <div className="mt-1 text-[11px] text-white/40 border-r-2 pr-2" style={{ borderColor: agent?.color ?? EK_BLUE }}>
                    {exc.recommended_resolution}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 mt-2 flex-wrap">
                  {agent && <span className="text-[10px]" style={{ color: agent.color ?? "#aaa" }}>{agent.icon} {agent.name}</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${EXCEPTION_SEVERITY_COLORS[exc.severity]}`}>
                    {EXCEPTION_SEVERITY_LABELS[exc.severity]}
                  </span>
                  <span className="text-[10px] text-white/30">{exc.category}</span>
                  <span className="text-[10px] text-white/30">{relativeTime(exc.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Approvals panel (global) ──────────────────────────────────────────────────

function ApprovalsPanel({ approvals, agents, onApprove, onReject }: {
  approvals: AgentApproval[];
  agents: Agent[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);
  if (approvals.length === 0) {
    return (
      <div className="text-center py-20 text-white/30">
        <div className="text-5xl mb-4">🔐</div>
        <div className="text-sm font-semibold">אין בקשות אישור ממתינות</div>
        <div className="text-xs mt-1">הסוכנים יבקשו אישור לפני פעולות בעלות סיכון עסקי</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {approvals.map(appr => {
        const agent = byId.get(appr.agent_id);
        return (
          <div key={appr.id} className="rounded-xl border border-amber-500/20 p-4"
            style={{ backgroundColor: "rgba(245,158,11,0.05)" }}>
            <div className="text-right mb-3">
              <div className="flex items-center justify-end gap-2 mb-1">
                {agent && <span className="text-[11px]" style={{ color: agent.color ?? "#aaa" }}>{agent.icon} {agent.name}</span>}
                <div className="text-sm font-semibold text-white">{appr.action_type}</div>
              </div>
              <div className="flex items-center justify-end gap-2 flex-wrap">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${RISK_LEVEL_COLORS[appr.risk_level]}`}>
                  סיכון: {RISK_LEVEL_LABELS[appr.risk_level]}
                </span>
                <span className="text-[10px] text-white/30">{relativeTime(appr.created_at)}</span>
              </div>
            </div>
            {Object.keys(appr.action_payload).length > 0 && (
              <div className="mb-3 text-[11px] text-white/40 bg-white/5 rounded-lg p-2 font-mono text-left" dir="ltr">
                {JSON.stringify(appr.action_payload, null, 2)}
              </div>
            )}
            <div className="flex gap-2 justify-start">
              <button onClick={() => onReject(appr.id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-red-500/15 text-red-400 hover:bg-red-500/30">
                <XIcon /> דחה
              </button>
              <button onClick={() => onApprove(appr.id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-green-500/15 text-green-400 hover:bg-green-500/30">
                <CheckIcon /> אשר
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Activity feed (global) ────────────────────────────────────────────────────

function ActivityPanel({ feed, agents }: { feed: AgentActivityFeedItem[]; agents: Agent[] }) {
  const byId = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);
  if (feed.length === 0) {
    return (
      <div className="text-center py-20 text-white/30">
        <div className="text-5xl mb-4">📋</div>
        <div className="text-sm font-semibold">ציר הפעילות יתחיל לאחר Phase 2</div>
        <div className="text-xs mt-1">כל זיהוי, המלצה ופעולה של הסוכנים יתועדו כאן</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {feed.map(item => {
        const agent = byId.get(item.agent_id);
        return (
          <div key={item.id} className="flex items-start gap-3 text-right py-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="text-[10px] text-white/30 pt-0.5 shrink-0 w-20 text-left">
              {relativeTime(item.created_at)}
            </div>
            <div className="flex-1">
              {agent && (
                <span className="text-[10px] font-semibold ml-1" style={{ color: agent.color ?? "#aaa" }}>
                  {agent.icon} {agent.name}:
                </span>
              )}
              <span className="text-xs text-white/70">{item.content}</span>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <span className={`text-[10px] font-semibold ${ACTIVITY_TYPE_COLORS[item.message_type]}`}>
                  {ACTIVITY_TYPE_LABELS[item.message_type]}
                </span>
                {item.related_entity_type && (
                  <span className="text-[10px] text-white/25">{item.related_entity_type}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Command Center ───────────────────────────────────────────────────────

type MainTab = "overview" | "tasks" | "exceptions" | "approvals" | "activity";

export function AgentCommandCenter() {
  const {
    agents, tasks, exceptions, approvals, activityFeed,
    agentStats, loading, refresh,
    updateApproval, dismissException, acknowledgeException, updateTaskStatus,
  } = useAgentContext();

  const [mainTab, setMainTab] = useState<MainTab>("overview");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // ── Global counts ──────────────────────────────────────────────────────────
  const totalOpenTasks        = tasks.length;
  const totalCriticalExc      = exceptions.filter(e => e.severity === "critical" && e.status === "open").length;
  const totalOpenExc          = exceptions.filter(e => e.status === "open").length;
  const totalPendingApprovals = approvals.length;
  const activeAgents          = agents.filter(a => a.status === "active").length;

  // ── Per-agent data for Room ────────────────────────────────────────────────
  const roomTasks       = selectedAgent ? tasks.filter(t => t.agent_id === selectedAgent.id) : [];
  const roomExceptions  = selectedAgent ? exceptions.filter(e => e.agent_id === selectedAgent.id) : [];
  const roomApprovals   = selectedAgent ? approvals.filter(a => a.agent_id === selectedAgent.id) : [];
  const roomActivity    = selectedAgent ? activityFeed.filter(f => f.agent_id === selectedAgent.id) : [];

  const MAIN_TABS: { id: MainTab; label: string; count?: number }[] = [
    { id: "overview",    label: "סקירה" },
    { id: "tasks",       label: "משימות",   count: totalOpenTasks },
    { id: "exceptions",  label: "חריגות",   count: totalOpenExc },
    { id: "approvals",   label: "אישורים",  count: totalPendingApprovals },
    { id: "activity",    label: "פעילות" },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: NAVY }} dir="rtl">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
        <div className="flex items-start justify-between mb-4">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors p-2 rounded-lg hover:bg-white/5 mt-1"
          >
            <RefreshIcon />
            {loading ? "טוען..." : "רענן"}
          </button>
          <div className="text-right">
            <div className="flex items-center justify-end gap-3 mb-1">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">מרכז פיקוד דיגיטלי</h1>
                <p className="text-xs font-medium" style={{ color: EK_GOLD }}>Digital Operations Command Center</p>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg"
                style={{ backgroundColor: `${EK_BLUE}33`, border: `1px solid ${EK_BLUE}50` }}>
                🤖
              </div>
            </div>
            <p className="text-xs text-white/40">מערכת בינה מלאכותית עסקית · אלקיים סימון כבישים בע״מ</p>
          </div>
        </div>

        {/* KPI Row */}
        <div className="flex gap-3 flex-wrap">
          <KpiCard
            value={agents.length}
            label="סוכנים מוגדרים"
            sub={activeAgents > 0 ? `${activeAgents} פעילים` : "ממתינים ל-Phase 2"}
            accent="rgba(255,255,255,0.9)"
          />
          <KpiCard
            value={totalOpenTasks}
            label="משימות פתוחות"
            sub="על פני כל הסוכנים"
            accent={totalOpenTasks > 0 ? EK_GOLD : "rgba(255,255,255,0.4)"}
            onClick={() => setMainTab("tasks")}
          />
          <KpiCard
            value={totalCriticalExc}
            label="חריגות קריטיות"
            sub={totalOpenExc > 0 ? `${totalOpenExc} סה״כ פתוחות` : "ללא חריגות"}
            accent={totalCriticalExc > 0 ? "#ef4444" : "rgba(255,255,255,0.4)"}
            onClick={() => setMainTab("exceptions")}
          />
          <KpiCard
            value={totalPendingApprovals}
            label="ממתינים לאישור"
            sub="פעולות שדורשות אישור אנושי"
            accent={totalPendingApprovals > 0 ? "#f97316" : "rgba(255,255,255,0.4)"}
            onClick={() => setMainTab("approvals")}
          />
          <KpiCard
            value={activityFeed.length}
            label="רשומות פעילות"
            sub="בפיד האחרון"
            accent="rgba(255,255,255,0.4)"
            onClick={() => setMainTab("activity")}
          />
        </div>
      </div>

      {/* ── Phase notice ────────────────────────────────────────────────────── */}
      {activeAgents === 0 && (
        <div className="mx-6 mt-4 rounded-xl border border-blue-500/20 px-4 py-3 flex items-start gap-3 text-right"
          style={{ backgroundColor: "rgba(29,111,216,0.08)" }}>
          <div className="mt-0.5 text-blue-400 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-blue-300 mb-0.5">Phase 1 — תשתית מוכנה</div>
            <div className="text-xs text-blue-400/70 leading-relaxed">
              כל 8 הסוכנים הוגדרו ומוכנים. Phase 2 יפעיל סריקות אוטומטיות שיזהו בעיות, ייצרו משימות וחריגות, ויבקשו אישורים לפעולות בסיכון. עד אז — המבנה הארגוני, טבלאות הנתונים, ומרכז הפיקוד מוכנים.
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 px-6 pt-4 pb-0" style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
        {MAIN_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setMainTab(t.id)}
            className="px-4 pb-3 text-sm font-semibold transition-all relative"
            style={{ color: mainTab === t.id ? "white" : "rgba(255,255,255,0.4)" }}
          >
            {t.label}
            {(t.count ?? 0) > 0 && (
              <span className="mr-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: EK_GOLD + "30", color: EK_GOLD }}>
                {t.count}
              </span>
            )}
            {mainTab === t.id && (
              <span className="absolute bottom-0 right-0 left-0 h-0.5 rounded-full" style={{ backgroundColor: EK_GOLD }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div className="p-6">

        {/* Overview: org chart + agent cards */}
        {mainTab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            {/* Org Chart */}
            <div className="xl:col-span-1">
              <div className="text-xs font-bold text-white/50 uppercase tracking-widest mb-4">מבנה ארגוני</div>
              {loading
                ? <div className="text-white/30 text-sm text-center py-10">טוען...</div>
                : <OrgChart agents={agents} onSelect={setSelectedAgent} />
              }

              {/* Autonomy legend */}
              <div className="mt-6 space-y-1.5">
                <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wider mb-2">רמות אוטונומיה</div>
                {[0,1,2,3].map(lvl => (
                  <div key={lvl} className="flex items-center justify-end gap-2">
                    <div className="text-[10px] text-white/40">{AUTONOMY_LEVEL_LABELS[lvl]}</div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${AUTONOMY_LEVEL_COLORS[lvl]}`}>L{lvl}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Agent Cards */}
            <div className="xl:col-span-2">
              <div className="text-xs font-bold text-white/50 uppercase tracking-widest mb-4">סוכנים</div>
              {loading
                ? <div className="text-white/30 text-sm text-center py-10">טוען...</div>
                : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {agents.map(agent => (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        stats={agentStats[agent.id] ?? { openTasks: 0, inProgressTasks: 0, openExceptions: 0, criticalExceptions: 0, pendingApprovals: 0 }}
                        onSelect={() => setSelectedAgent(agent)}
                      />
                    ))}
                  </div>
                )
              }
            </div>
          </div>
        )}

        {mainTab === "tasks" && (
          <TasksPanel tasks={tasks} agents={agents} onUpdate={updateTaskStatus} />
        )}

        {mainTab === "exceptions" && (
          <ExceptionsPanel
            exceptions={exceptions}
            agents={agents}
            onDismiss={dismissException}
            onAcknowledge={acknowledgeException}
          />
        )}

        {mainTab === "approvals" && (
          <ApprovalsPanel
            approvals={approvals}
            agents={agents}
            onApprove={id => updateApproval(id, "approved")}
            onReject={id => updateApproval(id, "rejected")}
          />
        )}

        {mainTab === "activity" && (
          <ActivityPanel feed={activityFeed} agents={agents} />
        )}
      </div>

      {/* ── Agent Room slide-over ──────────────────────────────────────────── */}
      {selectedAgent && (
        <AgentRoom
          agent={selectedAgent}
          tasks={roomTasks}
          exceptions={roomExceptions}
          approvals={roomApprovals}
          activity={roomActivity}
          onClose={() => setSelectedAgent(null)}
          onApprove={id => updateApproval(id, "approved")}
          onReject={id => updateApproval(id, "rejected")}
          onDismissException={dismissException}
          onAcknowledgeException={acknowledgeException}
          onTaskStatus={updateTaskStatus}
        />
      )}
    </div>
  );
}
