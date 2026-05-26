import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * CEO/Manager request persistence — reuses jarvis_master_items (kind='ceo_request').
 * The dispatcher owns the lifecycle: a request is created 'in_progress', then closed to
 * 'done' (executed read-only) or left 'pending' (queued for a human). Title/priority/channel
 * and the execution report live in metadata.
 */

export interface CeoRequestInput {
  sourcePhone: string;
  channel: string;
  text: string;
  title: string;
  priority: "high" | "normal";
  status?: "pending" | "in_progress";
}

export async function createCeoRequest(input: CeoRequestInput): Promise<string | null> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("jarvis_master_items")
    .insert({
      source_phone: input.sourcePhone,
      kind: "ceo_request",
      status: input.status ?? "in_progress",
      body: input.text,
      metadata: {
        title: input.title,
        priority: input.priority,
        channel: input.channel,
        dispatchedAt: new Date().toISOString(),
      },
    })
    .select("id")
    .single();
  if (error) {
    console.error("[jarvis:ceo] createCeoRequest failed:", error.message);
    return null;
  }
  return String(data.id);
}

/** Patch status and merge a report into metadata (extends, never overwrites the intake fields). */
export async function closeCeoRequest(
  id: string | null,
  patch: { status: string; report?: Record<string, unknown> },
): Promise<void> {
  if (!id) return;
  const db = getServiceSupabase();
  const { data: existing } = await db.from("jarvis_master_items").select("metadata").eq("id", id).maybeSingle();
  const metadata: Record<string, unknown> = {
    ...((existing?.metadata as Record<string, unknown>) ?? {}),
    completedAt: new Date().toISOString(),
  };
  if (patch.report) metadata.report = patch.report;
  await db
    .from("jarvis_master_items")
    .update({ status: patch.status, metadata, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export interface CeoRequestRow {
  id: string;
  title: string;
  priority: string;
  status: string;
  created_at: string;
}

/** Open requests = still pending OR being handled (in_progress). */
export async function listOpenCeoRequests(limit = 10): Promise<CeoRequestRow[]> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("jarvis_master_items")
    .select("id, body, metadata, status, created_at")
    .eq("kind", "ceo_request")
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as { title?: string; priority?: string };
    return {
      id: String(r.id),
      title: meta.title || String(r.body ?? "").slice(0, 80) || "(ללא כותרת)",
      priority: meta.priority || "normal",
      status: String(r.status ?? "pending"),
      created_at: String(r.created_at),
    };
  });
}
