# Signed Work Diary Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `mailto:` flow with a server-side email flow that automatically archives every submitted work diary to `elkayam.yomanim@gmail.com` with the signed PDF attached, and lets workers optionally send the same PDF to a customer email.

**Architecture:** Two new App Router routes (`archive-email`, `customer-email`) consume a shared `sendWorkDiaryEmail` library. The library renders the PDF server-side from the saved Supabase diary record and sends through nodemailer + Gmail SMTP. The archive flow is idempotent via two new columns on `work_diaries`. The post-submit UI banner self-heals if the archive POST is dropped between submit and side-effect.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + realtime), `@react-pdf/renderer` (already in repo, server-side compatible), nodemailer + Gmail SMTP App Password, Vitest.

**Auth pattern:** This repo uses `Authorization: Bearer <jwt>` + service-role admin client for verification (see `src/app/api/profitability/snapshots/route.ts:3-12`). New routes follow that pattern. The client sends `supabase.auth.getSession().access_token` in the header.

**Spec:** `docs/superpowers/specs/2026-05-23-signed-work-diary-email-design.md`

---

## File Structure

### Created
- `supabase/migrations/20260523000000_work_diary_internal_email.sql` — Adds `internal_emailed_at` and `internal_email_error` columns + unarchived index.
- `src/lib/email/transport.ts` — nodemailer transport singleton, server-only.
- `src/lib/email/sendWorkDiaryEmail.ts` — Pure function: fetches diary, renders PDF, calls transport.
- `src/lib/pdf/renderWorkDiaryToBuffer.ts` — Server-side `@react-pdf/renderer` entry that registers fonts with absolute paths.
- `src/app/api/work-diary/[id]/archive-email/route.ts` — POST; idempotent archive send.
- `src/app/api/work-diary/[id]/customer-email/route.ts` — POST; manual customer send with rate limit.
- `src/components/WorkDiary/PostSubmitBanner.tsx` — Three-state banner with auto-retry and customer-send button.
- `src/components/WorkDiary/CustomerEmailDialog.tsx` — Email input + send action.
- `tests/lib/email/transport.test.ts` — Transport throws on missing `EMAIL_PASS`.
- `tests/lib/email/sendWorkDiaryEmail.test.ts` — Render + send happy path with mocked transport.
- `tests/app/api/archive-email.test.ts` — Route guards (auth, status, signature, idempotency).
- `tests/app/api/customer-email.test.ts` — Route guards (auth, recipient validation, rate limit).
- `.env.local.example` — Documents the new env vars.

### Modified
- `package.json` — Add `nodemailer` + `@types/nodemailer`.
- `src/types/workDiary.ts:136-192` — Add `internalEmailedAt`, `internalEmailError` to `WorkDiary`.
- `src/hooks/useWorkDiaries.ts:9-43` — Map new columns in `rowToDiary` / `diaryToRow`.
- `src/hooks/useWorkDiaries.ts:187-210` — After successful submit, fire-and-forget `POST /archive-email`.
- `src/components/WorkDiary/index.tsx:271` — Swap submit guard from `customerSignature` to `companySignature`.
- `src/components/WorkDiary/DocumentTab.tsx:179-191` — Move `hasError` plumbing from customer block to worker block; update copy.
- `src/components/WorkDiary/DiaryActions.tsx:17,34,148-158` — Remove `onEmail` prop and "שלח במייל" mailto button. Render `PostSubmitBanner` and host `CustomerEmailDialog`.
- `src/lib/workDiaryExport.ts:159-174` — Delete `openEmailDraft()`.

### Deleted
- (Nothing fully deleted — `openEmailDraft` is removed from a still-used file.)

---

## Phase 0 — Prep & dependencies

### Task 0.1: Install nodemailer

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install nodemailer@^6.9.16
npm install -D @types/nodemailer@^6.4.17
```

- [ ] **Step 2: Verify**

```bash
node -e "console.log(require('nodemailer').createTransport ? 'ok' : 'missing')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add nodemailer for server-side email"
```

### Task 0.2: Document env vars

**Files:**
- Create: `.env.local.example`

- [ ] **Step 1: Create the example file**

```bash
# .env.local.example  — copy to .env.local and fill in EMAIL_PASS

# Gmail SMTP for signed work diary emails
EMAIL_FROM=elkayam.yomanim@gmail.com
EMAIL_USER=elkayam.yomanim@gmail.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_PASS=
EMAIL_ARCHIVE_TO=elkayam.yomanim@gmail.com
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "chore(env): document EMAIL_* vars for diary email flow"
```

---

## Phase 1 — Database migration & type changes

### Task 1.1: Write migration

**Files:**
- Create: `supabase/migrations/20260523000000_work_diary_internal_email.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add audit columns for the automatic archive email sent on diary submission.
-- internal_emailed_at: set on successful send.
-- internal_email_error: set on failure (cleared on success).
-- Index supports a manager view of submitted-but-not-archived diaries.

ALTER TABLE work_diaries
  ADD COLUMN IF NOT EXISTS internal_emailed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS internal_email_error TEXT;

CREATE INDEX IF NOT EXISTS idx_work_diaries_unarchived
  ON work_diaries(submitted_at)
  WHERE status = 'submitted' AND internal_emailed_at IS NULL;
```

- [ ] **Step 2: Apply migration**

Apply via Supabase MCP `apply_migration` tool (the user will approve and run it). If running CLI locally: `supabase db push`.

- [ ] **Step 3: Verify in Supabase**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='work_diaries' AND column_name LIKE 'internal_email%';
```
Expected: two rows, `internal_emailed_at` (timestamp with time zone), `internal_email_error` (text).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260523000000_work_diary_internal_email.sql
git commit -m "db(work_diaries): add internal email audit columns"
```

### Task 1.2: Update WorkDiary TypeScript type

**Files:**
- Modify: `src/types/workDiary.ts:136-192`

- [ ] **Step 1: Add fields to interface**

Find the `WorkDiary` interface (line 136). After the `rejectionReason?: string;` line (line 187), add:

```ts
  // ─── Internal archive email audit ─────────────────────────
  /** ISO timestamp set when the automatic archive email succeeded. */
  internalEmailedAt?: string | null;
  /** Last archive-email failure reason. Cleared when archive succeeds. */
  internalEmailError?: string | null;
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/workDiary.ts
git commit -m "types(workDiary): add internalEmailedAt/internalEmailError"
```

### Task 1.3: Map new columns in row mappers

**Files:**
- Modify: `src/hooks/useWorkDiaries.ts:9-43`

- [ ] **Step 1: Add fields to `rowToDiary`**

In the `rowToDiary` function (around line 9-30), add to the returned object:

```ts
internalEmailedAt: (r.internal_emailed_at as string | null | undefined) ?? null,
internalEmailError: (r.internal_email_error as string | null | undefined) ?? null,
```

- [ ] **Step 2: Add fields to `diaryToRow`**

In the `diaryToRow` function (around line 32-45), add to the returned object:

```ts
internal_emailed_at: d.internalEmailedAt ?? null,
internal_email_error: d.internalEmailError ?? null,
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useWorkDiaries.ts
git commit -m "hooks(useWorkDiaries): map internal_email_* columns"
```

---

## Phase 2 — Server-side email library

### Task 2.1: Write failing test for transport

**Files:**
- Create: `tests/lib/email/transport.test.ts`

- [ ] **Step 1: Write the test**

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/lib/email/transport.test.ts
```
Expected: FAIL — module not found (`@/lib/email/transport`).

### Task 2.2: Implement transport

**Files:**
- Create: `src/lib/email/transport.ts`

- [ ] **Step 1: Write the transport**

```ts
import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let _transport: Transporter | null = null;

export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigError";
  }
}

/**
 * Returns a singleton nodemailer transport. Throws EmailConfigError if any
 * required env var is missing (most commonly EMAIL_PASS in production).
 * Server-only; importing this file from a client component fails the build.
 */
export function getEmailTransport(): Transporter {
  if (_transport) return _transport;

  const host = process.env.EMAIL_HOST;
  const port = process.env.EMAIL_PORT;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!pass) throw new EmailConfigError("EMAIL_PASS not configured");
  if (!host) throw new EmailConfigError("EMAIL_HOST not configured");
  if (!port) throw new EmailConfigError("EMAIL_PORT not configured");
  if (!user) throw new EmailConfigError("EMAIL_USER not configured");

  _transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: false, // STARTTLS on 587
    auth: { user, pass },
  });
  return _transport;
}

/** For tests only. Resets the cached transport. */
export function __resetTransportForTests() {
  _transport = null;
}
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/lib/email/transport.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/transport.ts tests/lib/email/transport.test.ts
git commit -m "feat(email): nodemailer transport with EMAIL_PASS guard"
```

### Task 2.3: Server-side PDF render utility

**Files:**
- Create: `src/lib/pdf/renderWorkDiaryToBuffer.ts`

- [ ] **Step 1: Write the renderer**

```ts
import "server-only";
import path from "node:path";
import { pdf, Font } from "@react-pdf/renderer";
import { createElement } from "react";
import { WorkDiaryDocument } from "@/components/pdf/WorkDiaryDocument";
import type { WorkDiary } from "@/types/workDiary";

let fontsRegisteredForNode = false;

/**
 * The WorkDiaryDocument module calls Font.register at import time with relative
 * URLs (`/fonts/Heebo-*.ttf`) suitable for the browser. In Node we need to
 * re-register with absolute filesystem paths. Font.register is last-write-wins
 * per family, so calling this before pdf() takes effect.
 */
function registerHeeboFontsForNode() {
  if (fontsRegisteredForNode) return;
  const fontDir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "Heebo",
    fonts: [
      { src: path.join(fontDir, "Heebo-Regular.ttf"), fontWeight: 400 },
      { src: path.join(fontDir, "Heebo-Bold.ttf"), fontWeight: 700 },
    ],
  });
  fontsRegisteredForNode = true;
}

export async function renderWorkDiaryToBuffer(diary: WorkDiary): Promise<Buffer> {
  registerHeeboFontsForNode();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance = pdf(createElement(WorkDiaryDocument, { diary }) as any);
  const stream = await instance.toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/renderWorkDiaryToBuffer.ts
git commit -m "feat(pdf): server-side work diary renderer with absolute font paths"
```

### Task 2.4: Failing test for sendWorkDiaryEmail

**Files:**
- Create: `tests/lib/email/sendWorkDiaryEmail.test.ts`

- [ ] **Step 1: Write the test**

```ts
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
  companySignature: { dataUrl: "data:image/png;base64,aaa", signerName: "דני", signerRole: "ראש צוות", signerEmail: "", location: "", signedAt: "2026-05-23T08:00:00Z" },
  customerSignature: null,
  // ...other required WorkDiary fields filled in by the test as needed
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
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/lib/email/sendWorkDiaryEmail.test.ts
```
Expected: FAIL — module not found.

### Task 2.5: Implement sendWorkDiaryEmail

**Files:**
- Create: `src/lib/email/sendWorkDiaryEmail.ts`

- [ ] **Step 1: Write the function**

```ts
import "server-only";
import { getEmailTransport } from "@/lib/email/transport";
import { renderWorkDiaryToBuffer } from "@/lib/pdf/renderWorkDiaryToBuffer";
import type { WorkDiary } from "@/types/workDiary";

export type SendMode = "archive" | "customer";

export interface SendWorkDiaryEmailArgs {
  diary: WorkDiary;
  mode: SendMode;
  /** Required when mode = "customer". Ignored for "archive". */
  to?: string;
}

function buildSubject(diary: WorkDiary): string {
  const date = diary.executionDate ?? "";
  const customer = diary.customerName ?? "";
  return `יומן עבודה חתום — אלקיים סימון כבישים — ${date}${customer ? ` — ${customer}` : ""}`;
}

function buildBody(diary: WorkDiary, mode: SendMode): string {
  const date = diary.executionDate ?? "";
  const header = mode === "archive" ? "עותק פנימי לארכיון" : "שלום רב,";
  return [
    header,
    "",
    `מצורף בזאת יומן העבודה החתום עבור העבודה שבוצעה בתאריך ${date}.`,
    `מספר יומן: ${diary.diaryNumber}`,
    "",
    "בברכה,",
    "אלקיים סימון כבישים בע״מ",
  ].join("\n");
}

function buildFilename(diary: WorkDiary): string {
  const date = (diary.executionDate ?? "unknown").replace(/[^0-9-]/g, "");
  const safeId = diary.diaryNumber.replace(/[^A-Za-z0-9_-]/g, "");
  return `elkayam-yoman-${date}-${safeId}.pdf`;
}

export async function sendWorkDiaryEmail(args: SendWorkDiaryEmailArgs): Promise<void> {
  if (args.mode === "customer" && !args.to) {
    throw new Error("Customer email requires a recipient");
  }
  const from = process.env.EMAIL_FROM ?? "elkayam.yomanim@gmail.com";
  const to = args.mode === "archive"
    ? (process.env.EMAIL_ARCHIVE_TO ?? "elkayam.yomanim@gmail.com")
    : args.to!;

  const pdfBuf = await renderWorkDiaryToBuffer(args.diary);
  const transport = getEmailTransport();
  await transport.sendMail({
    from,
    to,
    subject: buildSubject(args.diary),
    text: buildBody(args.diary, args.mode),
    attachments: [
      {
        filename: buildFilename(args.diary),
        content: pdfBuf,
        contentType: "application/pdf",
      },
    ],
  });
}
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/lib/email/sendWorkDiaryEmail.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/sendWorkDiaryEmail.ts tests/lib/email/sendWorkDiaryEmail.test.ts
git commit -m "feat(email): sendWorkDiaryEmail with PDF attachment and archive/customer modes"
```

---

## Phase 3 — API routes

### Task 3.1: Failing test for archive route

**Files:**
- Create: `tests/app/api/archive-email.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sendWorkDiaryEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email/sendWorkDiaryEmail", () => ({ sendWorkDiaryEmail }));

const updateChain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
const getUser = vi.fn();
const fromChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  getServiceSupabase: () => ({
    auth: { getUser },
    from: () => ({ ...fromChain, ...updateChain }),
  }),
}));

beforeEach(() => {
  sendWorkDiaryEmail.mockClear();
  getUser.mockReset();
  fromChain.single.mockReset();
  updateChain.update.mockClear();
  updateChain.eq.mockClear();
});

function makeReq(token?: string) {
  return new NextRequest("http://localhost/api/work-diary/diary-1/archive-email", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("POST /api/work-diary/[id]/archive-email", () => {
  it("returns 401 without auth header", async () => {
    const { POST } = await import("@/app/api/work-diary/[id]/archive-email/route");
    const res = await POST(makeReq(), { params: Promise.resolve({ id: "diary-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 skipped=not_submitted for draft diary", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    fromChain.single.mockResolvedValue({
      data: {
        id: "diary-1",
        status: "draft",
        internal_emailed_at: null,
        data: { companySignature: { dataUrl: "x" } },
      },
      error: null,
    });
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
    fromChain.single.mockResolvedValue({
      data: { id: "diary-1", status: "submitted", internal_emailed_at: null, data: { companySignature: null } },
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
    fromChain.single.mockResolvedValue({
      data: {
        id: "diary-1",
        status: "submitted",
        internal_emailed_at: "2026-05-23T10:00:00Z",
        data: { companySignature: { dataUrl: "x" } },
      },
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
    fromChain.single.mockResolvedValue({
      data: {
        id: "diary-1",
        status: "submitted",
        internal_emailed_at: null,
        data: { id: "diary-1", diaryNumber: "YD-1", status: "submitted", companySignature: { dataUrl: "x" }, executionDate: "2026-05-23", customerName: "c" },
      },
      error: null,
    });
    const { POST } = await import("@/app/api/work-diary/[id]/archive-email/route");
    const res = await POST(makeReq("t"), { params: Promise.resolve({ id: "diary-1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("sent");
    expect(sendWorkDiaryEmail).toHaveBeenCalledOnce();
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
      internal_emailed_at: expect.any(String),
      internal_email_error: null,
    }));
  });

  it("writes internal_email_error and returns 200 on send failure", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    fromChain.single.mockResolvedValue({
      data: {
        id: "diary-1",
        status: "submitted",
        internal_emailed_at: null,
        data: { id: "diary-1", diaryNumber: "YD-1", status: "submitted", companySignature: { dataUrl: "x" }, executionDate: "2026-05-23", customerName: "c" },
      },
      error: null,
    });
    sendWorkDiaryEmail.mockRejectedValueOnce(new Error("smtp_auth_failed"));
    const { POST } = await import("@/app/api/work-diary/[id]/archive-email/route");
    const res = await POST(makeReq("t"), { params: Promise.resolve({ id: "diary-1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("failed");
    expect(body.error).toContain("smtp_auth_failed");
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
      internal_email_error: expect.stringContaining("smtp_auth_failed"),
    }));
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/app/api/archive-email.test.ts
```
Expected: FAIL — module not found.

### Task 3.2: Implement archive route

**Files:**
- Create: `src/app/api/work-diary/[id]/archive-email/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sendWorkDiaryEmail } from "@/lib/email/sendWorkDiaryEmail";
import type { WorkDiary } from "@/types/workDiary";

export const maxDuration = 30;

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getServiceSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = getServiceSupabase();

  const { data: row, error: readErr } = await db
    .from("work_diaries")
    .select("id, status, internal_emailed_at, data")
    .eq("id", id)
    .single();

  if (readErr || !row) {
    return NextResponse.json({ error: readErr?.message ?? "Diary not found" }, { status: 404 });
  }

  if (row.status !== "submitted") {
    return NextResponse.json({ status: "skipped", reason: "not_submitted" }, { status: 200 });
  }
  if (row.internal_emailed_at) {
    return NextResponse.json({ status: "skipped", reason: "already_archived" }, { status: 200 });
  }

  const diary = row.data as WorkDiary;
  if (!diary?.companySignature?.dataUrl) {
    return NextResponse.json({ status: "skipped", reason: "missing_worker_signature" }, { status: 200 });
  }

  try {
    await sendWorkDiaryEmail({ diary, mode: "archive" });
    const now = new Date().toISOString();
    await db
      .from("work_diaries")
      .update({ internal_emailed_at: now, internal_email_error: null })
      .eq("id", id);
    return NextResponse.json({ status: "sent", at: now });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("work_diaries")
      .update({ internal_email_error: msg })
      .eq("id", id);
    // 200 by design: this is a recorded outcome, not an HTTP error.
    return NextResponse.json({ status: "failed", error: msg }, { status: 200 });
  }
}
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/app/api/archive-email.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/work-diary/[id]/archive-email/route.ts tests/app/api/archive-email.test.ts
git commit -m "feat(api): archive-email route with idempotency + failure logging"
```

### Task 3.3: Failing test for customer-email route

**Files:**
- Create: `tests/app/api/customer-email.test.ts`

- [ ] **Step 1: Write the test**

```ts
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
  data: { id: "diary-1", diaryNumber: "YD-1", status: "submitted", companySignature: { dataUrl: "x" }, executionDate: "2026-05-23", customerName: "c" },
};

describe("POST /api/work-diary/[id]/customer-email", () => {
  it("returns 400 for invalid email", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    single.mockResolvedValue({ data: submittedRow, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/customer-email/route");
    const res = await POST(makeReq({ to: "notanemail" }), { params: Promise.resolve({ id: "diary-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when 'to' contains CRLF (header injection guard)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    single.mockResolvedValue({ data: submittedRow, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/customer-email/route");
    const res = await POST(makeReq({ to: "ok@a.com\r\nBcc: evil@a.com" }), { params: Promise.resolve({ id: "diary-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for draft diary", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    single.mockResolvedValue({ data: { ...submittedRow, status: "draft" }, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/customer-email/route");
    const res = await POST(makeReq({ to: "ok@example.com" }), { params: Promise.resolve({ id: "diary-1" }) });
    expect(res.status).toBe(400);
  });

  it("sends with provided recipient and returns 200", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    single.mockResolvedValue({ data: submittedRow, error: null });
    const { POST } = await import("@/app/api/work-diary/[id]/customer-email/route");
    const res = await POST(makeReq({ to: "ok@example.com" }), { params: Promise.resolve({ id: "diary-2" }) });
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
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/app/api/customer-email.test.ts
```
Expected: FAIL — module not found.

### Task 3.4: Implement customer-email route

**Files:**
- Create: `src/app/api/work-diary/[id]/customer-email/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sendWorkDiaryEmail } from "@/lib/email/sendWorkDiaryEmail";
import type { WorkDiary } from "@/types/workDiary";

export const maxDuration = 30;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory rate limit: 5 sends per diary per hour. Reset on cold start (acceptable for anti-spam).
const sendBuckets = new Map<string, number[]>();
const RATE_LIMIT_PER_HOUR = 5;

function rateLimited(diaryId: string): boolean {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const bucket = (sendBuckets.get(diaryId) ?? []).filter(t => t > oneHourAgo);
  if (bucket.length >= RATE_LIMIT_PER_HOUR) {
    sendBuckets.set(diaryId, bucket);
    return true;
  }
  bucket.push(now);
  sendBuckets.set(diaryId, bucket);
  return false;
}

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getServiceSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const to = typeof body?.to === "string" ? body.to.trim() : "";

  if (!to || !EMAIL_REGEX.test(to) || /[\r\n]/.test(to)) {
    return NextResponse.json({ error: "Invalid recipient email" }, { status: 400 });
  }

  if (rateLimited(id)) {
    return NextResponse.json({ error: "Too many sends for this diary, try again later" }, { status: 429 });
  }

  const db = getServiceSupabase();
  const { data: row, error: readErr } = await db
    .from("work_diaries")
    .select("id, status, data")
    .eq("id", id)
    .single();
  if (readErr || !row) {
    return NextResponse.json({ error: readErr?.message ?? "Diary not found" }, { status: 404 });
  }
  if (row.status !== "submitted") {
    return NextResponse.json({ error: "Diary is not submitted" }, { status: 400 });
  }
  const diary = row.data as WorkDiary;
  if (!diary?.companySignature?.dataUrl) {
    return NextResponse.json({ error: "Worker signature missing" }, { status: 400 });
  }

  try {
    await sendWorkDiaryEmail({ diary, mode: "customer", to });
    return NextResponse.json({ status: "sent", to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/app/api/customer-email.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/work-diary/[id]/customer-email/route.ts tests/app/api/customer-email.test.ts
git commit -m "feat(api): customer-email route with email validation + rate limit"
```

---

## Phase 4 — UI changes

### Task 4.1: Swap submit guard from customer to worker signature

**Files:**
- Modify: `src/components/WorkDiary/index.tsx:271`
- Modify: `src/components/WorkDiary/DocumentTab.tsx:179-191`

- [ ] **Step 1: Update submit guard**

In `src/components/WorkDiary/index.tsx`, find the block at line 271 and change:

```ts
// BEFORE
if (!diary.customerSignature?.dataUrl) {
  setSignatureError(true);
  ...
}

// AFTER
if (!diary.companySignature?.dataUrl) {
  setSignatureError(true);
  ...
}
```

- [ ] **Step 2: Move `hasError` plumbing to worker block**

In `src/components/WorkDiary/DocumentTab.tsx`, swap which `SignatureBlock` receives `hasError`:

```tsx
{/* Signatures */}
<SignatureBlock
  title="חתימת קבלן / מפקח"
  sig={diary.customerSignature}
  onChange={(sig) => { onChange({ customerSignature: sig }); }}
  disabled={disabled}
  // hasError removed from customer block
/>
<SignatureBlock
  title="חתימת ראש צוות (חובה)"
  sig={diary.companySignature}
  onChange={(sig) => { onChange({ companySignature: sig }); if (sig.dataUrl) onSignatureChange?.(); }}
  disabled={disabled}
  hasError={signatureError}
/>
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/WorkDiary/index.tsx src/components/WorkDiary/DocumentTab.tsx
git commit -m "fix(workDiary): require worker signature on submit, not customer"
```

### Task 4.2: Delete openEmailDraft + onEmail wiring

**Files:**
- Modify: `src/lib/workDiaryExport.ts:159-174`
- Modify: `src/components/WorkDiary/DiaryActions.tsx`

- [ ] **Step 1: Delete `openEmailDraft`**

In `src/lib/workDiaryExport.ts`, remove the entire `openEmailDraft` function (lines 159-174). Save.

- [ ] **Step 2: Remove `onEmail` prop and button from DiaryActions**

In `src/components/WorkDiary/DiaryActions.tsx`:
- Remove `onEmail: () => void;` from the `Props` interface (line 17).
- Remove `onEmail,` from the destructured params (line 34).
- Delete the entire `<button ...onClick={onEmail}...>שלח במייל</button>` block (lines 148-158).

- [ ] **Step 3: Remove `onEmail` call sites**

```bash
grep -rn "onEmail\|openEmailDraft" src/
```
Expected: empty output (or only the now-removed lines). Fix any remaining call sites by removing the prop pass-through.

- [ ] **Step 4: Build + typecheck**

```bash
npx tsc --noEmit && npm run build
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workDiaryExport.ts src/components/WorkDiary/DiaryActions.tsx
git commit -m "refactor(workDiary): remove mailto-based openEmailDraft and onEmail wiring"
```

### Task 4.3: Fire-and-forget archive POST after submit

**Files:**
- Modify: `src/hooks/useWorkDiaries.ts:187-210`

- [ ] **Step 1: Update `submitDiary`**

Locate the `submitDiary` callback (line 187). After the successful Supabase update, add a fire-and-forget call to the archive route:

```ts
const submitDiary = useCallback((id: string) => {
  const original = diaries.find(d => d.id === id);
  if (!original) return;
  const now = new Date().toISOString();
  const updated = { ...original, status: "submitted" as WorkDiaryStatus, submittedAt: now, updatedAt: now };
  setDiaries(prev => prev.map(d => d.id === id ? updated : d));
  const supa = getSupabase();
  if (!supa) return;

  supa
    .from("work_diaries")
    .update({ status: "submitted", submitted_at: now, updated_at: now, data: updated })
    .eq("id", id)
    .then(async ({ error }) => {
      if (error) {
        console.error("[diaries] submit failed:", error.message);
        return;
      }
      // Fire-and-forget archive email. Failures are recorded on the diary
      // row (banner picks them up via realtime); we never block submit success.
      try {
        const { data: { session } } = await supa.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        await fetch(`/api/work-diary/${id}/archive-email`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.warn("[diaries] archive-email kickoff failed:", e);
      }
    });
}, [diaries, setDiaries]);
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useWorkDiaries.ts
git commit -m "feat(workDiary): kick off archive-email after successful submit"
```

### Task 4.4: PostSubmitBanner component

**Files:**
- Create: `src/components/WorkDiary/PostSubmitBanner.tsx`

- [ ] **Step 1: Write the banner**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { WorkDiary } from "@/types/workDiary";

interface Props {
  diary: WorkDiary;
  onOpenCustomerDialog: () => void;
}

export function PostSubmitBanner({ diary, onOpenCustomerDialog }: Props) {
  const [retrying, setRetrying] = useState(false);
  const autoFiredRef = useRef(false);

  const emailed = diary.internalEmailedAt ?? null;
  const error = diary.internalEmailError ?? null;

  async function callArchive() {
    setRetrying(true);
    try {
      const supa = getSupabase();
      if (!supa) return;
      const { data: { session } } = await supa.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch(`/api/work-diary/${diary.id}/archive-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.warn("[banner] archive retry failed:", e);
    } finally {
      setRetrying(false);
    }
  }

  // Auto-heal: if the diary is submitted but never archived AND has no error
  // (likely the submit-then-network-drop case), fire the archive POST once.
  useEffect(() => {
    if (diary.status !== "submitted") return;
    if (emailed) return;
    if (error) return;
    if (autoFiredRef.current) return;
    autoFiredRef.current = true;
    void callArchive();
  }, [diary.status, emailed, error, diary.id]);

  if (diary.status !== "submitted") return null;

  const sending = !emailed && !error;
  const sent = !!emailed;
  const failed = !!error && !emailed;

  return (
    <div dir="rtl" className="mx-3 my-2 rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-2">
      {sending && (
        <span className="text-gray-600">שולח עותק לארכיון יומני אלקיים...</span>
      )}
      {sent && (
        <span className="text-emerald-700">
          ✓ היומן הוגש ונשמר. עותק PDF נשלח לארכיון אלקיים.
        </span>
      )}
      {failed && (
        <span className="text-amber-700">
          ⚠ היומן נשמר במערכת, אך שליחת העותק הפנימי נכשלה.
        </span>
      )}

      <div className="flex items-center gap-2">
        {failed && (
          <button
            type="button"
            disabled={retrying}
            onClick={callArchive}
            className="px-3 py-1 rounded-md border border-amber-400 text-amber-800 text-xs font-medium disabled:opacity-50"
          >
            {retrying ? "שולח..." : "נסה שוב"}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenCustomerDialog}
          className="px-3 py-1 rounded-md border border-blue-400 text-blue-700 text-xs font-medium"
        >
          שלח עותק ללקוח במייל
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/WorkDiary/PostSubmitBanner.tsx
git commit -m "feat(workDiary): PostSubmitBanner with archive status and auto-retry"
```

### Task 4.5: CustomerEmailDialog component

**Files:**
- Create: `src/components/WorkDiary/CustomerEmailDialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { toast } from "sonner";

interface Props {
  diaryId: string;
  open: boolean;
  onClose: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CustomerEmailDialog({ diaryId, open, onClose }: Props) {
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSend() {
    setError(null);
    const trimmed = to.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setError("כתובת המייל אינה תקינה");
      return;
    }
    setSending(true);
    try {
      const supa = getSupabase();
      if (!supa) {
        setError("לא ניתן לשלוח כעת");
        return;
      }
      const { data: { session } } = await supa.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/work-diary/${diaryId}/customer-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "content-type": "application/json" },
        body: JSON.stringify({ to: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `שליחה נכשלה (${res.status})`);
        return;
      }
      toast.success(`נשלח ל-${trimmed}`);
      setTo("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-4">
        <h3 className="text-base font-semibold mb-2">שליחת עותק ללקוח</h3>
        <p className="text-xs text-gray-500 mb-3">כתובת מייל של נציג הלקוח/קבלן.</p>
        <input
          autoFocus
          type="email"
          inputMode="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="example@domain.com"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
        />
        {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {sending ? "שולח..." : "שלח"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/WorkDiary/CustomerEmailDialog.tsx
git commit -m "feat(workDiary): CustomerEmailDialog for optional manual customer sends"
```

### Task 4.6: Wire banner + dialog into the work-diary page

**Files:**
- Modify: `src/components/WorkDiary/index.tsx`

- [ ] **Step 1: Import the new components**

At the top of `src/components/WorkDiary/index.tsx`, add:

```tsx
import { PostSubmitBanner } from "./PostSubmitBanner";
import { CustomerEmailDialog } from "./CustomerEmailDialog";
```

- [ ] **Step 2: Add dialog open state**

Inside the component body, add:

```tsx
const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
```

- [ ] **Step 3: Render banner + dialog**

Just above the `DiaryActions` JSX render, insert:

```tsx
<PostSubmitBanner
  diary={diary}
  onOpenCustomerDialog={() => setCustomerDialogOpen(true)}
/>
<CustomerEmailDialog
  diaryId={diary.id}
  open={customerDialogOpen}
  onClose={() => setCustomerDialogOpen(false)}
/>
```

- [ ] **Step 4: Build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/WorkDiary/index.tsx
git commit -m "feat(workDiary): mount PostSubmitBanner + CustomerEmailDialog"
```

---

## Phase 5 — Manual verification & secret check

### Task 5.1: Local SMTP smoke test

**Prerequisite:** The user must add a Gmail App Password to `.env.local`.

- [ ] **Step 1: Confirm `EMAIL_PASS` is set locally**

```bash
test -n "$(grep -E '^EMAIL_PASS=.+' .env.local || true)" && echo "ok" || echo "missing"
```

If the output is `missing`, **stop and ask the user for the Gmail App Password**. Per spec §12: enable 2FA on `elkayam.yomanim@gmail.com`, generate a 16-char App Password (Mail / custom name "Elkayam diaries server"), paste it into `.env.local` as `EMAIL_PASS=<value>`.

- [ ] **Step 2: Start dev server**

```bash
kill $(lsof -ti :3000) 2>/dev/null; sleep 1
npm run dev &
```

Wait for `✓ Ready`.

- [ ] **Step 3: Sign in and submit a test diary**

In a browser on http://localhost:3000:
1. Sign in.
2. Create a draft diary, fill required fields, sign the **worker** block ("חתימת ראש צוות").
3. Tap "שלח יומן" → confirm Submit succeeds.
4. Open DevTools → Network. Confirm a `POST /api/work-diary/<id>/archive-email` request returned 200 with `{ status: "sent", at: ... }`.
5. Confirm the banner transitions to green "עותק PDF נשלח לארכיון אלקיים."
6. Check `elkayam.yomanim@gmail.com` inbox: there should be an email **from** that same address with subject "יומן עבודה חתום — אלקיים סימון כבישים — ..." and an attached PDF named `elkayam-yoman-YYYY-MM-DD-<diaryNumber>.pdf`.
7. Open the PDF: confirm the worker signature appears.

- [ ] **Step 4: Verify idempotency**

Edit the same submitted diary (touch a notes field), save. Confirm no second email appears in the inbox and the Network tab shows no archive POST (only the auto-fire was on submit; subsequent saves don't trigger it).

For belt-and-braces, hit the route directly:

```bash
curl -X POST http://localhost:3000/api/work-diary/<id>/archive-email \
  -H "Authorization: Bearer <access_token_from_browser>"
```
Expected: `{ "status": "skipped", "reason": "already_archived" }`.

- [ ] **Step 5: Verify worker-signature guard**

Create a new diary. Leave "חתימת ראש צוות" empty. Tap "שלח יומן". Confirm submit is blocked with the worker-block highlighted red.

- [ ] **Step 6: Verify customer optional send**

After submit, click "שלח עותק ללקוח במייל". Enter a real test address you control. Confirm:
- Receipt at that address with the PDF attached.
- The diary's `internal_emailed_at` is unchanged.
- No new column written for customer recipient.

- [ ] **Step 7: Verify no mailto leaks**

```bash
grep -rn 'mailto:' src/
```
Expected: empty.

```bash
npm run build && grep -r 'mailto:' .next/static/ 2>/dev/null | head -5
```
Expected: empty.

### Task 5.2: Frontend secret-isolation check

- [ ] **Step 1: Grep the built client bundle**

```bash
npm run build
grep -rn 'EMAIL_PASS\|smtp.gmail.com\|GMAIL_APP_PASSWORD' .next/static/ 2>/dev/null
```
Expected: empty output. If any match appears, `transport.ts` was imported from a client component — locate and fix the import.

- [ ] **Step 2: Confirm `server-only` guard works**

Add a temporary import of `@/lib/email/transport` into a client component (e.g., `WorkDiary/index.tsx`), run `npm run build`, expect a build error mentioning `server-only`. **Revert the temporary import** before committing anything.

### Task 5.3: Mobile field-readiness check

- [ ] **Step 1: Tunnel dev to phone or use Vercel preview**

Either deploy to a preview branch on Vercel (with `EMAIL_PASS` set in Preview env), or use a mobile-on-LAN URL.

- [ ] **Step 2: Submit a diary from a real phone**

- Confirm the phone's mail app **never opens**.
- Confirm `POST /archive-email` completes despite slower mobile network.
- Confirm the banner reaches the green state on the phone.
- Optionally: deliberately put the phone in airplane mode after tapping "שלח יומן", then re-open the page online. Confirm the banner auto-fires the archive POST and reaches green.

---

## Self-Review

### Spec coverage

| Spec section | Implementing task(s) |
|---|---|
| §4.1 Drafts never email | 3.1 (test) + 3.2 (route guard) |
| §4.2 Worker signature mandatory | 4.1 |
| §4.3 Submit saves before side-effects | 4.3 (fire-and-forget after success) |
| §4.4 Idempotent archive | 1.1 (column), 3.1 (test), 3.2 (`already_archived` branch) |
| §4.5 Customer optional manual | 3.3, 3.4, 4.5, 4.6 |
| §4.6 Server-side only | 2.1, 2.2 (server-only transport); 4.2 (mailto deletion) |
| §4.7 From / To wiring | 2.5 |
| §4.8 PDF from Supabase row | 2.3, 2.5, 3.2 |
| §4.9 Failure non-destructive | 3.2 (failure branch writes `internal_email_error`, returns 200) |
| §4.10 Secrets isolated | 2.2 (`server-only`), 5.2 (bundle grep) |
| §5 Architecture / auto-retry | 4.4 (banner self-heal effect) |
| §6 Data model | 1.1, 1.2, 1.3 |
| §7 Module layout | All Phase 2-4 tasks |
| §8 UI flow | 4.1, 4.4, 4.5, 4.6 |
| §9 Error matrix | 3.2, 3.4, 4.4 |
| §10 Security | 2.2, 3.4 (regex + CRLF guard + rate limit) |
| §11 Vercel function config | 3.2, 3.4 (`maxDuration = 30`) |
| §12 Env vars | 0.2, 5.1 |
| §13 Testing | 2.1, 2.4, 3.1, 3.3, 5.1-5.3 |

No gaps.

### Placeholder scan

No `TBD` / `TODO` / "add error handling" anywhere. Every code step shows the full code. Every command shows expected output. The only deferred action is "user provides Gmail App Password" — explicitly stopped on in Task 5.1 Step 1.

### Type / name consistency

- `internalEmailedAt` / `internal_emailed_at`: TS camelCase in §1.2 + §1.3, snake in §1.1 + §3.2 — matches Supabase mapper convention.
- `internalEmailError` / `internal_email_error`: same.
- Function `sendWorkDiaryEmail` (§2.5) signature matches every call site (§3.2, §3.4).
- `renderWorkDiaryToBuffer` signature matches mock and call site.
- Route param `{ id }` extraction via `await ctx.params` matches Next 16 App Router convention.

No drift.
