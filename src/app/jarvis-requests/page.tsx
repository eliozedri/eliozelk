import { getServiceSupabase } from "@/lib/supabase/server";
import { JarvisRequests, type JarvisRequestRow } from "@/components/JarvisRequests";

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
        "id, correlation_id, requested_by, title, summary, full_request, action_type, target_department, target_role, risk_level, status, approval_required, approved_by, approved_at, rejection_reason, dry_run_summary, rollback_plan, payload_json, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    rows = (data ?? []) as JarvisRequestRow[];
  } catch {
    rows = [];
  }
  return <JarvisRequests rows={rows} />;
}
