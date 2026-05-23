import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getEmailTransport", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.EMAIL_PASS;
    process.env.EMAIL_USER = "elkayam.yomanim@gmail.com";
    process.env.EMAIL_HOST = "smtp.gmail.com";
    process.env.EMAIL_PORT = "587";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("throws a typed error when EMAIL_PASS is missing", async () => {
    const { getEmailTransport } = await import("@/lib/email/transport");
    expect(() => getEmailTransport()).toThrow(/EMAIL_PASS not configured/);
  });

  it("returns a transport when all env vars are present", async () => {
    process.env.EMAIL_PASS = "fake-app-password-1234";
    const { getEmailTransport } = await import("@/lib/email/transport");
    const t = getEmailTransport();
    expect(t).toBeDefined();
    expect(typeof t.sendMail).toBe("function");
  });
});
