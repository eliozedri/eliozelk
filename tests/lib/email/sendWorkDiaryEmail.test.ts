import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "abc@local" });
vi.mock("@/lib/email/transport", () => ({
  getEmailTransport: () => ({ sendMail }),
  EmailConfigError: class EmailConfigError extends Error {},
}));
vi.mock("@/lib/pdf/renderWorkDiaryToBuffer", () => ({
  renderWorkDiaryToBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")),
}));

beforeEach(() => {
  sendMail.mockClear();
  process.env.EMAIL_FROM = "elkayam.yomanim@gmail.com";
  process.env.EMAIL_ARCHIVE_TO = "elkayam.yomanim@gmail.com";
});

const fakeDiary = {
  id: "diary-1",
  diaryNumber: "YD-001",
  status: "submitted",
  customerName: "מע״צ",
  executionDate: "2026-05-23",
  companySignature: {
    dataUrl: "data:image/png;base64,aaa",
    signerName: "דני",
    signerRole: "ראש צוות",
    signerEmail: "",
    location: "",
    signedAt: "2026-05-23T08:00:00Z",
  },
  customerSignature: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("sendWorkDiaryEmail", () => {
  it("sends archive mail with PDF attached, From and To both = EMAIL_FROM", async () => {
    const { sendWorkDiaryEmail } = await import("@/lib/email/sendWorkDiaryEmail");
    await sendWorkDiaryEmail({ diary: fakeDiary, mode: "archive" });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.from).toBe("elkayam.yomanim@gmail.com");
    expect(call.to).toBe("elkayam.yomanim@gmail.com");
    expect(call.subject).toContain("יומן עבודה");
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0].filename).toMatch(/\.pdf$/);
    expect(call.attachments[0].content).toBeInstanceOf(Buffer);
  });

  it("sends customer mail with provided recipient", async () => {
    const { sendWorkDiaryEmail } = await import("@/lib/email/sendWorkDiaryEmail");
    await sendWorkDiaryEmail({ diary: fakeDiary, mode: "customer", to: "customer@example.com" });

    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe("customer@example.com");
    expect(call.from).toBe("elkayam.yomanim@gmail.com");
  });

  it("rejects customer mode without a recipient", async () => {
    const { sendWorkDiaryEmail } = await import("@/lib/email/sendWorkDiaryEmail");
    await expect(
      sendWorkDiaryEmail({ diary: fakeDiary, mode: "customer", to: "" })
    ).rejects.toThrow(/recipient/i);
  });
});
