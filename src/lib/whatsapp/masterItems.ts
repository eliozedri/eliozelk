import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * Owner-captured items (jarvis_master_items) + read helpers for the owner menu.
 * Nothing here auto-executes: items are pending records for a human or future
 * automation. We never claim an action was performed that wasn't.
 */

export type MasterItemKind =
  | "ceo_request"
  | "personal_task"
  | "personal_reminder"
  | "personal_note"
  | "personal_medical"
  | "daily_report_request"
  | "document";

export async function createMasterItem(args: {
  sourcePhone: string;
  kind: MasterItemKind;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("jarvis_master_items")
    .insert({
      source_phone: args.sourcePhone,
      kind: args.kind,
      body: args.body,
      status: "pending",
      metadata: args.metadata ?? {},
    })
    .select("id")
    .single();
  if (error) {
    console.error("[whatsapp:master] createMasterItem failed:", error.message);
    return null;
  }
  return String(data.id);
}

/** Summary of pending order drafts for the owner's "check pending drafts" view. */
export async function pendingDraftsSummary(limit = 5): Promise<{ count: number; lines: string[] }> {
  const db = getServiceSupabase();
  const { count } = await db
    .from("team_bot_order_drafts")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review");

  const { data } = await db
    .from("team_bot_order_drafts")
    .select("customer, source, created_at")
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(limit);

  const lines = (data ?? []).map((d) => {
    const who = d.customer || "ללא לקוח";
    const src =
      d.source === "whatsapp" ? "וואטסאפ"
      : d.source === "telegram_bot" ? "טלגרם"
      : d.source === "external_web_form" ? "טופס חיצוני"
      : d.source ?? "";
    return `• ${who}${src ? ` (${src})` : ""}`;
  });
  return { count: count ?? 0, lines };
}
