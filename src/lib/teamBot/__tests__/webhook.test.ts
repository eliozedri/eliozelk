import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/team-bot/webhook/route";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/team-bot/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 1 }, from: { id: 1 } } }),
  });
}

describe("team-bot webhook security boundary", () => {
  beforeEach(() => {
    delete process.env.TEAM_BOT_TELEGRAM_TOKEN;
    delete process.env.TEAM_BOT_WEBHOOK_SECRET;
  });

  it("returns 503 when the bot token is not configured", async () => {
    const res = await POST(req({ "x-telegram-bot-api-secret-token": "anything" }));
    expect(res.status).toBe(503);
  });

  it("returns 401 when the secret header is missing", async () => {
    process.env.TEAM_BOT_TELEGRAM_TOKEN = "test-token";
    process.env.TEAM_BOT_WEBHOOK_SECRET = "expected-secret";
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("returns 401 when the secret header is wrong", async () => {
    process.env.TEAM_BOT_TELEGRAM_TOKEN = "test-token";
    process.env.TEAM_BOT_WEBHOOK_SECRET = "expected-secret";
    const res = await POST(req({ "x-telegram-bot-api-secret-token": "wrong" }));
    expect(res.status).toBe(401);
  });
});
