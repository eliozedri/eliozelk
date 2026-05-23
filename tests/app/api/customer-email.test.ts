import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sendWorkDiaryEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email/sendWorkDiaryEmail", () => ({ sendWorkDiaryEmail }));

const getUser = vi.fn();
const single = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServiceSupabase: () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({ eq: () => ({ single }) }),
    }),
  }),
}));

beforeEach(() => {
  sendWorkDiaryEmail.mockClear();
  getUser.mockReset();
  single.mockReset();
});

function makeReq(body: object, token = "tok") {
  return new NextRequest("http://localhost/api/work-diary/diary-1/customer-email", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const submittedRow = {
  id: "diary-1",
  status: "submitted",
  data: {
    id: "diary-1",
    diaryNumber: "YD-1",
    status: "submitted",
    companySignature: { dataUrl: "x" },
    executionDate: "2026-05-23",
    customerName: "c",
  },
};

describe("POST /api/work-diary/[id]/customer-email", () => {
  it("returns 400 for invalid email", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    single.mockResolvedValue({ data: submittedRow, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/customer-email/route");
    const res = await POST(makeReq({ to: "notanemail" }), { params: Promise.resolve({ id: "diary-invalid" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when 'to' contains CRLF (header injection guard)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    single.mockResolvedValue({ data: submittedRow, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/customer-email/route");
    const res = await POST(makeReq({ to: "ok@a.com\r\nBcc: evil@a.com" }), { params: Promise.resolve({ id: "diary-crlf" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for draft diary", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    single.mockResolvedValue({ data: { ...submittedRow, status: "draft" }, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/customer-email/route");
    const res = await POST(makeReq({ to: "ok@example.com" }), { params: Promise.resolve({ id: "diary-draft" }) });
    expect(res.status).toBe(400);
  });

  it("sends with provided recipient and returns 200", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    single.mockResolvedValue({ data: submittedRow, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/customer-email/route");
    const res = await POST(makeReq({ to: "ok@example.com" }), { params: Promise.resolve({ id: "diary-send" }) });
    expect(res.status).toBe(200);
    expect(sendWorkDiaryEmail).toHaveBeenCalledWith(expect.objectContaining({ mode: "customer", to: "ok@example.com" }));
  });

  it("returns 429 after 5 sends in the same hour for the same diary", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    single.mockResolvedValue({ data: submittedRow, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/customer-email/route");
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const res = await POST(makeReq({ to: "ok@example.com" }), { params: Promise.resolve({ id: "diary-rl" }) });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
