// Read-only agent diagnostic — master-gated. Surfaces the CURRENT persisted
// agent state (what scanners have produced) so the owner can verify scan output
// without running a scan and without exposing data publicly. NO mutation: it only
// reads agent_tasks / agent_exceptions / agents. (A would-create dry-run that runs
// detection without writing is a larger per-scanner change — documented separately.)

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { verifyMasterAuth } from "@/lib/agents/scan-utils";

export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string | undefined {
  const t = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return t.length > 0 ? t : undefined;
}

interface SampleTask {
  title: string;
  owner: string | null;
  priority: string | null;
  status: string;
  recommendedAction: string | null;
  related: string | null;
}
interface AgentDiag {
  id: string;
  name: string;
  status: string;
  lastRunAt: string | null;
  openExceptions: number;
  openTasks: number;
  unassignedTasks: number;
  sampleTasks: SampleTask[];
}

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const userId = await verifyMasterAuth(db, bearer(req));
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [agentsRes, tasksRes, excRes] = await Promise.all([
      db.from("agents").select("id, name, status, last_run_at").order("id"),
      db.from("agent_tasks")
        .select("agent_id, assigned_to, priority, status, title, recommended_action, related_entity_type, related_entity_id, updated_at")
        .in("status", ["open", "in_progress"])
        .order("updated_at", { ascending: false })
        .limit(500),
      db.from("agent_exceptions").select("agent_id, status").in("status", ["open", "acknowledged"]).limit(1000),
    ]);
    if (agentsRes.error) throw new Error(agentsRes.error.message);

    const tasks = tasksRes.data ?? [];
    const exc = excRes.data ?? [];

    const diag: AgentDiag[] = (agentsRes.data ?? []).map(a => {
      const id = a.id as string;
      const myTasks = tasks.filter(t => t.agent_id === id);
      return {
        id,
        name: (a.name as string) ?? id,
        status: (a.status as string) ?? "unknown",
        lastRunAt: (a.last_run_at as string) ?? null,
        openExceptions: exc.filter(e => e.agent_id === id).length,
        openTasks: myTasks.length,
        unassignedTasks: myTasks.filter(t => !t.assigned_to || String(t.assigned_to).trim() === "").length,
        sampleTasks: myTasks.slice(0, 5).map(t => ({
          title: (t.title as string) ?? "",
          owner: (t.assigned_to as string) ?? null,
          priority: (t.priority as string) ?? null,
          status: (t.status as string) ?? "open",
          recommendedAction: (t.recommended_action as string) ?? null,
          related: t.related_entity_id ? `${t.related_entity_type ?? "?"}:${t.related_entity_id}` : null,
        })),
      };
    });

    const totals = {
      openTasks: tasks.length,
      unassignedTasks: tasks.filter(t => !t.assigned_to || String(t.assigned_to).trim() === "").length,
      openExceptions: exc.length,
    };

    return NextResponse.json({ generatedAt: new Date().toISOString(), totals, agents: diag }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status: 500 });
  }
}
