import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { CartLine } from "./types";

/**
 * Team Bot order-draft writer. The bot ONLY ever writes here — never to
 * work_orders. Every row is stamped source='telegram_bot' /
 * intake_channel='telegram_team_bot' so a Telegram-origin order stays
 * traceable as "הזמנה דרך הבוט מהטלגרם" after an office user promotes it
 * (TB-4) into a real work_order.
 */

export type CreateDraftInput = {
  telegramUserId: string;
  submittedByName?: string | null;
  customer?: string | null;
  contactPerson?: string | null;
  city?: string | null;
  notes?: string | null;
  cart: CartLine[];
};

export type CreatedDraft = { id: string; shortRef: string };

export async function createOrderDraft(input: CreateDraftInput): Promise<CreatedDraft> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("team_bot_order_drafts")
    .insert({
      telegram_user_id: input.telegramUserId,
      submitted_by_name: input.submittedByName ?? null,
      customer: input.customer ?? null,
      contact_person: input.contactPerson ?? null,
      city: input.city ?? null,
      notes: input.notes ?? null,
      cart: input.cart,
      source: "telegram_bot",
      intake_channel: "telegram_team_bot",
      status: "pending_review",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "draft insert failed");
  }
  const id = String(data.id);
  // Short, human-friendly reference for the confirmation message.
  return { id, shortRef: id.slice(0, 8).toUpperCase() };
}
