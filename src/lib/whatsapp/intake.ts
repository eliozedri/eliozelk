import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * WhatsApp inbound intake.
 *
 * An inbound text message lands as a PENDING team-bot-style draft — exactly like
 * the Telegram bot and the external web form. It NEVER creates a work_order. Staff
 * review it on /team-bot-orders and a human promotes it (src/lib/teamBot/promote.ts)
 * into a real order, which is the only place order.created fires.
 *
 * Traceability: source = intake_channel = 'whatsapp'; external_ref = 'wa:<message id>'
 * makes the draft idempotent against Meta's at-least-once webhook redelivery.
 */

export type WhatsAppDraftInput = {
  waMessageId: string;
  senderId: string;
  contactName: string | null;
  body: string;
  /** Overrides the "submitted by" label (e.g. owner-initiated drafts from master mode). */
  submittedByName?: string | null;
};

export async function createWhatsAppDraft(input: WhatsAppDraftInput): Promise<void> {
  const db = getServiceSupabase();
  const externalRef = `wa:${input.waMessageId}`;

  // Idempotency: a redelivered message must not create a second draft.
  const { data: existing } = await db
    .from("team_bot_order_drafts")
    .select("id")
    .eq("external_ref", externalRef)
    .maybeSingle();
  if (existing) return;

  const { data, error } = await db
    .from("team_bot_order_drafts")
    .insert({
      telegram_user_id: null,
      submitted_by_name: input.submittedByName ?? input.contactName ?? input.senderId,
      customer: input.contactName,
      customer_phone: input.senderId,
      contact_person: input.contactName,
      city: null,
      notes: input.body,
      cart: [],
      source: "whatsapp",
      intake_channel: "whatsapp",
      status: "pending_review",
      external_ref: externalRef,
    })
    .select("id")
    .single();

  if (error) {
    // Concurrent duplicate on external_ref = already handled; otherwise surface it.
    if ((error as { code?: string }).code === "23505") return;
    throw new Error(error.message);
  }

  // Light review notification → master + office_manager (same as Telegram/external).
  // No department routing, ack, sound, or push — those run only on promotion.
  try {
    await db.rpc("fn_emit_notification", {
      p_event_type: "whatsapp.order_request",
      p_entity_type: null,
      p_entity_id: null,
      p_created_by: null,
      p_metadata: {
        draft_id: data?.id ?? null,
        customer: input.contactName,
        source: "whatsapp",
      },
    });
  } catch (err) {
    console.error("[whatsapp] order-request notification emit failed:", (err as Error).message);
  }
}
