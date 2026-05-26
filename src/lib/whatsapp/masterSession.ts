import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * Owner-menu conversation state, persisted per phone in whatsapp_sessions.
 * Mirrors the Telegram team_bot_sessions pattern. State is deliberately tiny — just
 * the current flow — so the menu stays simple and predictable.
 */

export type MasterFlow =
  | "idle"
  | "main_menu"
  | "orders_menu"
  | "orders_create_wait"
  | "ocr_wait"
  | "ceo_wait"
  | "personal_menu"
  | "personal_task_wait"
  | "personal_reminder_wait"
  | "personal_note_wait"
  | "personal_medical_wait"
  | "settings_menu";

export async function loadMasterFlow(phone: string): Promise<MasterFlow> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("whatsapp_sessions")
    .select("state")
    .eq("phone", phone)
    .maybeSingle();
  const flow = (data?.state as { flow?: MasterFlow } | null)?.flow;
  return flow ?? "idle";
}

export async function saveMasterFlow(phone: string, flow: MasterFlow): Promise<void> {
  const db = getServiceSupabase();
  await db.from("whatsapp_sessions").upsert(
    { phone, state: { flow }, updated_at: new Date().toISOString() },
    { onConflict: "phone" },
  );
}

export async function resetMasterFlow(phone: string): Promise<void> {
  await saveMasterFlow(phone, "idle");
}
