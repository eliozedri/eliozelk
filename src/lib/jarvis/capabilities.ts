import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * Capability Requests — the structured record Jarvis files when it CANNOT answer verifiably because
 * a skill / data source / tool is missing, or when the owner explicitly asks to build a capability.
 * This is how Jarvis stays honest: instead of faking an answer or running an unrelated command, it
 * records exactly what is missing and routes it to the owning department. Best-effort insert.
 */

export interface CapabilityRequestInput {
  requestedBy: string;
  channel: string;
  originalMessage: string;
  interpretedIntent: string;
  kind: "skill_build" | "data_source" | "tool";
  missingSkillOrDataSource: string;
  targetAgent: string;
  priority?: "high" | "normal";
  recommendedNextStep?: string;
}

export async function createCapabilityRequest(input: CapabilityRequestInput): Promise<string | null> {
  const { data, error } = await getServiceSupabase()
    .from("jarvis_capability_requests")
    .insert({
      requested_by: input.requestedBy,
      channel: input.channel,
      original_message: (input.originalMessage ?? "").slice(0, 500),
      interpreted_intent: input.interpretedIntent,
      kind: input.kind,
      missing_skill_or_data_source: input.missingSkillOrDataSource,
      target_agent: input.targetAgent,
      priority: input.priority ?? "normal",
      status: "pending",
      recommended_next_step: input.recommendedNextStep ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[jarvis:capability] insert failed:", error.message);
    return null;
  }
  return String(data.id);
}
