import "server-only";
import {
  answerCallbackQuery,
  deleteMessage,
  editMessageText,
  sendMessage,
  type InlineKeyboard,
  type ReplyMarkup,
} from "./telegram";
import { loadSession, saveSession } from "./sessions";
import type { TeamBotUser } from "./types";

/** Per-update dispatch context, shared by the router and intake handlers. */
export type Ctx = {
  chatId: number;
  telegramUserId: string;
  user: TeamBotUser;
  isCallback: boolean;
  callbackId?: string;
  /** message_id of the message a callback button was on. */
  messageId?: number;
  /** message_id of the user's inbound text message (for cleanup). */
  userMessageId?: number;
};

export { type InlineKeyboard };

/**
 * Render the current wizard step on a SINGLE active message.
 *
 *  - On a button tap, edits the message the button was on (and tracks it).
 *  - On a typed step, edits the tracked active message from the previous step.
 *  - If there is nothing to edit (or the edit fails — e.g. the message is too
 *    old), sends a fresh message and tracks its id.
 *
 * The tracked id lives in team_bot_sessions.wizardMessageId so the chat stays
 * a clean, in-place wizard instead of a long message history.
 */
export async function respond(ctx: Ctx, text: string, keyboard?: InlineKeyboard): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  const tracked = session.wizardMessageId ?? undefined;
  const targetId = ctx.isCallback ? ctx.messageId ?? tracked : tracked;

  let activeId: number | undefined;
  if (targetId != null) {
    const ok = await editMessageText(ctx.chatId, targetId, text, keyboard);
    activeId = ok ? targetId : (await sendMessage(ctx.chatId, text, keyboard)) ?? undefined;
  } else {
    activeId = (await sendMessage(ctx.chatId, text, keyboard)) ?? undefined;
  }

  if ((session.wizardMessageId ?? null) !== (activeId ?? null)) {
    await saveSession(ctx.telegramUserId, { ...session, wizardMessageId: activeId ?? null });
  }
}

/** Send a brand-new message (used for the /start greeting + persistent keyboard
 *  and for messages that must not replace the active wizard message). Returns id. */
export async function sendNew(ctx: Ctx, text: string, keyboard?: ReplyMarkup): Promise<number | null> {
  return sendMessage(ctx.chatId, text, keyboard);
}

/** Edit a specific message without touching the tracked wizard id (e.g. an
 *  admin alert message that is independent of the admin's own wizard). */
export async function editUntracked(
  ctx: Ctx,
  messageId: number | undefined,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  if (messageId != null && (await editMessageText(ctx.chatId, messageId, text, keyboard))) return;
  await sendMessage(ctx.chatId, text, keyboard);
}

/** Best-effort delete the user's typed message to keep the chat clean. */
export async function deleteUserMessage(ctx: Ctx): Promise<void> {
  if (ctx.userMessageId != null) {
    await deleteMessage(ctx.chatId, ctx.userMessageId).catch(() => {});
  }
}

export async function ack(ctx: Ctx, text?: string): Promise<void> {
  if (ctx.callbackId) await answerCallbackQuery(ctx.callbackId, text);
}
