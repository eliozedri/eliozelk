import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sendWorkDiaryEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email/sendWorkDiaryEmail", () => ({ sendWorkDiaryEmail }));

const getUser = vi.fn();
const single = vi.fn();
const updateEq = vi.fn().mockResolvedValue({ error: null });
const update = vi.fn(() => ({ eq: updateEq }));

vi.mock("@/lib/supabase/server", () => ({
  getServiceSupabase: () => ({
    auth: { getUser },
    from: (table: string) =>
      table === "profiles"
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { id: "u1", role: "master", is_active: true, allowed_tabs: ["*"], action_permissions: ["*"] },
                    error: null,
                  }),
              }),
            }),
          }
        : {
            select: () => ({ eq: () => ({ single }) }),
            update,
          },
  }),
}));

beforeEach(() => {
  sendWorkDiaryEmail.mockClear();
  getUser.mockReset();
  single.mockReset();
  update.mockClear();
  updateEq.mockClear();
});

function makeReq(token?: string) {
  return new NextRequest("http://localhost/api/work-diary/diary-1/archive-email", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const submittedRow = {
  id: "diary-1",
  status: "submitted",
  internal_emailed_at: null,
  data: {
    id: "diary-1",
    diaryNumber: "YD-1",
    status: "submitted",
    companySignature: { dataUrl: "x" },
    executionDate: "2026-05-23",
    customerName: "c",
  },
};

describe("POST /api/work-diary/[id]/archive-email", () => {
  it("returns 401 without auth header", async () => {
    const { POST } = await import("@/app/api/work-diary/[id]/archive-email/route");
    const res = await POST(makeReq(), { params: Promise.resolve({ id: "diary-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 skipped=not_submitted for draft diary", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: { ...submittedRow, status: "draft" }, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/archive-email/route");
    const res = await POST(makeReq("t"), { params: Promise.resolve({ id: "diary-1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("skipped");
    expect(body.reason).toBe("not_submitted");
    expect(sendWorkDiaryEmail).not.toHaveBeenCalled();
  });

  it("returns 200 skipped=missing_worker_signature when companySignature absent", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({
      data: { ...submittedRow, data: { ...submittedRow.data, companySignature: null } },
      error: null,
    });
    const { POST } = await import("@/app/api/work-diary/[id]/archive-email/route");
    const res = await POST(makeReq("t"), { params: Promise.resolve({ id: "diary-1" }) });
    const body = await res.json();
    expect(body.status).toBe("skipped");
    expect(body.reason).toBe("missing_worker_signature");
    expect(sendWorkDiaryEmail).not.toHaveBeenCalled();
  });

  it("returns 200 skipped=already_archived when internal_emailed_at present", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({
      data: { ...submittedRow, internal_emailed_at: "2026-05-23T10:00:00Z" },
      error: null,
    });
    const { POST } = await import("@/app/api/work-diary/[id]/archive-email/route");
    const res = await POST(makeReq("t"), { params: Promise.resolve({ id: "diary-1" }) });
    const body = await res.json();
    expect(body.status).toBe("skipped");
    expect(body.reason).toBe("already_archived");
    expect(sendWorkDiaryEmail).not.toHaveBeenCalled();
  });

  it("sends and writes internal_emailed_at on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: submittedRow, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/archive-email/route");
    const res = await POST(makeReq("t"), { params: Promise.resolve({ id: "diary-1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("sent");
    expect(sendWorkDiaryEmail).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      internal_emailed_at: expect.any(String),
      internal_email_error: null,
    }));
  });

  it("writes internal_email_error and returns 200 on send failure", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    single.mockResolvedValue({ data: submittedRow, error: null });
    sendWorkDiaryEmail.mockRejectedValueOnce(new Error("smtp_auth_failed"));
    const { POST } = await import("@/app/api/work-diary/[id]/archive-email/route");
    const res = await POST(makeReq("t"), { params: Promise.resolve({ id: "diary-1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("failed");
    expect(body.error).toContain("smtp_auth_failed");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      internal_email_error: expect.stringContaining("smtp_auth_failed"),
    }));
  });
});
