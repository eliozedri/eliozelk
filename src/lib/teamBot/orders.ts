import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { respond, type Ctx } from "./reply";
import { CB, CB_DRAFT, DRAFT_STATUS_LABELS, renderCartLines } from "./messages";
import { STATUS_LABELS, type WorkOrderStatus } from "@/types/workOrder";
import type { CartLine } from "./types";

/**
 * Read-only open-orders lookup. Operational fields only — NO billed amount,
 * invoice, cost, or other financial/sensitive data is ever exposed to bot
 * users. "Open" = any status outside the terminal completed/cancelled set.
 */

const OPEN_STATUSES: WorkOrderStatus[] = [
  "draft",
  "graphics_pending",
  "graphics_active",
  "graphics_done",
  "production",
  "ready_installation",
];

const LIST_LIMIT = 15;
const homeRow = [{ text: "🏠 תפריט ראשי", callback_data: CB.HOME }];

function statusLabel(status: string): string {
  return STATUS_LABELS[status as WorkOrderStatus] ?? status;
}

export async function listOpenOrders(ctx: Ctx): Promise<void> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("work_orders")
    .select("id,order_number,customer,city,status,order_date,source,created_at")
    .in("status", OPEN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    await respond(ctx, "⚠️ שגיאה בטעינת ההזמנות. נסה שוב מאוחר יותר.", {
      inline_keyboard: [homeRow],
    });
    return;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    await respond(
      ctx,
      `📂 הזמנות פתוחות במערכת\n━━━━━━━━━━━━━━\nאין הזמנות פתוחות כרגע.\n\n(זו תצוגת הזמנות עבודה רשמיות. טיוטות ששלחת דרך הבוט נמצאות תחת "🧾 ההזמנות שלי מהבוט".)`,
      { inline_keyboard: [homeRow] },
    );
    return;
  }

  const buttons = rows.map((o) => {
    const badge = o.source === "telegram_bot" ? "📱 " : "";
    const label = `${badge}${o.order_number} · ${o.customer || "—"}`.slice(0, 60);
    return [{ text: label, callback_data: `ord:${o.id}` }];
  });
  buttons.push(homeRow);

  const lines = rows.map((o) => {
    const badge = o.source === "telegram_bot" ? "📱 " : "";
    return `${badge}${o.order_number} · ${o.customer || "—"} · ${statusLabel(String(o.status))}`;
  });

  await respond(
    ctx,
    `📂 הזמנות פתוחות במערכת (${rows.length})\n━━━━━━━━━━━━━━\n${lines.join("\n")}\n\nלפרטים — בחר הזמנה.`,
    { inline_keyboard: buttons },
  );
}

// ── My bot drafts (team_bot_order_drafts for the current user) ─────────────────
// Distinct from open work_orders: these are the caller's OWN bot submissions and
// their review status. This is the view that mirrors what the office sees in the
// web /team-bot-orders screen (scoped to the submitter).

const DRAFT_LIMIT = 20;

function draftStatusLabel(status: string): string {
  return DRAFT_STATUS_LABELS[status] ?? status;
}

export async function listMyDrafts(ctx: Ctx): Promise<void> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("team_bot_order_drafts")
    .select("id,customer,city,status,cart,created_at")
    .eq("telegram_user_id", ctx.telegramUserId)
    .order("created_at", { ascending: false })
    .limit(DRAFT_LIMIT);

  if (error) {
    await respond(ctx, "⚠️ שגיאה בטעינת הטיוטות. נסה שוב מאוחר יותר.", {
      inline_keyboard: [homeRow],
    });
    return;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    await respond(
      ctx,
      `🧾 ההזמנות שלי מהבוט\n━━━━━━━━━━━━━━\nעדיין לא שלחת הזמנות דרך הבוט.\nבנה הזמנה מהקטלוג כדי להתחיל.`,
      { inline_keyboard: [[{ text: "📚 לקטלוג", callback_data: CB.CATALOG }], homeRow] },
    );
    return;
  }

  const buttons = rows.map((d) => {
    const items = Array.isArray(d.cart) ? (d.cart as CartLine[]).length : 0;
    const label = `${d.customer || "ללא לקוח"} · ${draftStatusLabel(String(d.status))}${items ? ` · ${items} פריטים` : ""}`;
    return [{ text: label.slice(0, 60), callback_data: `${CB_DRAFT}${d.id}` }];
  });
  buttons.push(homeRow);

  const lines = rows.map((d) => {
    const items = Array.isArray(d.cart) ? (d.cart as CartLine[]).length : 0;
    return `📱 ${d.customer || "ללא לקוח"} — ${draftStatusLabel(String(d.status))}${items ? ` (${items} פריטים)` : ""}`;
  });

  await respond(
    ctx,
    `🧾 ההזמנות שלי מהבוט (${rows.length})\n━━━━━━━━━━━━━━\n${lines.join("\n")}\n\nלפרטים — בחר הזמנה.`,
    { inline_keyboard: buttons },
  );
}

export async function openMyDraftDetail(ctx: Ctx, draftId: string): Promise<void> {
  const db = getServiceSupabase();
  const { data: d } = await db
    .from("team_bot_order_drafts")
    .select("id,telegram_user_id,customer,city,notes,status,cart,created_at,promoted_order_id")
    .eq("id", draftId)
    .maybeSingle();

  // Scope to the caller's own drafts — never expose another user's submission.
  if (!d || String(d.telegram_user_id) !== ctx.telegramUserId) {
    await respond(ctx, "⚠️ הטיוטה לא נמצאה.", {
      inline_keyboard: [[{ text: "↩️ לרשימה", callback_data: CB.MY_DRAFTS }], homeRow],
    });
    return;
  }

  const cart = (Array.isArray(d.cart) ? d.cart : []) as CartLine[];
  const promoted = d.promoted_order_id ? `\nהזמנה שנוצרה: ${String(d.promoted_order_id).slice(0, 8)}` : "";
  const text =
    `🧾 טיוטת הזמנה מהבוט\n━━━━━━━━━━━━━━\n` +
    `לקוח: ${d.customer || "—"}\n` +
    `עיר: ${d.city || "—"}\n` +
    `סטטוס: ${draftStatusLabel(String(d.status))}\n` +
    `תאריך: ${new Date(String(d.created_at)).toLocaleDateString("he-IL")}\n` +
    `מקור: 📱 הזמנה דרך הבוט מהטלגרם${promoted}\n\n` +
    (cart.length ? renderCartLines(cart) : d.notes ? `📝 ${d.notes}` : "ללא פריטים");

  await respond(ctx, text, {
    inline_keyboard: [[{ text: "↩️ לרשימה", callback_data: CB.MY_DRAFTS }], homeRow],
  });
}

export async function openOrderDetail(ctx: Ctx, orderId: string): Promise<void> {
  const db = getServiceSupabase();
  const { data: o } = await db
    .from("work_orders")
    .select("id,order_number,customer,city,status,order_date,source,created_at")
    .eq("id", orderId)
    .maybeSingle();

  if (!o) {
    await respond(ctx, "⚠️ ההזמנה לא נמצאה.", {
      inline_keyboard: [[{ text: "↩️ לרשימה", callback_data: CB.ORDERS }], homeRow],
    });
    return;
  }

  const origin = o.source === "telegram_bot" ? "\nמקור: 📱 הזמנה דרך הבוט מהטלגרם" : "";
  const text =
    `📄 הזמנה ${o.order_number}\n━━━━━━━━━━━━━━\n` +
    `לקוח: ${o.customer || "—"}\n` +
    `עיר: ${o.city || "—"}\n` +
    `סטטוס: ${statusLabel(String(o.status))}\n` +
    `תאריך: ${o.order_date || "—"}` +
    origin;

  await respond(ctx, text, {
    inline_keyboard: [[{ text: "↩️ לרשימה", callback_data: CB.ORDERS }], homeRow],
  });
}
