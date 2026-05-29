"use server";

import { getServiceSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getHandler } from "@/lib/jarvis/actionHandlers";
import { type CatalogRow, type CommandLike, type ExecDb } from "@/lib/jarvis/priceExecution";
import { notifyJarvis, type CeoEventStatus } from "@/lib/jarvis/notifyJarvis";

/** Fire a CEO-Agent → JARVIS callback (best-effort) so JARVIS DMs the owner in Telegram. */
async function notify(id: string, status: CeoEventStatus, message: string, needsAnswer: boolean): Promise<void> {
  try {
    const { data } = await getServiceSupabase()
      .from("jarvis_ceo_agent_commands")
      .select("correlation_id, title")
      .eq("id", id)
      .maybeSingle();
    if (!data?.correlation_id) return;
    await notifyJarvis({
      correlation_id: data.correlation_id as string,
      status,
      title: (data.title as string) ?? undefined,
      message,
      needs_answer: needsAnswer,
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Owner decisions on JARVIS CEO-Agent requests. STATUS-ONLY — these never
 * perform any catalog / pricing / finance / fleet / order business mutation.
 * "approve" marks a request approved for FUTURE / MANUAL execution; automatic
 * execution stays disabled (Tier-B, separately gated, not built).
 */

export type DecisionResult = { ok: boolean; error?: string };

async function setStatus(
  id: string,
  patch: Record<string, unknown>,
): Promise<DecisionResult> {
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("jarvis_ceo_agent_commands")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/jarvis-requests");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Approve = approved for manual/future execution. Auto-execution remains OFF. */
export async function approveRequest(id: string): Promise<DecisionResult> {
  return setStatus(id, {
    status: "approved",
    approved_by: "owner",
    approved_at: new Date().toISOString(),
  });
}

export async function rejectRequest(id: string, reason: string): Promise<DecisionResult> {
  return setStatus(id, { status: "rejected", rejection_reason: reason?.slice(0, 500) || "—" });
}

export async function needsInfoRequest(id: string, note: string): Promise<DecisionResult> {
  const r = await setStatus(id, { status: "needs_info", rejection_reason: note?.slice(0, 500) || null });
  // CEO-Agent asks the owner for clarification → JARVIS DMs me in Telegram and
  // waits for my reply (needs_answer:true closes the loop back to pending_review).
  if (r.ok) await notify(id, "needs_info", note?.trim() || "ה-CEO Agent צריך מידע נוסף כדי להמשיך.", true);
  return r;
}

export async function archiveRequest(id: string): Promise<DecisionResult> {
  return setStatus(id, { status: "archived" });
}

// ---------------------------------------------------------------------------
// Tier-B controlled execution. The ONLY mutation surface is catalog_items.default_price
// (via execDb.updatePrice). Gates: preview only from 'approved'; execute only from
// 'execution_approved' (the SECOND approval) with a stored preview; revert from 'executed'.
// ---------------------------------------------------------------------------

/** The single, reviewable mutation seam for Tier-B. Touches only catalog_items.default_price. */
function execDb(supabase: ReturnType<typeof getServiceSupabase>): ExecDb {
  return {
    async selectActiveCatalog() {
      const { data, error } = await supabase
        .from("catalog_items")
        .select("id,name,category,default_price")
        .eq("is_active", true);
      return { data: (data as CatalogRow[] | null) ?? null, error };
    },
    async updatePrice(id: string, price: number) {
      // STRICT: only the sell-price column is ever written.
      const { error } = await supabase.from("catalog_items").update({ default_price: price }).eq("id", id);
      return { error };
    },
  };
}

async function loadCommand(supabase: ReturnType<typeof getServiceSupabase>, id: string): Promise<CommandLike | null> {
  const { data } = await supabase
    .from("jarvis_ceo_agent_commands")
    .select("status, action_type, target_department, payload_json, preview_json, rollback_json")
    .eq("id", id)
    .maybeSingle();
  return (data as CommandLike | null) ?? null;
}

/** Step 1 of execution: dry-run preview (affected rows + rollback snapshot). No mutation. */
export async function generatePreview(id: string): Promise<DecisionResult> {
  try {
    const supabase = getServiceSupabase();
    const command = await loadCommand(supabase, id);
    if (!command) return { ok: false, error: "not_found" };
    if (command.status !== "approved") return { ok: false, error: "not_in_approved_state" };
    const handler = getHandler(command.action_type);
    if (!handler?.buildPreview) return { ok: false, error: "action_has_no_preview" };
    const res = await handler.buildPreview(execDb(supabase), command);
    if (!res.ok) return { ok: false, error: res.error };
    return setStatus(id, { status: "preview_ready", preview_json: res.preview, rollback_json: res.rollback });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Step 2: the SECOND approval — explicitly authorize execution of the previewed change. */
export async function approveExecution(id: string): Promise<DecisionResult> {
  const supabase = getServiceSupabase();
  const command = await loadCommand(supabase, id);
  if (!command) return { ok: false, error: "not_found" };
  if (command.status !== "preview_ready") return { ok: false, error: "no_preview_to_approve" };
  return setStatus(id, { status: "execution_approved", execution_approved_at: new Date().toISOString() });
}

/** Step 3: execute — only after preview + second approval. Mutates default_price only. */
export async function executeRequest(id: string): Promise<DecisionResult> {
  try {
    const supabase = getServiceSupabase();
    const command = await loadCommand(supabase, id);
    if (!command) return { ok: false, error: "not_found" };
    const handler = getHandler(command.action_type);
    if (!handler?.execute) return { ok: false, error: "action_not_executable" };
    const res = await handler.execute(execDb(supabase), command);
    if (!res.ok) return { ok: false, error: res.error };
    const allFailed = res.result.updated_count === 0 && res.result.failed_count > 0;
    const r = await setStatus(id, {
      status: allFailed ? "failed" : "executed",
      execution_result: res.result,
      executed_at: res.result.executed_at,
      executed_by: "owner",
    });
    // CEO-Agent reports the result back to JARVIS → JARVIS DMs me (no answer needed).
    if (r.ok) {
      await notify(
        id,
        allFailed ? "failed" : "executed",
        allFailed
          ? `הביצוע נכשל (${res.result.failed_count} נכשלו).`
          : `בוצע: ${res.result.updated_count} פריטים עודכנו.`,
        false,
      );
    }
    return r;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Revert an executed change using the stored rollback snapshot. */
export async function revertRequest(id: string): Promise<DecisionResult> {
  try {
    const supabase = getServiceSupabase();
    const command = await loadCommand(supabase, id);
    if (!command) return { ok: false, error: "not_found" };
    const handler = getHandler(command.action_type);
    if (!handler?.revert) return { ok: false, error: "action_not_revertible" };
    const res = await handler.revert(execDb(supabase), command);
    if (!res.ok) return { ok: false, error: res.error };
    return setStatus(id, { status: "reverted", reverted_at: new Date().toISOString() });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
