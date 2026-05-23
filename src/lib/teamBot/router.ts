import "server-only";
import { sendMessage } from "./telegram";
import { ack, respond, sendNew, type Ctx } from "./reply";
import {
  approveUser,
  createAccessCode,
  getUserChatId,
  isAdminTelegramId,
  listPendingUsers,
  logEvent,
  redeemAccessCode,
  rejectUser,
  resolveOrCreateUser,
} from "./auth";
import { clearSession, loadSession, resetFlow, saveSession } from "./sessions";
import {
  CB,
  CB_ADMIN_NO,
  CB_ADMIN_OK,
  CB_CART_RM,
  CB_DEPT,
  CB_DEPT_PAGE,
  CB_DRAFT,
  CB_ITEM,
  MENU_BUTTON_TEXT,
  ROLE_LABELS,
  adminDecisionApplied,
  adminRequestsScreen,
  cancelledMessage,
  codeInvalidMessage,
  codeResultMessage,
  helpScreen,
  mainMenu,
  persistentKeyboard,
  promptEnterCode,
  restrictedScreen,
  startGreeting,
} from "./messages";
import {
  clearCart,
  enterCity,
  enterCustomer,
  enterFreetext,
  enterNotes,
  enterQuantity,
  openCart,
  openDepartment,
  openDepartments,
  removeCartLine,
  selectItem,
  startFreetext,
  startSubmit,
} from "./intake";
import { listMyDrafts, listOpenOrders, openMyDraftDetail, openOrderDetail } from "./orders";
import type { TeamBotUser, TgUpdate, TgUser } from "./types";

function canOrder(user: TeamBotUser): boolean {
  return user.role === "admin" || user.role === "authorized_user";
}

export async function handleUpdate(update: TgUpdate): Promise<void> {
  const from: TgUser | undefined = update.message?.from ?? update.callback_query?.from;
  const chat = update.message?.chat ?? update.callback_query?.message?.chat;
  if (!from || from.is_bot || !chat) return;

  const user = await resolveOrCreateUser(from, chat.id);
  const ctx: Ctx = {
    chatId: chat.id,
    telegramUserId: String(from.id),
    user,
    isCallback: Boolean(update.callback_query),
    callbackId: update.callback_query?.id,
    messageId: update.callback_query?.message?.message_id,
  };

  await ack(ctx); // close the Telegram loading spinner on callbacks

  const text = (update.message?.text ?? "").trim();
  const data = update.callback_query?.data ?? "";

  // ── Admin approval callbacks — security-checked against the env allowlist,
  //    independent of the caller's stored role or status. ─────────────────────
  if (data.startsWith(CB_ADMIN_OK) || data.startsWith(CB_ADMIN_NO)) {
    await handleAdminApproval(ctx, data);
    return;
  }

  // ── Gate 1: not approved → restricted surface only ──────────────────────────
  if (user.status !== "approved") {
    await handleUnauthorized(ctx, { text, data });
    return;
  }

  // ── Gate 2: approved users ──────────────────────────────────────────────────
  if (text === "/start" || text === "/menu" || text === MENU_BUTTON_TEXT) {
    await resetFlow(ctx.telegramUserId, await loadSession(ctx.telegramUserId));
    // On /start, (re)install the persistent bottom keyboard so the user can
    // always return to the menu without typing. It persists across later
    // inline-keyboard messages.
    if (text === "/start") {
      await sendMessage(ctx.chatId, startGreeting, persistentKeyboard());
    }
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

  if (data) {
    await handleCallback(ctx, data);
    return;
  }
  if (text) {
    await handleActiveText(ctx, text);
  }
}

// ── Secure admin approval ───────────────────────────────────────────────────────

async function handleAdminApproval(ctx: Ctx, data: string): Promise<void> {
  // Do NOT trust the button: the action is allowed only if the CALLER's
  // Telegram id is in the configured admin allowlist.
  if (!isAdminTelegramId(ctx.telegramUserId)) {
    await logEvent(ctx.telegramUserId, "unauthorized_admin_action", { data });
    await respond(ctx, "⛔ פעולה זו זמינה למנהלים מורשים בלבד.");
    return;
  }

  const approve = data.startsWith(CB_ADMIN_OK);
  const targetId = data.slice((approve ? CB_ADMIN_OK : CB_ADMIN_NO).length);

  if (approve) {
    await approveUser(targetId, ctx.telegramUserId, "authorized_user");
    const chatId = (await getUserChatId(targetId)) ?? targetId;
    await sendMessage(
      chatId,
      `✅ קיבלת גישה לבוט הצוות של אלקיים כ־${ROLE_LABELS.authorized_user}.\nשלח /start כדי להתחיל.`,
    ).catch(() => {});
  } else {
    await rejectUser(targetId, ctx.telegramUserId);
  }
  await logEvent(ctx.telegramUserId, approve ? "user_approved" : "user_rejected", { targetId });

  await respond(ctx, adminDecisionApplied(approve, targetId), {
    inline_keyboard: [
      [{ text: "🔐 בקשות נוספות", callback_data: CB.ADMIN_REQUESTS }],
      [{ text: "🏠 תפריט ראשי", callback_data: CB.HOME }],
    ],
  });
}

// ── Active free-text routing ───────────────────────────────────────────────────

async function handleActiveText(ctx: Ctx, text: string): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  switch (session.flow) {
    case "awaiting_quantity":
      return void (await enterQuantity(ctx, text));
    case "awaiting_freetext":
      return void (await enterFreetext(ctx, text));
    case "awaiting_customer":
      return void (await enterCustomer(ctx, text));
    case "awaiting_city":
      return void (await enterCity(ctx, text));
    case "awaiting_notes":
      return void (await enterNotes(ctx, text));
    default:
      return void (await sendMain(ctx));
  }
}

// ── Unauthorized handling (pending / rejected / inactive) ──────────────────────

async function handleUnauthorized(ctx: Ctx, input: { text: string; data: string }): Promise<void> {
  const { text } = input;

  // Secondary onboarding path: /code <CODE> still works for issued codes.
  if (text.startsWith("/code")) {
    const code = text.slice("/code".length).trim();
    if (code) return void (await tryRedeem(ctx, code));
  }
  if (input.data === CB.ENTER_CODE) {
    const session = await loadSession(ctx.telegramUserId);
    await saveSession(ctx.telegramUserId, { ...session, flow: "awaiting_code" });
    await respond(ctx, promptEnterCode);
    return;
  }
  if (text && !text.startsWith("/")) {
    const session = await loadSession(ctx.telegramUserId);
    if (session.flow === "awaiting_code") return void (await tryRedeem(ctx, text));
  }

  const status =
    ctx.user.status === "rejected" ? "rejected" : ctx.user.status === "inactive" ? "inactive" : "pending";
  const screen = restrictedScreen(ctx.telegramUserId, status);
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
  ctx.user = { ...ctx.user, status: "approved", role: result.role };
  await sendMain(ctx);
}

// ── Approved-user callback dispatch ────────────────────────────────────────────

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

  if (isIntakeCallback(data)) {
    if (!canOrder(ctx.user)) return void (await sendMain(ctx));
    await handleIntakeCallback(ctx, data);
    return;
  }

  if (data === CB.ORDERS) {
    await listOpenOrders(ctx);
    return;
  }
  if (data.startsWith("ord:")) {
    await openOrderDetail(ctx, data.slice("ord:".length));
    return;
  }
  if (data === CB.MY_DRAFTS) {
    if (!canOrder(ctx.user)) return void (await sendMain(ctx));
    await listMyDrafts(ctx);
    return;
  }
  if (data.startsWith(CB_DRAFT)) {
    if (!canOrder(ctx.user)) return void (await sendMain(ctx));
    await openMyDraftDetail(ctx, data.slice(CB_DRAFT.length));
    return;
  }

  // Admin features — gated by the env allowlist (defense in depth).
  if (data === CB.ADMIN_REQUESTS) {
    if (!isAdminTelegramId(ctx.telegramUserId)) return void (await sendMain(ctx));
    const pending = await listPendingUsers();
    const s = adminRequestsScreen(pending);
    await respond(ctx, s.text, s.keyboard);
    return;
  }
  if (data === CB.ADMIN_NEWCODE) {
    if (!isAdminTelegramId(ctx.telegramUserId)) return void (await sendMain(ctx));
    const code = await createAccessCode({
      role: "authorized_user",
      maxUses: 1,
      expiresInHours: 72,
      createdBy: ctx.telegramUserId,
    });
    await respond(
      ctx,
      `➕ קוד גישה חדש (חד-פעמי, תקף 72 שעות, תפקיד: משתמש מורשה):\n\n${code}\n\nשלח אותו לעובד. הוא יזין אותו עם /code בבוט.`,
      { inline_keyboard: [[{ text: "🏠 תפריט ראשי", callback_data: CB.HOME }]] },
    );
    return;
  }

  await sendMain(ctx);
}

function isIntakeCallback(data: string): boolean {
  return (
    data === CB.CATALOG ||
    data === CB.CART ||
    data === CB.FREETEXT ||
    data === CB.CART_SUBMIT ||
    data === CB.CART_CLEAR ||
    data === CB.SKIP_CITY ||
    data === CB.SKIP_NOTES ||
    data.startsWith(CB_DEPT_PAGE) ||
    data.startsWith(CB_DEPT) ||
    data.startsWith(CB_ITEM) ||
    data.startsWith(CB_CART_RM)
  );
}

async function handleIntakeCallback(ctx: Ctx, data: string): Promise<void> {
  if (data === CB.CATALOG) return void (await openDepartments(ctx));
  if (data === CB.CART) return void (await openCart(ctx));
  if (data === CB.FREETEXT) return void (await startFreetext(ctx));
  if (data === CB.CART_SUBMIT) return void (await startSubmit(ctx));
  if (data === CB.CART_CLEAR) return void (await clearCart(ctx));
  if (data === CB.SKIP_CITY) return void (await enterCity(ctx, null));
  if (data === CB.SKIP_NOTES) return void (await enterNotes(ctx, null));

  if (data.startsWith(CB_DEPT_PAGE)) {
    const rest = data.slice(CB_DEPT_PAGE.length);
    const lastColon = rest.lastIndexOf(":");
    const slug = lastColon >= 0 ? rest.slice(0, lastColon) : rest;
    const page = lastColon >= 0 ? parseInt(rest.slice(lastColon + 1), 10) || 1 : 1;
    return void (await openDepartment(ctx, slug, page));
  }
  if (data.startsWith(CB_DEPT)) {
    return void (await openDepartment(ctx, data.slice(CB_DEPT.length), 1));
  }
  if (data.startsWith(CB_ITEM)) {
    return void (await selectItem(ctx, data.slice(CB_ITEM.length)));
  }
  if (data.startsWith(CB_CART_RM)) {
    const idx = parseInt(data.slice(CB_CART_RM.length), 10);
    if (Number.isFinite(idx)) return void (await removeCartLine(ctx, idx));
  }
  await sendMain(ctx);
}

async function sendMain(ctx: Ctx): Promise<void> {
  const s = mainMenu(ctx.user);
  await respond(ctx, s.text, s.keyboard);
}

export { sendNew };
