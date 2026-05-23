import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TeamBotUser, TgUpdate } from "../types";

// ── Capture outbound Telegram traffic ─────────────────────────────────────────
type Out = { kind: string; text: string; kb?: { inline_keyboard: { callback_data?: string }[][] } };
const tg = vi.hoisted(() => ({ out: [] as Out[] }));
vi.mock("../telegram", () => ({
  sendMessage: vi.fn(async (_chatId: number, text: string, kb?: Out["kb"]) => {
    tg.out.push({ kind: "send", text, kb });
  }),
  editMessageText: vi.fn(async (_chatId: number, _mid: number, text: string, kb?: Out["kb"]) => {
    tg.out.push({ kind: "edit", text, kb });
  }),
  answerCallbackQuery: vi.fn(async () => {}),
}));

// ── Mock auth (DB-backed gate tested separately) ───────────────────────────────
const auth = vi.hoisted(() => ({
  resolveOrCreateUser: vi.fn(),
  redeemAccessCode: vi.fn(),
  listPendingUsers: vi.fn(async () => [] as TeamBotUser[]),
  approveUser: vi.fn(async () => {}),
  rejectUser: vi.fn(async () => {}),
  getUserChatId: vi.fn(async () => "555"),
  createAccessCode: vi.fn(async () => "ELK-TEST-CODE"),
  logEvent: vi.fn(async () => {}),
  isAdminTelegramId: vi.fn(() => false),
}));
vi.mock("../auth", () => auth);

const store = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
vi.mock("../sessions", () => ({
  loadSession: vi.fn(async (id: string) => store.map.get(id) ?? { flow: "idle", cart: [] }),
  saveSession: vi.fn(async (id: string, s: unknown) => void store.map.set(id, s)),
  resetFlow: vi.fn(async (id: string, s: Record<string, unknown>) => void store.map.set(id, { ...s, flow: "idle" })),
  clearSession: vi.fn(async (id: string) => void store.map.set(id, { flow: "idle", cart: [] })),
}));

import { handleUpdate } from "../router";
import { CB, CB_ADMIN_OK, MENU_BUTTON_TEXT } from "../messages";

function mkUser(role: TeamBotUser["role"], status: TeamBotUser["status"]): TeamBotUser {
  return {
    id: "x",
    telegram_user_id: "555",
    chat_id: "555",
    telegram_username: "t",
    display_name: "טסט",
    first_name: "טסט",
    last_name: null,
    role,
    status,
  };
}
const allText = () => tg.out.map((o) => o.text).join("\n");
const lastText = () => tg.out[tg.out.length - 1]?.text ?? "";
const allDatas = () =>
  tg.out.flatMap((o) => (o.kb?.inline_keyboard ?? []).flat().map((b) => b.callback_data));

function startMsg(text = "/start"): TgUpdate {
  return { update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, from: { id: 555 }, chat: { id: 555 }, text } };
}
function cb(data: string): TgUpdate {
  return {
    update_id: Math.floor(Math.random() * 1e9),
    callback_query: { id: "cq", from: { id: 555 }, message: { message_id: 1, chat: { id: 555 } }, data },
  };
}

beforeEach(() => {
  tg.out.length = 0;
  store.map.clear();
  auth.resolveOrCreateUser.mockReset();
  auth.redeemAccessCode.mockReset();
  auth.approveUser.mockReset();
  auth.rejectUser.mockReset();
  auth.logEvent.mockReset();
  auth.listPendingUsers.mockResolvedValue([]);
  auth.getUserChatId.mockResolvedValue("555");
  auth.isAdminTelegramId.mockReturnValue(false);
});

describe("default-deny", () => {
  it("pending user gets the restricted screen, never the menu", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("viewer", "pending"));
    await handleUpdate(startMsg());
    expect(lastText()).toContain("ממתינה לאישור מנהל");
    expect(lastText()).toContain("555");
    expect(allText()).not.toContain("בחר פעולה");
  });

  it("rejected user is blocked", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("viewer", "rejected"));
    await handleUpdate(startMsg());
    expect(lastText()).toContain("נדחתה");
    expect(allText()).not.toContain("בחר פעולה");
  });

  it("inactive user is blocked", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("authorized_user", "inactive"));
    await handleUpdate(startMsg());
    expect(lastText()).toContain("הושבת");
    expect(allText()).not.toContain("בחר פעולה");
  });
});

describe("approved users", () => {
  it("authorized_user /start renders the menu with catalog", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("authorized_user", "approved"));
    await handleUpdate(startMsg());
    expect(allText()).toContain("בחר פעולה");
    expect(allDatas()).toContain(CB.CATALOG);
  });

  it("tapping the persistent bottom-menu button opens the main menu", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("authorized_user", "approved"));
    await handleUpdate(startMsg(MENU_BUTTON_TEXT));
    expect(allText()).toContain("בחר פעולה");
  });
});

describe("default-deny ignores the menu button for non-approved users", () => {
  it("pending user tapping the menu button still gets the restricted screen", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("viewer", "pending"));
    await handleUpdate(startMsg(MENU_BUTTON_TEXT));
    expect(allText()).toContain("ממתינה לאישור מנהל");
    expect(allText()).not.toContain("בחר פעולה");
  });
});

describe("secure admin approval callbacks", () => {
  it("admin (in env allowlist) can approve a pending user", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("admin", "approved"));
    auth.isAdminTelegramId.mockReturnValue(true);
    await handleUpdate(cb(`${CB_ADMIN_OK}777`));
    expect(auth.approveUser).toHaveBeenCalledWith("777", "555", "authorized_user");
  });

  it("non-admin caller is blocked and logged, no approval happens", async () => {
    // Even if their stored status is 'approved', the callback is gated by the
    // env allowlist, not by role/status.
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("authorized_user", "approved"));
    auth.isAdminTelegramId.mockReturnValue(false);
    await handleUpdate(cb(`${CB_ADMIN_OK}777`));
    expect(auth.approveUser).not.toHaveBeenCalled();
    expect(auth.logEvent).toHaveBeenCalledWith("555", "unauthorized_admin_action", { data: `${CB_ADMIN_OK}777` });
    expect(allText()).toContain("מנהלים מורשים בלבד");
  });

  it("non-admin cannot open the admin requests screen", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("authorized_user", "approved"));
    auth.isAdminTelegramId.mockReturnValue(false);
    await handleUpdate(cb("menu:admin_requests"));
    expect(allText()).toContain("בחר פעולה");
    expect(allText()).not.toContain("בקשות גישה");
  });
});

describe("access-code redemption (secondary path)", () => {
  it("valid code activates the user and shows the menu", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("viewer", "pending"));
    auth.redeemAccessCode.mockResolvedValue({ ok: true, role: "authorized_user" });
    store.map.set("555", { flow: "awaiting_code", cart: [] });
    await handleUpdate(startMsg("ELK-AAAA-BBBB"));
    expect(auth.redeemAccessCode).toHaveBeenCalledWith("555", "ELK-AAAA-BBBB");
    expect(allText()).toContain("בחר פעולה");
  });
});
