import "server-only";
import { randomUUID } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { CartLine } from "./types";

/**
 * Promote a Team Bot order draft into a real work_order. This is the ONLY
 * path that turns a bot submission into a business record, and it always runs
 * from a deliberate office-user action in the web app — never from the bot.
 *
 * The new work_order carries source='telegram_bot' + source_ref=<draft id> so
 * the Telegram origin survives editing, billing, reporting, and audit.
 */

export type DraftRow = {
  id: string;
  telegram_user_id: string;
  submitted_by_name: string | null;
  customer: string | null;
  city: string | null;
  notes: string | null;
  cart: CartLine[];
  status: string;
  created_at: string;
};

export async function listPendingDrafts(): Promise<DraftRow[]> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("team_bot_order_drafts")
    .select("id,telegram_user_id,submitted_by_name,customer,city,notes,cart,status,created_at")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });
  return (data ?? []) as DraftRow[];
}

async function nextOrderNumber(): Promise<string> {
  const db = getServiceSupabase();
  const year = new Date().getFullYear();
  const { data, error } = await db.rpc("next_counter", { counter_key: "order" });
  if (!error && typeof data === "number") {
    return `ORD-${year}-${String(data).padStart(3, "0")}`;
  }
  // Fallback: derive from existing rows for the current year.
  const { data: rows } = await db
    .from("work_orders")
    .select("order_number")
    .like("order_number", `ORD-${year}-%`);
  const max = (rows ?? [])
    .map((r) => parseInt(String(r.order_number).replace(`ORD-${year}-`, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const next = max.length ? Math.max(...max) + 1 : 1;
  return `ORD-${year}-${String(next).padStart(3, "0")}`;
}

function cartToMiscRows(cart: CartLine[]): Record<string, unknown>[] {
  return cart.map((l) => ({
    id: randomUUID(),
    description: l.name,
    quantity: String(l.quantity),
    notes: l.notes ?? "",
    catalogItemId: l.catalog_item_id,
    catalogItemName: l.name,
    catalogItemUnit: l.unit,
    catalogItemCategory: l.category,
    catalogItemType: l.type,
  }));
}

export type PromoteResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; error: string };

export async function promoteDraft(draftId: string, reviewerName: string): Promise<PromoteResult> {
  const db = getServiceSupabase();

  const { data: draft } = await db
    .from("team_bot_order_drafts")
    .select("id,customer,city,notes,cart,status")
    .eq("id", draftId)
    .maybeSingle();

  if (!draft) return { ok: false, error: "draft_not_found" };
  if (draft.status !== "pending_review") return { ok: false, error: "already_reviewed" };

  const orderId = randomUUID();
  const orderNumber = await nextOrderNumber();
  const now = new Date().toISOString();
  const cart = (draft.cart ?? []) as CartLine[];

  const dataBlob = {
    signRows: [],
    signsRows: [],
    miscRows: cartToMiscRows(cart),
    accessoryRows: [],
    serviceRows: [],
    notes: draft.notes ?? "",
    generalNotes: draft.notes ?? null,
    attachments: [],
    fabricationDetails: null,
  };

  const { error: insertErr } = await db.from("work_orders").insert({
    id: orderId,
    order_number: orderNumber,
    status: "graphics_pending",
    priority: "normal",
    customer: draft.customer ?? "",
    city: draft.city ?? "",
    order_date: now.slice(0, 10),
    version: 1,
    order_type: "field_work",
    customer_approval_status: "approved",
    source: "telegram_bot",
    source_ref: draftId,
    data: dataBlob,
    created_at: now,
    updated_at: now,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  await db
    .from("team_bot_order_drafts")
    .update({
      status: "promoted",
      promoted_order_id: orderId,
      reviewed_by: reviewerName,
      reviewed_at: now,
    })
    .eq("id", draftId);

  return { ok: true, orderId, orderNumber };
}

export async function rejectDraft(draftId: string, reviewerName: string): Promise<{ ok: boolean; error?: string }> {
  const db = getServiceSupabase();
  const { data: draft } = await db
    .from("team_bot_order_drafts")
    .select("status")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) return { ok: false, error: "draft_not_found" };
  if (draft.status !== "pending_review") return { ok: false, error: "already_reviewed" };

  await db
    .from("team_bot_order_drafts")
    .update({ status: "rejected", reviewed_by: reviewerName, reviewed_at: new Date().toISOString() })
    .eq("id", draftId);
  return { ok: true };
}
