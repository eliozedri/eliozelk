import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * CEO/Manager request persistence — reuses jarvis_master_items (kind='ceo_request').
 * Stage 1 is a PENDING QUEUE: there is no CEO executor agent yet, so requests are stored
 * pending and never marked done by Jarvis. Title/priority/channel/links live in metadata.
 */

export interface CeoRequestInput {
  sourcePhone: string;
  channel: string;
  text: string;
  title: string;
  priority: "high" | "normal";
  linked?: Record<string, unknown>;
}

export async function createCeoRequest(input: CeoRequestInput): Promise<string | null> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("jarvis_master_items")
    .insert({
      source_phone: input.sourcePhone,
      kind: "ceo_request",
      status: "pending",
      body: input.text,
      metadata: { title: input.title, priority: input.priority, channel: input.channel, ...(input.linked ?? {}) },
    })
    .select("id")
    .single();
  if (error) {
    console.error("[jarvis:ceo] createCeoRequest failed:", error.message);
    return null;
  }
  return String(data.id);
}

export interface CeoRequestRow {
  id: string;
  title: string;
  priority: string;
  created_at: string;
}

export async function listOpenCeoRequests(limit = 10): Promise<CeoRequestRow[]> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("jarvis_master_items")
    .select("id, body, metadata, created_at")
    .eq("kind", "ceo_request")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as { title?: string; priority?: string };
    return {
      id: String(r.id),
      title: meta.title || String(r.body ?? "").slice(0, 80) || "(ללא כותרת)",
      priority: meta.priority || "normal",
      created_at: String(r.created_at),
    };
  });
}
