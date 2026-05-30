import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Human-review task emission for OCR / document uncertainty.
//
// SAFETY: this writes ONLY agent_tasks (review metadata). It never mutates a
// business record (supplier_documents fields, expense, fleet, billing). When OCR
// is uncertain the document is preserved and a tracked, assigned review task is
// created instead of silently dropping into a vague review state. Best-effort —
// a failure here must never fail the upload.
//
// Dedupe: keyed on (agent_id, related_entity_id, title) among open/in_progress
// tasks. The title is STABLE (no dynamic numbers) and related_entity_id is the
// document id, so re-processing the same document UPDATES the same task instead
// of spamming duplicates.

export interface OcrReviewTaskInput {
  documentId: string;
  /** Responsible agent id, e.g. "cfo-agent" (finance) or "equipment-fleet-agent". */
  owner: string;
  /** Stable title (no dynamic values) — part of the dedupe key. */
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "critical";
  recommendedAction: string;
  relatedEntityType?: string;
}

export async function upsertOcrReviewTask(db: SupabaseClient, input: OcrReviewTaskInput): Promise<void> {
  const relatedType = input.relatedEntityType ?? "supplier_document";
  try {
    const { data: existing } = await db
      .from("agent_tasks")
      .select("id")
      .eq("agent_id", input.owner)
      .eq("related_entity_id", input.documentId)
      .eq("title", input.title)
      .in("status", ["open", "in_progress"])
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await db
        .from("agent_tasks")
        .update({
          description: input.description,
          priority: input.priority,
          recommended_action: input.recommendedAction,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return;
    }

    await db.from("agent_tasks").insert({
      agent_id: input.owner,
      related_entity_type: relatedType,
      related_entity_id: input.documentId,
      title: input.title,
      description: input.description.slice(0, 1000),
      priority: input.priority,
      status: "open",
      recommended_action: input.recommendedAction,
      requires_approval: false,
      assigned_to: input.owner,
    });
  } catch {
    /* best-effort — review-task write must never fail the upload/OCR flow */
  }
}
