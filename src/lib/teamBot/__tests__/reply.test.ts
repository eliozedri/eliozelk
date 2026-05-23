import { describe, it, expect, beforeEach, vi } from "vitest";

// Capture Telegram primitive calls. `editOk` controls whether edits succeed.
const tg = vi.hoisted(() => ({ calls: [] as { m: string; mid?: number }[], editOk: true }));
vi.mock("../telegram", () => ({
  sendMessage: vi.fn(async () => {
    tg.calls.push({ m: "send" });
    return 555; // new message id
  }),
  editMessageText: vi.fn(async (_chatId: number, mid: number) => {
    tg.calls.push({ m: "edit", mid });
    return tg.editOk;
  }),
  deleteMessage: vi.fn(async (_chatId: number, mid: number) => {
    tg.calls.push({ m: "delete", mid });
  }),
  answerCallbackQuery: vi.fn(async () => {}),
}));

// In-memory session.
const store = vi.hoisted(() => ({ s: { flow: "idle", cart: [], wizardMessageId: null } as Record<string, unknown> }));
vi.mock("../sessions", () => ({
  loadSession: vi.fn(async () => store.s),
  saveSession: vi.fn(async (_id: string, st: Record<string, unknown>) => void (store.s = st)),
}));

import { respond, deleteUserMessage } from "../reply";

type AnyCtx = Parameters<typeof respond>[0];
const ctx = (over: Partial<AnyCtx>): AnyCtx =>
  ({ chatId: 10, telegramUserId: "1", user: {}, isCallback: false, ...over } as AnyCtx);

beforeEach(() => {
  tg.calls.length = 0;
  tg.editOk = true;
  store.s = { flow: "idle", cart: [], wizardMessageId: null };
});

describe("respond — single active wizard message", () => {
  it("edits the message a button was tapped on (callback)", async () => {
    await respond(ctx({ isCallback: true, messageId: 42 }), "step");
    expect(tg.calls).toEqual([{ m: "edit", mid: 42 }]);
  });

  it("edits the tracked wizard message on a typed step (no new message)", async () => {
    store.s.wizardMessageId = 99;
    await respond(ctx({ isCallback: false }), "step");
    expect(tg.calls).toEqual([{ m: "edit", mid: 99 }]);
  });

  it("sends a fresh message when there is nothing to edit, and tracks its id", async () => {
    await respond(ctx({ isCallback: false }), "step");
    expect(tg.calls).toEqual([{ m: "send" }]);
    expect(store.s.wizardMessageId).toBe(555);
  });

  it("falls back to a fresh message when the edit fails", async () => {
    store.s.wizardMessageId = 77;
    tg.editOk = false;
    await respond(ctx({ isCallback: false }), "step");
    expect(tg.calls.map((c) => c.m)).toEqual(["edit", "send"]);
    expect(store.s.wizardMessageId).toBe(555);
  });
});

describe("deleteUserMessage", () => {
  it("deletes the user's typed message to keep the chat clean", async () => {
    await deleteUserMessage(ctx({ userMessageId: 7 }));
    expect(tg.calls).toEqual([{ m: "delete", mid: 7 }]);
  });

  it("is a no-op when there is no user message (e.g. a button tap)", async () => {
    await deleteUserMessage(ctx({ isCallback: true, messageId: 1 }));
    expect(tg.calls).toEqual([]);
  });
});
