import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * Minimal external-customer wizard state, stored in whatsapp_sessions under a separate
 * `ext` field (master uses `flow`). A phone is only ever owner OR external, so the two
 * never collide. Only one state matters: "awaiting_details" (we sent the intro, now we
 * expect the order text). No migration — reuses the existing table.
 */

export async function isExternalAwaiting(phone: string): Promise<boolean> {
  const db = getServiceSupabase();
  const { data } = await db.from("whatsapp_sessions").select("state").eq("phone", phone).maybeSingle();
  return (data?.state as { ext?: string } | null)?.ext === "awaiting_details";
}

export async function setExternalAwaiting(phone: string): Promise<void> {
  const db = getServiceSupabase();
  await db.from("whatsapp_sessions").upsert(
    { phone, state: { ext: "awaiting_details" }, updated_at: new Date().toISOString() },
    { onConflict: "phone" },
  );
}

export async function clearExternalState(phone: string): Promise<void> {
  const db = getServiceSupabase();
  await db.from("whatsapp_sessions").upsert(
    { phone, state: {}, updated_at: new Date().toISOString() },
    { onConflict: "phone" },
  );
}
