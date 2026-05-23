import "server-only";
import { answerCallbackQuery, editMessageText, sendMessage, type InlineKeyboard } from "./telegram";
import type { TeamBotUser } from "./types";

/** Per-update dispatch context, shared by the router and intake handlers. */
export type Ctx = {
  chatId: number;
  telegramUserId: string;
  user: TeamBotUser;
  isCallback: boolean;
  callbackId?: string;
  messageId?: number;
};

export { type InlineKeyboard };

/** Reply by editing the originating message (callbacks) or sending a new one. */
export async function respond(ctx: Ctx, text: string, keyboard?: InlineKeyboard): Promise<void> {
  if (ctx.isCallback && ctx.messageId != null) {
    await editMessageText(ctx.chatId, ctx.messageId, text, keyboard);
  } else {
    await sendMessage(ctx.chatId, text, keyboard);
  }
}

/** Always send a fresh message (used for confirmations after a flow step). */
export async function sendNew(ctx: Ctx, text: string, keyboard?: InlineKeyboard): Promise<void> {
  await sendMessage(ctx.chatId, text, keyboard);
}

export async function ack(ctx: Ctx, text?: string): Promise<void> {
  if (ctx.callbackId) await answerCallbackQuery(ctx.callbackId, text);
}
