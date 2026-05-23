import { describe, it, expect } from "vitest";
import { mainMenu, restrictedScreen, helpScreen, CB } from "../messages";
import type { TeamBotUser } from "../types";

function user(role: TeamBotUser["role"], status: TeamBotUser["status"] = "active"): TeamBotUser {
  return {
    id: "u1",
    telegram_user_id: "12345",
    telegram_username: "elio",
    display_name: "אליו",
    role,
    status,
  };
}

function buttonDatas(kb: { inline_keyboard: { callback_data: string }[][] }): string[] {
  return kb.inline_keyboard.flat().map((b) => b.callback_data);
}

describe("restrictedScreen (default-deny)", () => {
  it("shows the user's Telegram id and the lock header", () => {
    const s = restrictedScreen("987654321", "new");
    expect(s.text).toContain("הגישה לבוט מוגבלת");
    expect(s.text).toContain("987654321");
  });

  it("offers a code-entry button for pending users, none for blocked", () => {
    expect(buttonDatas(restrictedScreen("1", "pending").keyboard)).toContain(CB.ENTER_CODE);
    expect(buttonDatas(restrictedScreen("1", "blocked").keyboard)).toHaveLength(0);
  });
});

describe("mainMenu role gating", () => {
  it("admin sees order intake + admin controls", () => {
    const datas = buttonDatas(mainMenu(user("admin")).keyboard);
    expect(datas).toEqual(
      expect.arrayContaining([CB.CATALOG, CB.CART, CB.FREETEXT, CB.ORDERS, CB.ADMIN_REQUESTS, CB.ADMIN_NEWCODE]),
    );
  });

  it("authorized_user sees order intake but NOT admin controls", () => {
    const datas = buttonDatas(mainMenu(user("authorized_user")).keyboard);
    expect(datas).toContain(CB.CATALOG);
    expect(datas).not.toContain(CB.ADMIN_REQUESTS);
  });

  it("viewer sees only open orders + help (no order intake, no admin)", () => {
    const datas = buttonDatas(mainMenu(user("viewer")).keyboard);
    expect(datas).toContain(CB.ORDERS);
    expect(datas).toContain(CB.HELP);
    expect(datas).not.toContain(CB.CATALOG);
    expect(datas).not.toContain(CB.ADMIN_REQUESTS);
  });
});

describe("helpScreen", () => {
  it("mentions the Telegram-origin labelling", () => {
    expect(helpScreen(user("authorized_user")).text).toContain("הזמנה דרך הבוט מהטלגרם");
  });
});
