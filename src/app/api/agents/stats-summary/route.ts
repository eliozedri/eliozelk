import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { AgentStats } from "@/types/agent";

// Active Neural Core agents — engineering-plan-agent intentionally excluded (future/out-of-core).
const ACTIVE_AGENT_IDS = [
  "ops-orchestrator",
  "billing-collections-agent",
  "cfo-agent",
  "field-ops-agent",
  "inventory-agent",
  "graphics-production-agent",
  "catalog-pricing-agent",
  "coordination-qa-agent",
  "fabrication-agent",
] as const;

// CORS header — permits the local brainstorm preview (any localhost port) to fetch live stats.
const CORS = { "Access-Control-Allow-Origin": "http://localhost:58394" };

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET() {
  try {
    const db = getServiceSupabase();

    const [taskRes, excRes, apprRes] = await Promise.all([
      db
        .from("agent_tasks")
        .select("agent_id, status")
        .in("status", ["open", "in_progress"])
        .in("agent_id", [...ACTIVE_AGENT_IDS]),
      db
        .from("agent_exceptions")
        .select("agent_id, status, severity")
        .in("status", ["open", "acknowledged"])
        .in("agent_id", [...ACTIVE_AGENT_IDS]),
      db
        .from("agent_approvals")
        .select("agent_id")
        .eq("approval_status", "pending")
        .in("agent_id", [...ACTIVE_AGENT_IDS]),
    ]);

    if (taskRes.error ?? excRes.error ?? apprRes.error) {
      const msg = taskRes.error?.message ?? excRes.error?.message ?? apprRes.error?.message;
      return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
    }

    const tasks    = taskRes.data  ?? [];
    const exc      = excRes.data   ?? [];
    const approvals = apprRes.data ?? [];

    const stats: Record<string, AgentStats> = {};
    for (const id of ACTIVE_AGENT_IDS) {
      const agTasks = tasks.filter(t => t.agent_id === id);
      const agExc   = exc.filter(e => e.agent_id === id);
      const agAppr  = approvals.filter(a => a.agent_id === id);
      stats[id] = {
        openTasks:          agTasks.filter(t => t.status === "open").length,
        inProgressTasks:    agTasks.filter(t => t.status === "in_progress").length,
        openExceptions:     agExc.filter(e => e.status === "open").length,
        criticalExceptions: agExc.filter(e => e.status === "open" && e.severity === "critical").length,
        pendingApprovals:   agAppr.length,
      };
    }

    return NextResponse.json(stats, {
      headers: { ...CORS, "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500, headers: CORS });
  }
}
