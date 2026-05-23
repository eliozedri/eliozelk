import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TeamBotUser, TgUpdate } from "../types";

// ── Capture outbound Telegram traffic ─────────────────────────────────────────
type Out = { kind: string; text: string; kb?: { inline_keyboard: { callback_data: string }[][] } };
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

// ── Mock auth (the real DB-backed gate is tested separately) ───────────────────
const auth = vi.hoisted(() => ({
  resolveOrCreateUser: vi.fn(),
  redeemAccessCode: vi.fn(),
  listPendingUsers: vi.fn(async () => [] as TeamBotUser[]),
  setUserStatus: vi.fn(async () => {}),
  createAccessCode: vi.fn(async () => "ELK-TEST-CODE"),
}));
vi.mock("../auth", () => auth);

// ── In-memory sessions ─────────────────────────────────────────────────────────
const store = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
vi.mock("../sessions", () => ({
  loadSession: vi.fn(async (id: string) => store.map.get(id) ?? { flow: "idle", cart: [] }),
  saveSession: vi.fn(async (id: string, s: unknown) => void store.map.set(id, s)),
  resetFlow: vi.fn(async (id: string, s: Record<string, unknown>) =>
    void store.map.set(id, { ...s, flow: "idle" }),
  ),
  clearSession: vi.fn(async (id: string) => void store.map.set(id, { flow: "idle", cart: [] })),
}));

import { handleUpdate } from "../router";
import { CB } from "../messages";

function mkUser(role: TeamBotUser["role"], status: TeamBotUser["status"]): TeamBotUser {
  return { id: "x", telegram_user_id: "555", telegram_username: "t", display_name: "טסט", role, status };
}
const lastText = () => tg.out[tg.out.length - 1]?.text ?? "";
const allText = () => tg.out.map((o) => o.text).join("\n");
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
  auth.listPendingUsers.mockResolvedValue([]);
});

describe("default-deny", () => {
  it("pending user gets the restricted screen, never the menu", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("viewer", "pending"));
    await handleUpdate(startMsg());
    expect(lastText()).toContain("הגישה לבוט מוגבלת");
    expect(lastText()).toContain("555");
    expect(allText()).not.toContain("בחר פעולה");
  });

  it("blocked user gets restricted screen with no code option", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("viewer", "blocked"));
    await handleUpdate(startMsg());
    expect(lastText()).toContain("חסום");
    expect(allText()).not.toContain("בחר פעולה");
  });
});

describe("active users", () => {
  it("authorized_user /start renders the menu with catalog", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("authorized_user", "active"));
    await handleUpdate(startMsg());
    expect(allText()).toContain("בחר פעולה");
    expect(allDatas()).toContain(CB.CATALOG);
  });

  it("admin can open access-requests screen", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("admin", "active"));
    await handleUpdate(cb("menu:admin_requests"));
    expect(allText()).toContain("בקשות גישה");
  });

  it("non-admin cannot reach admin actions (falls back to menu)", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("authorized_user", "active"));
    await handleUpdate(cb("menu:admin_requests"));
    expect(allText()).toContain("בחר פעולה");
    expect(allText()).not.toContain("בקשות גישה");
  });
});

describe("access-code redemption", () => {
  it("valid code activates the user and shows the menu", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("viewer", "pending"));
    auth.redeemAccessCode.mockResolvedValue({ ok: true, role: "authorized_user" });
    // user enters a code as plain text after pressing the code button
    store.map.set("555", { flow: "awaiting_code", cart: [] });
    await handleUpdate(startMsg("ELK-AAAA-BBBB"));
    expect(auth.redeemAccessCode).toHaveBeenCalledWith("555", "ELK-AAAA-BBBB");
    expect(allText()).toContain("בחר פעולה");
  });

  it("invalid code keeps the user out", async () => {
    auth.resolveOrCreateUser.mockResolvedValue(mkUser("viewer", "pending"));
    auth.redeemAccessCode.mockResolvedValue({ ok: false, reason: "not_found" });
    store.map.set("555", { flow: "awaiting_code", cart: [] });
    await handleUpdate(startMsg("WRONG"));
    expect(allText()).toContain("הקוד אינו תקין");
    expect(allText()).not.toContain("בחר פעולה");
  });
});
