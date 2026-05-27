import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * Development task log (`jarvis_dev_tasks`). Every owner dev request is recorded — including the
 * generated Claude Code prompt and whether approval is required — so there is a trackable trail and
 * a future executor can pick approved tasks up. Best-effort insert; service-role only.
 */

export interface DevTaskInput {
  requestedBy: string;
  channel: string;
  projectId: string;
  originalMessage: string;
  interpretedIntent: string;
  riskLevel: string;
  selectedAction: string;
  approvalRequired: boolean;
  status: string; // prepared | blocked_needs_approval | pending
  recommendedNextStep: string;
  claudePrompt: string;
  repo?: string | null;
  githubActionAttempted?: boolean;
  issueUrl?: string | null;
}

export async function createDevTask(input: DevTaskInput): Promise<string | null> {
  const { data, error } = await getServiceSupabase()
    .from("jarvis_dev_tasks")
    .insert({
      requested_by: input.requestedBy,
      channel: input.channel,
      project_id: input.projectId,
      original_message: (input.originalMessage ?? "").slice(0, 1000),
      interpreted_intent: input.interpretedIntent,
      risk_level: input.riskLevel,
      selected_action: input.selectedAction,
      approval_required: input.approvalRequired,
      status: input.status,
      recommended_next_step: input.recommendedNextStep,
      claude_prompt: (input.claudePrompt ?? "").slice(0, 4000),
      repo: input.repo ?? null,
      github_action_attempted: input.githubActionAttempted ?? false,
      issue_url: input.issueUrl ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[jarvis:dev] createDevTask failed:", error.message);
    return null;
  }
  return String(data.id);
}
