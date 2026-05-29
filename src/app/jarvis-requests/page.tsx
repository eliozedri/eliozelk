import { getServiceSupabase } from "@/lib/supabase/server";
import { JarvisRequests, type JarvisRequestRow, type AgentCard } from "@/components/JarvisRequests";
import { capabilityRegistry } from "@/lib/jarvis/agentRoles";
import { getAgentContext } from "@/lib/jarvis/agentContext";

export const dynamic = "force-dynamic";

/**
 * /jarvis-requests — the Elkayam screen where the owner reviews and decides
 * tasks/requests sent by JARVIS to the CEO-Agent. Server component: reads the
 * pending-review queue; the client component renders the list + decision UI.
 * Decisions are status-only (see actions.ts) — no business mutation.
 */
export default async function JarvisRequestsPage() {
  let rows: JarvisRequestRow[] = [];
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("jarvis_ceo_agent_commands")
      .select(
        "id, correlation_id, requested_by, title, summary, full_request, action_type, target_department, target_role, risk_level, status, approval_required, approved_by, approved_at, rejection_reason, dry_run_summary, rollback_plan, payload_json, preview_json, execution_result, executed_at, conversation, last_message_type, reasoning_summary, routed_to_agent, llm_used, llm_provider, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    rows = (data ?? []) as JarvisRequestRow[];
  } catch {
    rows = [];
  }

  // Agent Capability Dashboard: each agent's registry capabilities + live read-only context.
  let agents: AgentCard[] = [];
  try {
    const supabase = getServiceSupabase();
    agents = await Promise.all(
      capabilityRegistry().map(async (a) => {
        const ctx = await getAgentContext(supabase, a.id);
        return {
          id: a.id, name: a.name, domain: a.domain,
          responsibilityScope: a.responsibilityScope,
          readableContextSources: a.readableContextSources,
          availableTools: a.availableTools,
          allowedActions: a.allowedActions,
          contextSummary: ctx.summary,
          contextAvailable: ctx.available,
        };
      }),
    );
  } catch {
    agents = [];
  }

  return <JarvisRequests rows={rows} agents={agents} />;
}
