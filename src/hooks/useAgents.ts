"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/clientApi";
import type {
  Agent,
  AgentTask,
  AgentException,
  AgentApproval,
  AgentActivityFeedItem,
  AgentStats,
  ApprovalStatus,
  ExceptionStatus,
  TaskStatus,
} from "@/types/agent";

// ── Row mappers ───────────────────────────────────────────────────────────────

function agentFromRow(r: Record<string, unknown>): Agent {
  return {
    id:                    r.id as string,
    name:                  r.name as string,
    type:                  r.type as Agent["type"],
    department:            r.department as Agent["department"],
    description:           (r.description as string) || "",
    autonomy_level:        (r.autonomy_level as number) ?? 1,
    allowed_read_scopes:   (r.allowed_read_scopes as string[]) || [],
    allowed_write_scopes:  (r.allowed_write_scopes as string[]) || [],
    requires_approval_for: (r.requires_approval_for as string[]) || [],
    status:                (r.status as Agent["status"]) || "idle",
    icon:                  (r.icon as string) || undefined,
    color:                 (r.color as string) || undefined,
    last_run_at:           (r.last_run_at as string) || null,
    created_at:            r.created_at as string,
    updated_at:            r.updated_at as string,
  };
}

function taskFromRow(r: Record<string, unknown>): AgentTask {
  return {
    id:                   r.id as string,
    agent_id:             r.agent_id as string,
    related_entity_type:  (r.related_entity_type as string) || undefined,
    related_entity_id:    (r.related_entity_id as string) || undefined,
    title:                r.title as string,
    description:          (r.description as string) || "",
    priority:             (r.priority as AgentTask["priority"]) || "normal",
    status:               (r.status as AgentTask["status"]) || "open",
    recommended_action:   (r.recommended_action as string) || undefined,
    requires_approval:    (r.requires_approval as boolean) || false,
    assigned_to:          (r.assigned_to as string) || undefined,
    due_date:             (r.due_date as string) || undefined,
    created_at:           r.created_at as string,
    updated_at:           r.updated_at as string,
  };
}

function exceptionFromRow(r: Record<string, unknown>): AgentException {
  return {
    id:                     r.id as string,
    agent_id:               r.agent_id as string,
    severity:               (r.severity as AgentException["severity"]) || "warn",
    category:               r.category as string,
    related_entity_type:    (r.related_entity_type as string) || undefined,
    related_entity_id:      (r.related_entity_id as string) || undefined,
    title:                  r.title as string,
    description:            (r.description as string) || "",
    detected_from_data:     (r.detected_from_data as Record<string, unknown>) || undefined,
    recommended_resolution: (r.recommended_resolution as string) || undefined,
    status:                 (r.status as AgentException["status"]) || "open",
    created_at:             r.created_at as string,
    updated_at:             r.updated_at as string,
  };
}

function approvalFromRow(r: Record<string, unknown>): AgentApproval {
  return {
    id:                 r.id as string,
    agent_id:           r.agent_id as string,
    task_id:            (r.task_id as string) || undefined,
    action_type:        r.action_type as string,
    action_payload:     (r.action_payload as Record<string, unknown>) || {},
    risk_level:         (r.risk_level as AgentApproval["risk_level"]) || "medium",
    requested_by_agent: r.requested_by_agent as string,
    approval_status:    (r.approval_status as AgentApproval["approval_status"]) || "pending",
    approved_by:        (r.approved_by as string) || undefined,
    approved_at:        (r.approved_at as string) || undefined,
    rejected_reason:    (r.rejected_reason as string) || undefined,
    created_at:         r.created_at as string,
    updated_at:         r.updated_at as string,
  };
}

function activityFromRow(r: Record<string, unknown>): AgentActivityFeedItem {
  return {
    id:                   r.id as string,
    agent_id:             r.agent_id as string,
    related_agent_id:     (r.related_agent_id as string) || undefined,
    related_entity_type:  (r.related_entity_type as string) || undefined,
    related_entity_id:    (r.related_entity_id as string) || undefined,
    message_type:         (r.message_type as AgentActivityFeedItem["message_type"]) || "status_change",
    content:              r.content as string,
    structured_payload:   (r.structured_payload as Record<string, unknown>) || undefined,
    created_at:           r.created_at as string,
  };
}

// ── Hook return value ─────────────────────────────────────────────────────────

export interface AgentsHookValue {
  agents: Agent[];
  tasks: AgentTask[];
  exceptions: AgentException[];
  approvals: AgentApproval[];
  activityFeed: AgentActivityFeedItem[];
  agentStats: Record<string, AgentStats>;
  loading: boolean;
  refresh: () => void;
  updateApproval: (id: string, status: ApprovalStatus, reason?: string) => Promise<void>;
  dismissException: (id: string) => Promise<void>;
  acknowledgeException: (id: string) => Promise<void>;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  assignTask: (id: string, assignedTo: string | null) => Promise<void>;
}

// ── Helper: compute per-agent stats ──────────────────────────────────────────

function buildAgentStats(
  tasks: AgentTask[],
  exceptions: AgentException[],
  approvals: AgentApproval[],
  agentIds: string[]
): Record<string, AgentStats> {
  const stats: Record<string, AgentStats> = {};
  for (const id of agentIds) {
    const agTasks   = tasks.filter(t => t.agent_id === id);
    const agExc     = exceptions.filter(e => e.agent_id === id);
    const agAppr    = approvals.filter(a => a.agent_id === id);
    stats[id] = {
      openTasks:          agTasks.filter(t => t.status === "open").length,
      inProgressTasks:    agTasks.filter(t => t.status === "in_progress").length,
      openExceptions:     agExc.filter(e => e.status === "open").length,
      criticalExceptions: agExc.filter(e => e.status === "open" && e.severity === "critical").length,
      pendingApprovals:   agAppr.filter(a => a.approval_status === "pending").length,
    };
  }
  return stats;
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useAgents(): AgentsHookValue {
  const [agents, setAgents]           = useState<Agent[]>([]);
  const [tasks, setTasks]             = useState<AgentTask[]>([]);
  const [exceptions, setExceptions]   = useState<AgentException[]>([]);
  const [approvals, setApprovals]     = useState<AgentApproval[]>([]);
  const [activityFeed, setActivity]   = useState<AgentActivityFeedItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const versionRef                    = useRef(0);
  const initialLoadDone               = useRef(false);

  const load = useCallback(async () => {
    const db = getSupabase();
    if (!db) return;

    const v = ++versionRef.current;
    // Only show loading skeleton on the very first load — background refreshes
    // (e.g. post-scan) update data in-place without blanking the UI.
    if (!initialLoadDone.current) setLoading(true);

    const [agRes, taskRes, excRes, apprRes, actRes] = await Promise.all([
      db.from("agents").select("*").order("created_at"),
      db.from("agent_tasks").select("*").in("status", ["open", "in_progress"]).order("created_at", { ascending: false }).limit(200),
      db.from("agent_exceptions").select("*").in("status", ["open", "acknowledged"]).order("created_at", { ascending: false }).limit(200),
      db.from("agent_approvals").select("*").eq("approval_status", "pending").order("created_at", { ascending: false }),
      db.from("agent_activity_feed").select("*").order("created_at", { ascending: false }).limit(100),
    ]);

    if (v !== versionRef.current) return;

    const agentList   = (agRes.data  ?? []).map(agentFromRow);
    const taskList    = (taskRes.data ?? []).map(taskFromRow);
    const excList     = (excRes.data  ?? []).map(exceptionFromRow);
    const apprList    = (apprRes.data ?? []).map(approvalFromRow);
    const actList     = (actRes.data  ?? []).map(activityFromRow);

    setAgents(agentList);
    setTasks(taskList);
    setExceptions(excList);
    setApprovals(apprList);
    setActivity(actList);
    initialLoadDone.current = true;
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const agentStats = buildAgentStats(tasks, exceptions, approvals, agents.map(a => a.id));

  // Control-table writes go through the server (role-gated + audited) so these
  // tables can be locked to service-role only. See /api/agents/control.
  const updateApproval = useCallback(async (id: string, status: ApprovalStatus, reason?: string) => {
    await authedFetch("/api/agents/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "approval", id, status, reason }),
    });
    await load();
  }, [load]);

  const dismissException = useCallback(async (id: string) => {
    const res = await authedFetch("/api/agents/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "exception_dismiss", id }),
    });
    if (res.ok) setExceptions(prev => prev.filter(e => e.id !== id));
  }, []);

  const acknowledgeException = useCallback(async (id: string) => {
    const res = await authedFetch("/api/agents/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "exception_ack", id }),
    });
    if (res.ok) setExceptions(prev => prev.map(e => e.id === id ? { ...e, status: "acknowledged" as ExceptionStatus } : e));
  }, []);

  const updateTaskStatus = useCallback(async (id: string, status: TaskStatus) => {
    const res = await authedFetch("/api/agents/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "task_status", id, status }),
    });
    if (!res.ok) return;
    if (status === "completed" || status === "dismissed") {
      setTasks(prev => prev.filter(t => t.id !== id));
    } else {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    }
  }, []);

  // Persistent task assignment (server-gated + audited). Pass null to unassign.
  const assignTask = useCallback(async (id: string, assignedTo: string | null) => {
    const res = await authedFetch("/api/agents/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "task_assign", id, assignedTo }),
    });
    if (res.ok) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, assigned_to: assignedTo ?? undefined } : t));
    }
  }, []);

  return {
    agents, tasks, exceptions, approvals, activityFeed,
    agentStats, loading, refresh: load,
    updateApproval, dismissException, acknowledgeException, updateTaskStatus, assignTask,
  };
}
