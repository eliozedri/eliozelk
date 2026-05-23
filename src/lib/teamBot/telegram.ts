import "server-only";

/**
 * Minimal Telegram Bot API client — raw fetch, zero dependencies.
 * Mirrors the dependency-free approach of the WhatsApp webhook.
 *
 * The bot token lives ONLY in process.env.TEAM_BOT_TELEGRAM_TOKEN. It is
 * never logged. When the token is missing, isConfigured() returns false and
 * the webhook responds 503 (not configured) rather than crashing.
 */

const API_BASE = "https://api.telegram.org";

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export function botToken(): string | null {
  return process.env.TEAM_BOT_TELEGRAM_TOKEN ?? null;
}

export function isConfigured(): boolean {
  return Boolean(botToken());
}

/** The shared secret echoed back by Telegram in the webhook header. */
export function webhookSecret(): string | null {
  return process.env.TEAM_BOT_WEBHOOK_SECRET ?? null;
}

async function call<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = botToken();
  if (!token) return { ok: false, description: "TEAM_BOT_TELEGRAM_TOKEN missing" };

  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
  };
  if (!res.ok || !json.ok) {
    // Never include the token; Telegram error descriptions are token-free.
    console.error(`[team-bot] ${method} failed: ${res.status} ${json.description ?? ""}`);
    return { ok: false, description: json.description };
  }
  return { ok: true, result: json.result };
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  await call("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: keyboard,
    disable_web_page_preview: true,
  });
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const r = await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: keyboard,
    disable_web_page_preview: true,
  });
  // "message is not modified" is benign; fall back to a fresh message on other
  // edit failures (e.g. message too old to edit).
  if (!r.ok && !(r.description ?? "").includes("not modified")) {
    await sendMessage(chatId, text, keyboard);
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export async function setWebhook(url: string, secretToken: string): Promise<{ ok: boolean; description?: string }> {
  const r = await call("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  return { ok: r.ok, description: r.description };
}

export async function deleteWebhook(): Promise<{ ok: boolean; description?: string }> {
  const r = await call("deleteWebhook", { drop_pending_updates: false });
  return { ok: r.ok, description: r.description };
}

export async function getWebhookInfo(): Promise<unknown> {
  const r = await call("getWebhookInfo", {});
  return r.result ?? null;
}
