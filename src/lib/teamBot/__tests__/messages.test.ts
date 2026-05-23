import { describe, it, expect } from "vitest";
import { mainMenu, restrictedScreen, helpScreen, adminAlert, persistentKeyboard, MENU_BUTTON_TEXT, CB, CB_ADMIN_OK } from "../messages";
import type { TeamBotUser } from "../types";

function user(role: TeamBotUser["role"], status: TeamBotUser["status"] = "approved"): TeamBotUser {
  return {
    id: "u1",
    telegram_user_id: "12345",
    chat_id: "12345",
    telegram_username: "elio",
    display_name: "אליו",
    first_name: "אליו",
    last_name: null,
    role,
    status,
  };
}

function buttonDatas(kb: { inline_keyboard: { callback_data?: string }[][] }): string[] {
  return kb.inline_keyboard
    .flat()
    .map((b) => b.callback_data)
    .filter((d): d is string => Boolean(d));
}

describe("restrictedScreen (default-deny)", () => {
  it("pending shows the await-approval message + the user's Telegram id, no buttons", () => {
    const s = restrictedScreen("987654321", "pending");
    expect(s.text).toContain("ממתינה לאישור מנהל");
    expect(s.text).toContain("987654321");
    expect(s.keyboard.inline_keyboard).toHaveLength(0);
  });

  it("rejected and inactive show distinct messages", () => {
    expect(restrictedScreen("1", "rejected").text).toContain("נדחתה");
    expect(restrictedScreen("1", "inactive").text).toContain("הושבת");
  });
});

describe("mainMenu role gating", () => {
  it("admin sees order intake (incl. my-drafts) + admin controls", () => {
    const datas = buttonDatas(mainMenu(user("admin")).keyboard);
    expect(datas).toEqual(
      expect.arrayContaining([
        CB.CATALOG, CB.CART, CB.FREETEXT, CB.MY_DRAFTS, CB.ORDERS, CB.ADMIN_REQUESTS, CB.ADMIN_NEWCODE,
      ]),
    );
  });

  it("authorized_user sees order intake + my-drafts but NOT admin controls", () => {
    const datas = buttonDatas(mainMenu(user("authorized_user")).keyboard);
    expect(datas).toContain(CB.CATALOG);
    expect(datas).toContain(CB.MY_DRAFTS);
    expect(datas).not.toContain(CB.ADMIN_REQUESTS);
  });

  it("viewer sees only system open orders + help (no intake, no my-drafts)", () => {
    const datas = buttonDatas(mainMenu(user("viewer")).keyboard);
    expect(datas).toContain(CB.ORDERS);
    expect(datas).toContain(CB.HELP);
    expect(datas).not.toContain(CB.CATALOG);
    expect(datas).not.toContain(CB.MY_DRAFTS);
  });
});

describe("helpScreen", () => {
  it("mentions the Telegram-origin labelling", () => {
    expect(helpScreen(user("authorized_user")).text).toContain("הזמנה דרך הבוט מהטלגרם");
  });
});

describe("persistentKeyboard", () => {
  it("is a persistent bottom keyboard with the menu button", () => {
    const kb = persistentKeyboard();
    expect(kb.is_persistent).toBe(true);
    expect(kb.resize_keyboard).toBe(true);
    expect(kb.keyboard.flat().map((b) => b.text)).toContain(MENU_BUTTON_TEXT);
  });
});

describe("adminAlert", () => {
  it("includes the requester details and an approve button carrying their id", () => {
    const s = adminAlert(user("viewer", "pending"));
    expect(s.text).toContain("בקשת גישה חדשה");
    expect(s.text).toContain("12345");
    expect(buttonDatas(s.keyboard)).toContain(`${CB_ADMIN_OK}12345`);
  });
});
