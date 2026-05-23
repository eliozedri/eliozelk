import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { respond, type Ctx } from "./reply";
import { CB } from "./messages";
import { STATUS_LABELS, type WorkOrderStatus } from "@/types/workOrder";

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
    await respond(ctx, `📂 הזמנות פתוחות\n━━━━━━━━━━━━━━\nאין הזמנות פתוחות כרגע.`, {
      inline_keyboard: [homeRow],
    });
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
    `📂 הזמנות פתוחות (${rows.length})\n━━━━━━━━━━━━━━\n${lines.join("\n")}\n\nלפרטים — בחר הזמנה.`,
    { inline_keyboard: buttons },
  );
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
