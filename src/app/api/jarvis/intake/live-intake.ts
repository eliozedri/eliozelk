import type { SupabaseClient } from "@supabase/supabase-js";
import type { JarvisIntakeRequest } from "./intake-contract";

/**
 * Phase 2.0l — gated live-write path.
 *
 * Called from route.ts only after the three top-level safety gates
 * (JARVIS_INTAKE_LIVE, JARVIS_INTAKE_ALLOWED_ACTIONS, body.dry_run) all
 * align. Even then this function is fail-closed:
 *
 *   1. Idempotency: if a row with the same jarvis_request_id already
 *      exists in public.jarvis_intake_records, no second write happens.
 *      We return the existing recordId so the caller can answer
 *      `already_processed`.
 *
 *   2. Duplicate suspicion: a fresh look at public.work_orders for an
 *      OPEN row with the same customer name. If one exists, this
 *      function returns `duplicate_blocked` WITHOUT inserting anything
 *      into jarvis_intake_records.
 *
 *   3. Insert: into public.jarvis_intake_records ONLY. Never into
 *      work_orders, agent_tasks, customers, billing, schedules,
 *      inventory, or equipment. Future phases add a dispatcher that
 *      converts queued rows here into agent_tasks — that dispatcher
 *      does not exist yet.
 *
 * This module is intentionally pure-function-shaped so vitest can
 * inject a mocked Supabase client.
 */

export type LiveIntakeOutcome =
  | { kind: "queued"; recordId: string }
  | { kind: "already_processed"; recordId: string }
  | {
      kind: "duplicate_blocked";
      warning: string;
      relatedWorkOrderId: string | null;
    }
  | { kind: "failed"; reason: string };

export async function attemptLiveIntakeWrite(
  supabase: SupabaseClient,
  body: JarvisIntakeRequest,
): Promise<LiveIntakeOutcome> {
  // ── 1. Idempotency check ────────────────────────────────────────────────
  const existing = await supabase
    .from("jarvis_intake_records")
    .select("id,status")
    .eq("jarvis_request_id", body.request_id)
    .maybeSingle();
  if (existing.error) {
    return { kind: "failed", reason: existing.error.message.slice(0, 200) };
  }
  if (existing.data) {
    return { kind: "already_processed", recordId: String(existing.data.id) };
  }

  // ── 2. Duplicate suspicion via work_orders ──────────────────────────────
  // We only check when a customer name is present. The check is OPEN-only
  // (status not in completed/cancelled). A match returns duplicate_blocked
  // and we do NOT write to jarvis_intake_records.
  const customer = typeof body.extracted_entities?.customer === "string"
    ? (body.extracted_entities.customer as string).trim()
    : "";
  let relatedWorkOrderId: string | null = null;
  let duplicateWarning: string | null = null;
  if (customer.length > 0) {
    const dup = await supabase
      .from("work_orders")
      .select("id,order_number,status,city,order_date")
      .ilike("customer", customer)
      .not("status", "in", '("completed","cancelled")')
      .limit(1)
      .maybeSingle();
    if (dup.error) {
      return { kind: "failed", reason: dup.error.message.slice(0, 200) };
    }
    if (dup.data) {
      relatedWorkOrderId = String(dup.data.id);
      duplicateWarning =
        `open_order_for_same_customer:${dup.data.order_number ?? dup.data.id}`;
      return {
        kind: "duplicate_blocked",
        warning: duplicateWarning,
        relatedWorkOrderId,
      };
    }
  }

  // ── 3. Insert into jarvis_intake_records ────────────────────────────────
  const insert = await supabase
    .from("jarvis_intake_records")
    .insert({
      jarvis_request_id: body.request_id,
      source_channel: body.source_channel,
      source_sender_id: body.source_sender_id,
      source_message_text: body.source_message_text,
      jarvis_approval_id: body.owner_approval.jarvis_approval_id,
      recommended_action: body.recommended_action,
      intent_type: body.intent_type,
      life_domain: body.life_domain,
      extracted_entities: body.extracted_entities ?? {},
      payload: body,
      status: "queued",
      related_customer: customer.length > 0 ? customer : null,
      related_work_order_id: relatedWorkOrderId,
      notes: "phase 2.0l — live intake recorded; dispatcher to agent_tasks not wired yet",
    })
    .select("id")
    .single();

  if (insert.error || !insert.data) {
    // Idempotency race: another concurrent request inserted the same
    // jarvis_request_id between our check and our insert. Re-read it.
    if (insert.error?.code === "23505") {
      const reread = await supabase
        .from("jarvis_intake_records")
        .select("id")
        .eq("jarvis_request_id", body.request_id)
        .maybeSingle();
      if (reread.data) {
        return { kind: "already_processed", recordId: String(reread.data.id) };
      }
    }
    return {
      kind: "failed",
      reason: (insert.error?.message ?? "insert_failed").slice(0, 200),
    };
  }

  return { kind: "queued", recordId: String(insert.data.id) };
}
