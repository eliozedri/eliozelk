"use server";

import { getServiceSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
  return setStatus(id, { status: "needs_info", rejection_reason: note?.slice(0, 500) || null });
}

export async function archiveRequest(id: string): Promise<DecisionResult> {
  return setStatus(id, { status: "archived" });
}
