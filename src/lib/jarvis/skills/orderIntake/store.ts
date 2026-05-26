import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { OrderItem } from "./state";

/**
 * Order Intake persistence.
 *
 * Session state (the active draft pointer) lives in whatsapp_sessions under `state.order`;
 * the order itself IS a team_bot_order_drafts row (Option-2: created early, edited in
 * place, never auto-promoted to a work_order). Confirmation sets a flag only — status
 * stays 'pending_review' so the office review queue still shows it.
 */

export interface OrderSession {
  draftId?: string;
  awaiting?: boolean;
}

export async function loadOrderSession(senderId: string): Promise<OrderSession> {
  const db = getServiceSupabase();
  const { data } = await db.from("whatsapp_sessions").select("state").eq("phone", senderId).maybeSingle();
  return ((data?.state as { order?: OrderSession } | null)?.order ?? {}) as OrderSession;
}

export async function saveOrderSession(senderId: string, order: OrderSession): Promise<void> {
  const db = getServiceSupabase();
  await db.from("whatsapp_sessions").upsert(
    { phone: senderId, state: { order }, updated_at: new Date().toISOString() },
    { onConflict: "phone" },
  );
}

export async function clearOrderSession(senderId: string): Promise<void> {
  await saveOrderSession(senderId, {});
}

function toCart(items: OrderItem[]) {
  return items.map((it) => ({ name: it.name, quantity: it.quantity, unit: null, notes: null }));
}

export async function createOrderDraft(args: {
  senderId: string;
  contactName: string | null;
  items: OrderItem[];
  messageId: string;
}): Promise<string | null> {
  const db = getServiceSupabase();
  const externalRef = `wa:${args.messageId}`;

  const { data, error } = await db
    .from("team_bot_order_drafts")
    .insert({
      telegram_user_id: null,
      submitted_by_name: args.contactName ?? args.senderId,
      customer: args.contactName,
      customer_phone: args.senderId,
      contact_person: args.contactName,
      notes: null,
      cart: toCart(args.items),
      source: "whatsapp",
      intake_channel: "whatsapp",
      status: "pending_review",
      external_ref: externalRef,
    })
    .select("id")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const { data: existing } = await db
        .from("team_bot_order_drafts").select("id").eq("external_ref", externalRef).maybeSingle();
      return existing ? String(existing.id) : null;
    }
    console.error("[jarvis:orderIntake] createOrderDraft failed:", error.message);
    return null;
  }

  // Light review notification → master + office_manager (same as before; best-effort).
  try {
    await db.rpc("fn_emit_notification", {
      p_event_type: "whatsapp.order_request",
      p_entity_type: null,
      p_entity_id: null,
      p_created_by: null,
      p_metadata: { draft_id: data.id, customer: args.contactName, source: "whatsapp" },
    });
  } catch (err) {
    console.error("[jarvis:orderIntake] notification emit failed:", (err as Error).message);
  }
  return String(data.id);
}

/** Load the cart items of an active draft (null if it no longer exists / was promoted). */
export async function loadDraftItems(draftId: string): Promise<OrderItem[] | null> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("team_bot_order_drafts")
    .select("cart, status")
    .eq("id", draftId)
    .maybeSingle();
  if (!data || data.status !== "pending_review") return null;
  const cart = (data.cart ?? []) as { name: string; quantity: number }[];
  return cart.map((c) => ({ name: c.name, quantity: Number(c.quantity) || 1 }));
}

export async function updateDraftItems(draftId: string, items: OrderItem[]): Promise<void> {
  const db = getServiceSupabase();
  await db
    .from("team_bot_order_drafts")
    .update({ cart: toCart(items), updated_at: new Date().toISOString() })
    .eq("id", draftId);
}

export async function confirmDraft(draftId: string): Promise<void> {
  const db = getServiceSupabase();
  await db
    .from("team_bot_order_drafts")
    .update({ customer_confirmed: true, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", draftId);
}
