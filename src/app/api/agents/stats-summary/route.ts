import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { AgentStats } from "@/types/agent";

// ⚠️ SECURITY NOTE (audit 2026-05-29): this GET is intentionally UNAUTHENTICATED and
// returns aggregate per-agent counts (open tasks/exceptions/critical/approvals +
// "speaking"). CORS limits browser cross-origin reads but does NOT prevent direct
// curl/server access — treat the response as PUBLIC. It exposes no PII, order, or
// financial data. There are currently NO in-repo callers (likely an external
// "Neural Core" showcase feed). DECISION NEEDED: if no external consumer relies on
// it, gate with requireAuth; otherwise keep it but never add sensitive fields here.

// Active Neural Core agents — engineering-plan-agent intentionally excluded (future/out-of-core).
const ACTIVE_AGENT_IDS = [
  "ceo",
  "billing-collections-agent",
  "cfo-agent",
  "field-ops-agent",
  "inventory-agent",
  "graphics-production-agent",
  "catalog-pricing-agent",
  "coordination-qa-agent",
  "fabrication-agent",
] as const;

// CORS — allow the production domain and any localhost origin in development only.
const PROD_ORIGIN = "https://eliozelk.vercel.app";

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  if (origin === PROD_ORIGIN) return { "Access-Control-Allow-Origin": origin };
  if (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost:")) {
    return { "Access-Control-Allow-Origin": origin };
  }
  return {};
}

// Speaking indicator: agent is considered "speaking" if it has a recent activity_feed entry
// of a communication type within the last 60 seconds.
const COMM_TYPES = ["collaboration", "recommendation", "action_taken", "detection"] as const;
const SPEAKING_WINDOW_MS = 60_000;

type StatsLive = AgentStats & { speaking: boolean };

export async function OPTIONS(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...cors,
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  try {
    const db = getServiceSupabase();
    const since = new Date(Date.now() - SPEAKING_WINDOW_MS).toISOString();

    const [taskRes, excRes, apprRes, commRes] = await Promise.all([
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
      db
        .from("agent_activity_feed")
        .select("agent_id")
        .in("agent_id", [...ACTIVE_AGENT_IDS])
        .in("message_type", [...COMM_TYPES])
        .gte("created_at", since),
    ]);

    if (taskRes.error ?? excRes.error ?? apprRes.error) {
      const msg = taskRes.error?.message ?? excRes.error?.message ?? apprRes.error?.message;
      return NextResponse.json({ error: msg }, { status: 500, headers: cors });
    }

    const tasks      = taskRes.data  ?? [];
    const exc        = excRes.data   ?? [];
    const approvals  = apprRes.data  ?? [];
    // commRes failure is non-fatal — speaking defaults to false
    const recentComm = commRes.error ? [] : (commRes.data ?? []);

    const stats: Record<string, StatsLive> = {};
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
        speaking:           recentComm.some(c => c.agent_id === id),
      };
    }

    return NextResponse.json(stats, {
      headers: { ...cors, "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
