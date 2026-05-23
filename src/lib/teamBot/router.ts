import "server-only";
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
  type InlineKeyboard,
} from "./telegram";
import {
  createAccessCode,
  listPendingUsers,
  redeemAccessCode,
  resolveOrCreateUser,
  setUserStatus,
} from "./auth";
import { clearSession, loadSession, resetFlow, saveSession } from "./sessions";
import {
  CB,
  ROLE_LABELS,
  adminRequestsScreen,
  cancelledMessage,
  codeInvalidMessage,
  codeResultMessage,
  helpScreen,
  mainMenu,
  promptEnterCode,
  restrictedScreen,
} from "./messages";
import type { TeamBotUser, TgUpdate, TgUser } from "./types";

/** Dispatch context for a single update. */
type Ctx = {
  chatId: number;
  telegramUserId: string;
  user: TeamBotUser;
  isCallback: boolean;
  callbackId?: string;
  messageId?: number;
};

function canOrder(user: TeamBotUser): boolean {
  return user.role === "admin" || user.role === "authorized_user";
}

/** Reply by editing the originating message (callbacks) or sending a new one. */
async function respond(ctx: Ctx, text: string, keyboard?: InlineKeyboard): Promise<void> {
  if (ctx.isCallback && ctx.messageId != null) {
    await editMessageText(ctx.chatId, ctx.messageId, text, keyboard);
  } else {
    await sendMessage(ctx.chatId, text, keyboard);
  }
}

export async function handleUpdate(update: TgUpdate): Promise<void> {
  const from: TgUser | undefined = update.message?.from ?? update.callback_query?.from;
  const chat = update.message?.chat ?? update.callback_query?.message?.chat;
  if (!from || from.is_bot || !chat) return;

  const user = await resolveOrCreateUser(from);
  const ctx: Ctx = {
    chatId: chat.id,
    telegramUserId: String(from.id),
    user,
    isCallback: Boolean(update.callback_query),
    callbackId: update.callback_query?.id,
    messageId: update.callback_query?.message?.message_id,
  };

  // Always close the Telegram loading spinner on callbacks.
  if (ctx.callbackId) await answerCallbackQuery(ctx.callbackId);

  const text = (update.message?.text ?? "").trim();
  const data = update.callback_query?.data ?? "";

  // ── Gate 1: not active → restricted surface + code redemption only ─────────
  if (user.status !== "active") {
    await handleUnauthorized(ctx, { text, data });
    return;
  }

  // ── Gate 2: active users ───────────────────────────────────────────────────
  // Commands
  if (text === "/start" || text === "/menu") {
    await resetFlow(ctx.telegramUserId, await loadSession(ctx.telegramUserId));
    await sendMain(ctx);
    return;
  }
  if (text === "/cancel") {
    await clearSession(ctx.telegramUserId);
    await sendMessage(ctx.chatId, cancelledMessage);
    await sendMain(ctx);
    return;
  }
  if (text === "/help") {
    const s = helpScreen(user);
    await sendMessage(ctx.chatId, s.text, s.keyboard);
    return;
  }

  // Callback navigation
  if (data) {
    await handleCallback(ctx, data);
    return;
  }

  // Free text while active but no relevant flow → nudge to the menu.
  if (text) {
    await sendMain(ctx);
  }
}

// ── Unauthorized handling ─────────────────────────────────────────────────────

async function handleUnauthorized(
  ctx: Ctx,
  input: { text: string; data: string },
): Promise<void> {
  const { text, data } = input;

  // Direct command: /code ELK-XXXX-XXXX
  if (text.startsWith("/code")) {
    const code = text.slice("/code".length).trim();
    if (code) return void (await tryRedeem(ctx, code));
  }

  // Button: prompt for a code.
  if (data === CB.ENTER_CODE) {
    const session = await loadSession(ctx.telegramUserId);
    await saveSession(ctx.telegramUserId, { ...session, flow: "awaiting_code" });
    await respond(ctx, promptEnterCode);
    return;
  }

  // Typed text while awaiting a code.
  if (text && !text.startsWith("/")) {
    const session = await loadSession(ctx.telegramUserId);
    if (session.flow === "awaiting_code") {
      return void (await tryRedeem(ctx, text));
    }
  }

  // Default: show the restricted screen (also enqueues them as pending via
  // resolveOrCreateUser, already called upstream).
  const screen = restrictedScreen(
    ctx.telegramUserId,
    ctx.user.status === "blocked" ? "blocked" : "pending",
  );
  await respond(ctx, screen.text, screen.keyboard);
}

async function tryRedeem(ctx: Ctx, code: string): Promise<void> {
  const result = await redeemAccessCode(ctx.telegramUserId, code);
  if (!result.ok) {
    await sendMessage(ctx.chatId, codeInvalidMessage);
    const screen = restrictedScreen(ctx.telegramUserId, "pending");
    await sendMessage(ctx.chatId, screen.text, screen.keyboard);
    return;
  }
  await clearSession(ctx.telegramUserId);
  await sendMessage(ctx.chatId, codeResultMessage(result.role));
  // Refresh the in-memory user so the menu reflects the new role.
  ctx.user = { ...ctx.user, status: "active", role: result.role };
  await sendMain(ctx);
}

// ── Active callback dispatch ───────────────────────────────────────────────────

async function handleCallback(ctx: Ctx, data: string): Promise<void> {
  if (data === CB.HOME) {
    await resetFlow(ctx.telegramUserId, await loadSession(ctx.telegramUserId));
    await sendMain(ctx);
    return;
  }
  if (data === CB.CANCEL) {
    await clearSession(ctx.telegramUserId);
    await respond(ctx, cancelledMessage);
    await sendMain(ctx);
    return;
  }
  if (data === CB.HELP) {
    const s = helpScreen(ctx.user);
    await respond(ctx, s.text, s.keyboard);
    return;
  }

  // Order intake — wired in TB-2.
  if (data === CB.CATALOG || data === CB.CART || data === CB.FREETEXT) {
    if (!canOrder(ctx.user)) return void (await sendMain(ctx));
    await respond(ctx, "📦 בניית הזמנה — בקרוב (שלב הבא).", {
      inline_keyboard: [[{ text: "🏠 תפריט ראשי", callback_data: CB.HOME }]],
    });
    return;
  }

  // Open orders — wired in TB-3.
  if (data === CB.ORDERS) {
    await respond(ctx, "📂 הזמנות פתוחות — בקרוב (שלב הבא).", {
      inline_keyboard: [[{ text: "🏠 תפריט ראשי", callback_data: CB.HOME }]],
    });
    return;
  }

  // Admin: access requests
  if (data === CB.ADMIN_REQUESTS) {
    if (ctx.user.role !== "admin") return void (await sendMain(ctx));
    const pending = await listPendingUsers();
    const s = adminRequestsScreen(pending);
    await respond(ctx, s.text, s.keyboard);
    return;
  }
  if (data === CB.ADMIN_NEWCODE) {
    if (ctx.user.role !== "admin") return void (await sendMain(ctx));
    const code = await createAccessCode({
      role: "authorized_user",
      maxUses: 1,
      expiresInHours: 72,
      createdBy: ctx.telegramUserId,
    });
    await respond(
      ctx,
      `➕ קוד גישה חדש (חד-פעמי, תקף 72 שעות, תפקיד: משתמש מורשה):\n\n${code}\n\nשלח אותו לעובד. הוא יזין אותו בלחיצה על "התחל" בבוט.`,
      { inline_keyboard: [[{ text: "🏠 תפריט ראשי", callback_data: CB.HOME }]] },
    );
    return;
  }
  if (data.startsWith("adm:ok:") || data.startsWith("adm:no:")) {
    if (ctx.user.role !== "admin") return void (await sendMain(ctx));
    const approve = data.startsWith("adm:ok:");
    const targetId = data.slice("adm:ok:".length);
    await setUserStatus(targetId, approve ? "active" : "blocked", {
      role: approve ? "authorized_user" : undefined,
      approvedBy: ctx.telegramUserId,
    });
    // Notify the user of the decision.
    if (approve) {
      await sendMessage(
        targetId,
        `✅ קיבלת גישה לבוט הצוות של אלקיים כ־${ROLE_LABELS.authorized_user}.\nשלח /start כדי להתחיל.`,
      ).catch(() => {});
    }
    const pending = await listPendingUsers();
    const s = adminRequestsScreen(pending);
    await respond(ctx, s.text, s.keyboard);
    return;
  }

  // Unknown callback → menu.
  await sendMain(ctx);
}

async function sendMain(ctx: Ctx): Promise<void> {
  const s = mainMenu(ctx.user);
  await respond(ctx, s.text, s.keyboard);
}
