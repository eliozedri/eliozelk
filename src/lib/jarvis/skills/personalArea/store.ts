import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/** Personal items persistence — reuses jarvis_master_items (personal_* kinds). */

export type PersonalKind = "personal_task" | "personal_note" | "personal_reminder" | "daily_report_request";

export async function createPersonalItem(args: {
  sourcePhone: string;
  kind: PersonalKind;
  body: string;
}): Promise<string | null> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("jarvis_master_items")
    .insert({ source_phone: args.sourcePhone, kind: args.kind, status: "pending", body: args.body, metadata: {} })
    .select("id")
    .single();
  if (error) {
    console.error("[jarvis:personal] createPersonalItem failed:", error.message);
    return null;
  }
  return String(data.id);
}

export interface PersonalRow {
  kind: PersonalKind;
  body: string;
  created_at: string;
}

export async function listOpenPersonal(sourcePhone: string, limit = 15): Promise<PersonalRow[]> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("jarvis_master_items")
    .select("kind, body, created_at")
    .eq("source_phone", sourcePhone)
    .in("kind", ["personal_task", "personal_note", "personal_reminder"])
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as PersonalRow[];
}
