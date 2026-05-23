# Signed Work Diary Email — Design Spec

**Status**: Approved (brainstorming → ready for implementation plan)
**Date**: 2026-05-23
**Owner**: Elio
**Sender / archive account**: `elkayam.yomanim@gmail.com` (Gmail)

## 1. Problem & goal

Today, the "שלח במייל" button on a submitted work diary calls `openEmailDraft()` in `src/lib/workDiaryExport.ts:159`, which uses a `mailto:` link. The phone's mail app opens, no PDF is attached, and the email is sent from the worker's personal account — not from Elkayam. There is no internal archive copy.

The goal is a server-side email flow that:
- Automatically archives every submitted work diary to `elkayam.yomanim@gmail.com` with the signed PDF attached.
- Lets the worker optionally send the same PDF to a customer/contractor email entered on the spot.
- Never opens the phone's mail app and never sends from the worker's personal email.
- Survives flaky field LTE without losing the diary.

## 2. Scope & non-goals

### In scope
- One new Supabase migration (two columns on `work_diaries`).
- Two new App Router API routes (`archive-email`, `customer-email`).
- A shared server-side email library (transport + send function + server-side PDF render).
- UI swap of the mandatory-signature guard from customer to worker.
- New post-submit banner with archive status and optional customer-send button.
- Customer email dialog.
- Removal of `openEmailDraft()` and the old `onEmail` wiring.

### Out of scope
- Permanent customer-email field on customer/contact records (deferred; user explicitly opted to keep it manual at send time).
- Email log / audit table (the two new columns on the diary itself cover the only audited send today — the archive copy).
- Resend UI for customer emails (the dialog already supports retry on error; no historical record needed).
- Migration to a transactional provider (Resend, Postmark). Gmail SMTP via nodemailer is the user's chosen transport.

## 3. Current-state findings

Inspected the existing flow before designing.

| Concern | Current state | Reference |
|---|---|---|
| Draft / submitted lifecycle | `WorkDiaryStatus = "draft" \| "submitted" \| "cancelled"`. `submitDiary()` flips status + sets `submitted_at`. | `src/types/workDiary.ts:3`, `src/hooks/useWorkDiaries.ts:187` |
| Signature fields | `WorkDiary.customerSignature` (UI label "חתימת קבלן / מפקח" = contractor/supervisor) and `WorkDiary.companySignature` (UI label "חתימת ראש צוות" = **the worker**). | `src/types/workDiary.ts:158-159`, `src/components/WorkDiary/DocumentTab.tsx:179-191` |
| **Existing submit guard is INVERTED vs business rule** | Today blocks submit when `customerSignature` is missing. Business rule: worker signature (`companySignature`) is mandatory; customer signature is optional. **Must swap.** | `src/components/WorkDiary/index.tsx:271` |
| PDF generation | Client-side via `@react-pdf/renderer` rendering `WorkDiaryDocument`. Pure JS, runs in Node. | `src/lib/workDiaryExport.ts:142`, `src/components/pdf/WorkDiaryDocument.tsx` |
| Current email path | `openEmailDraft()` opens `mailto:` link. No PDF attached. To be **removed**. | `src/lib/workDiaryExport.ts:159` |
| Persistence | Supabase `work_diaries` table. Promoted columns: `status`, `submitted_at`, `order_id`, `approval_status`, `approved_by`, `approved_at`, `rejection_reason`. Full diary blob in `data` JSONB. | `supabase/migrations/20260514000000_promote_work_diary_columns.sql` |
| Submit driver | Client-side: `useWorkDiaries.ts:187` does `update({ status, submitted_at, data })`. No server trigger today. | `src/hooks/useWorkDiaries.ts:187` |
| Realtime | `work_diaries` is subscribed via Supabase realtime in `useWorkDiaries.ts:118`. UI auto-updates when columns change. | `src/hooks/useWorkDiaries.ts:118` |
| Email audit table | None exists. The archive send is logged via two new columns on the diary itself. |
| Email infra | No `nodemailer`, no `resend`, no `EMAIL_*` env vars, no existing email routes. Greenfield. |
| Vercel runtime | Project deploys to Vercel; Fluid Compute (Node) is the default. `@react-pdf/renderer` and `nodemailer` work without Edge. |

## 4. Business rules (locked)

1. **Drafts never email.** Neither archive nor customer.
2. **Worker signature mandatory** for submit. Customer signature optional.
3. **Submit always saves the diary first.** Archive email is a downstream side-effect that must never block or roll back the save.
4. **Archive email is automatic and fires once per submitted diary.** Idempotent via `internal_emailed_at IS NULL`.
5. **Customer email is optional and manual** — only sends when the worker clicks the button and provides a valid recipient address.
6. **All sends are server-side.** No `mailto`, no client SMTP, no phone mail app.
7. **From** is always `elkayam.yomanim@gmail.com`. **Archive To** is the same address. **Customer To** is the manually entered recipient.
8. **PDF is built from the saved submitted diary record in Supabase**, which is the source of truth.
9. **Failure handling**: diary stays saved; failure reason recorded; UI shows retry; manager can find un-archived diaries.
10. **Secrets** (`EMAIL_PASS`) never reach the frontend bundle.

## 5. Architecture

```
                         ┌─────────── Worker on mobile ───────────┐
                         │                                         │
                         │  1. Fills diary, signs (חתימת ראש       │
                         │     צוות = companySignature).           │
                         │  2. Customer optionally signs.          │
                         │  3. Taps "שלח יומן".                    │
                         │                                         │
                         │  UI guard: blocked if !companySignature │
                         └──────────────┬──────────────────────────┘
                                        │ saveDiary + submitDiary
                                        ▼
                              ┌───────────────────────┐
                              │  Supabase             │
                              │  work_diaries row     │
                              │  status='submitted'   │
                              └──────────┬────────────┘
                                         │ on success, fire-and-forget
                                         ▼
                  ┌──────────── POST /api/work-diary/[id]/archive-email ─────┐
                  │                                                          │
                  │  • Auth: Supabase SSR session (user-scoped)              │
                  │  • Read diary row via user-scoped client (RLS applies)   │
                  │  • Guards:                                               │
                  │    - status === 'submitted'                              │
                  │    - data.companySignature.dataUrl present               │
                  │    - internal_emailed_at IS NULL                         │
                  │      (else: return { skipped:"already_archived" })       │
                  │  • Render PDF (server-side @react-pdf/renderer)          │
                  │  • Send via nodemailer + Gmail SMTP                      │
                  │    From: elkayam.yomanim@gmail.com                       │
                  │    To:   EMAIL_ARCHIVE_TO (= same)                       │
                  │    Attachment: יומן_עבודה_<diaryNumber>.pdf             │
                  │  • On success: UPDATE internal_emailed_at = now(),       │
                  │                       internal_email_error = NULL        │
                  │  • On failure: UPDATE internal_email_error = msg         │
                  │  • Return 200 in both cases (failure is data, not error) │
                  └────────────────────────┬─────────────────────────────────┘
                                           │
                                           ▼ realtime
                              ┌────────────────────────────┐
                              │  Post-submit banner reacts │
                              │  to internal_emailed_at /  │
                              │  internal_email_error.     │
                              └────────────┬───────────────┘
                                           │
                                           ▼
                              ┌────────────────────────────┐
                              │ [שלח עותק ללקוח במייל]    │
                              │ opens CustomerEmailDialog  │
                              └────────────┬───────────────┘
                                           │
                                           ▼
                  POST /api/work-diary/[id]/customer-email  { to: "..." }
                                           │
                                           ▼
                  Same auth, same guards (status=submitted, signed),
                  same PDF render, To: <entered email>.
                  No DB column updated.
                  Errors surfaced as toast; diary untouched.
```

### Auto-retry on reload
If submit succeeds but the client never reaches `POST /archive-email` (e.g., network drops between Supabase update and the API call), the diary lands in state `submitted, internal_emailed_at=null, internal_email_error=null`. On next mount, the post-submit banner detects this state and **re-fires the archive POST automatically**. This makes the "always eventually archived" guarantee real without manual intervention.

## 6. Data model changes

New migration: `supabase/migrations/20260523000000_work_diary_internal_email.sql`

```sql
ALTER TABLE work_diaries
  ADD COLUMN IF NOT EXISTS internal_emailed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS internal_email_error TEXT;

-- Manager-view index: submitted diaries that haven't been archived yet
CREATE INDEX IF NOT EXISTS idx_work_diaries_unarchived
  ON work_diaries(submitted_at)
  WHERE status = 'submitted' AND internal_emailed_at IS NULL;
```

TypeScript mirror in `src/types/workDiary.ts` (added to `WorkDiary` interface):

```ts
internalEmailedAt?: string | null;   // ISO timestamp, set on successful archive send
internalEmailError?: string | null;  // last archive failure reason, cleared on success
```

Mappers in `src/hooks/useWorkDiaries.ts` updated:
- `rowToDiary` reads `internal_emailed_at`, `internal_email_error`.
- `diaryToRow` writes them (kept null on initial submit; populated by the server route).

## 7. Module layout

| Status | Path | Purpose |
|---|---|---|
| NEW | `src/lib/email/transport.ts` | Singleton nodemailer transport. Reads `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`. Server-only (`import "server-only"`). Throws on missing `EMAIL_PASS`. |
| NEW | `src/lib/email/sendWorkDiaryEmail.ts` | Pure function `sendWorkDiaryEmail({ diaryId, to, mode: "archive"\|"customer" })`. Used by both routes. Fetches diary via passed Supabase client, renders PDF, sends. Returns `{ ok: true } \| { ok: false, error: string }`. |
| NEW | `src/lib/pdf/renderWorkDiaryToBuffer.ts` | `import("@react-pdf/renderer").pdf(...).toBuffer()`. Server-only entry that imports the shared `WorkDiaryDocument`. |
| CHG | `src/components/pdf/WorkDiaryDocument.tsx` | Audit for any `window`/`document`/`navigator` access. Currently this is a `@react-pdf/renderer` component, so it should already be portable; spot-check during implementation. |
| NEW | `src/app/api/work-diary/[id]/archive-email/route.ts` | POST. Auth required. Guards + idempotency. Updates columns on success/failure. Always returns 200 with `{ status: "sent"\|"skipped"\|"failed", error?: string }`. |
| NEW | `src/app/api/work-diary/[id]/customer-email/route.ts` | POST `{ to: string }`. Auth required. Email validation. Rate-limited (in-memory, 5/hour/diary). Returns 200 on success, 4xx on validation, 5xx on transport failure. |
| CHG | `src/lib/workDiaryExport.ts` | **Delete** `openEmailDraft()`. Keep CSV/PDF client export. |
| NEW | `src/components/WorkDiary/PostSubmitBanner.tsx` | Renders 3-state banner (sending / sent / failed-retry). Subscribes to diary via realtime (already in place at `useWorkDiaries.ts:118`). Self-heals when state is `submitted + null + null` by firing the archive POST. |
| NEW | `src/components/WorkDiary/CustomerEmailDialog.tsx` | Email input + validation + send. Toast feedback. |
| CHG | `src/components/WorkDiary/DiaryActions.tsx` | Remove `onEmail` prop and the "שלח במייל" button. Banner + dialog replace it. |
| CHG | `src/components/WorkDiary/index.tsx:271` | Swap submit guard from `customerSignature` to `companySignature`. Move `signatureError` plumbing in `DocumentTab.tsx` accordingly. |
| CHG | `src/hooks/useWorkDiaries.ts:187` | After successful `submitDiary` Supabase update, fire-and-forget `fetch(/archive-email)`. Catch+swallow errors (the banner handles recovery; we never want a network rejection to interrupt the submit success path). |

## 8. UI flow

### Submit guard
```ts
// src/components/WorkDiary/index.tsx — submit handler
if (!diary.companySignature?.dataUrl) {
  setSignatureError(true);
  // scroll/focus to worker signature block
  return;
}
```

`DocumentTab.tsx` moves `hasError={signatureError}` from the customer block to the worker block. Error copy: "חתימת ראש הצוות חובה לפני שליחת היומן".

### Post-submit banner states

| Diary state | Banner |
|---|---|
| `submitted`, `internal_emailed_at=null`, `internal_email_error=null` | Spinner: "שולח עותק לארכיון יומני אלקיים..." Auto-fires `POST /archive-email` once on mount. |
| `submitted`, `internal_emailed_at=<ts>`, `internal_email_error=null` | ✓ Green: "היומן הוגש ונשמר. עותק PDF נשלח לארכיון אלקיים." Button: "שלח עותק ללקוח במייל". |
| `submitted`, `internal_emailed_at=null`, `internal_email_error=<msg>` | ⚠ Amber: "היומן נשמר במערכת, אך שליחת העותק הפנימי נכשלה." Buttons: "נסה שוב" (POST `/archive-email` again), "שלח עותק ללקוח במייל". |

The realtime subscription means transitions happen without a page refresh.

### Customer dialog
- Title: "שליחת עותק ללקוח".
- Single email input, regex-validated client-side, server-side re-validated.
- Helper: "כתובת מייל של נציג הלקוח/קבלן."
- "שלח" → POST. Loading state. On success: toast "נשלח ל-{email}", dialog closes. On error: red inline message, dialog stays open.

## 9. Error handling

| Failure | Diary state | User feedback | Recovery |
|---|---|---|---|
| Supabase submit fails | Stays `draft` | Existing red toast in `useWorkDiaries.ts:202` | Worker re-taps submit |
| `EMAIL_PASS` missing at runtime | Transport throws. Route catches, writes `internal_email_error="EMAIL_PASS not configured"`, returns 200 | Amber banner with retry | Ops adds `EMAIL_PASS` to Vercel env; worker presses retry |
| Gmail SMTP auth error | Same as above with `error: "smtp_auth_failed"` | Amber banner | Ops fixes App Password; retry |
| Transient network/SMTP error | `internal_email_error` set | Amber banner | Retry button |
| Customer email fails | Diary unchanged | Red inline message in dialog | Worker fixes address |
| Client never POSTs `/archive-email` after submit | `submitted + null + null` | Banner mounts and auto-fires the POST | Self-healing |

**Invariant**: a submit that reaches Supabase is never rolled back by an email failure. The diary record is the only side-effect that must be atomic.

## 10. Security

1. `EMAIL_*` env vars are only read in `src/lib/email/transport.ts`, which imports `"server-only"`. Importing it from a client component will fail at build time.
2. Both routes require an authenticated Supabase session (existing `@supabase/ssr` pattern used in `src/app/api/auth/*`). Reads use the user-scoped client, so RLS on `work_diaries` controls access.
3. Customer-email route applies in-memory rate limiting: max 5 sends per diary id per hour, keyed in a `Map` scoped to the function module. Prevents double-tap spam loops.
4. Email recipient input is validated both client-side and server-side. No CRLF injection (nodemailer handles header sanitization, but we also reject `\r` and `\n` in the input).
5. PDF render runs on inputs from the diary row only — no external HTML, no `eval`.
6. The customer-email route does **not** persist the recipient. It is a per-send action only.

## 11. Vercel function config

Both routes:
- Runtime: default Node (Fluid Compute).
- `export const maxDuration = 30;` — PDF render + SMTP typically 3-8s; 30s buffer is comfortable.
- No Edge runtime.

## 12. Environment variables

Final shape:

```bash
EMAIL_FROM=elkayam.yomanim@gmail.com
EMAIL_USER=elkayam.yomanim@gmail.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_PASS=<GMAIL_APP_PASSWORD>            # 16-char app password, no spaces
EMAIL_ARCHIVE_TO=elkayam.yomanim@gmail.com # explicit, so archive recipient can be changed without code
```

**Locations**:
- Local: `.env.local` (git-ignored).
- Vercel: project Settings → Environment Variables. Scope: **Production only** by default, to avoid preview deployments sending real archive emails. If preview testing is desired later, add **Preview** scope as well.

**Missing secret**: the only value the user must provide is the **Gmail App Password** for `elkayam.yomanim@gmail.com`. Steps:
1. Sign in to `elkayam.yomanim@gmail.com`.
2. Google Account → Security → enable 2-Step Verification (if not already on).
3. App passwords → Mail / "Elkayam diaries server" → copy 16-char value.
4. Paste into `.env.local` as `EMAIL_PASS=<value>` for local testing, and into Vercel env as `EMAIL_PASS` for production.
5. Never commit.

`EMAIL_PASS` missing in production is a non-destructive failure mode: submits still save the diary, archive banner shows amber with `error: "EMAIL_PASS not configured"`, retry available once the variable is added.

## 13. Testing strategy

| Case | Method |
|---|---|
| A. Draft saves don't send | Vitest on `/archive-email` route returns `{ status: "skipped", reason: "not_submitted" }` when status≠submitted. Manual: save 3 drafts, confirm `internal_emailed_at` stays null and Gmail inbox is empty. |
| B. Submit blocked without worker signature | Vitest on submit handler with `companySignature: null` asserts `signatureError === true` and no Supabase update. Manual mobile run. |
| C. Submit with worker signature auto-archives | Submit, watch Network tab for `POST /archive-email` → 200, watch realtime push set `internal_emailed_at`. Gmail inbox of `elkayam.yomanim@gmail.com` receives mail with PDF attached. PDF opens and shows worker signature image. |
| D. Idempotency | Re-save the same submitted diary; assert route returns `{ status: "skipped", reason: "already_archived" }` and no second email. |
| E. Customer optional send | Open dialog, enter real test address, submit; confirm receipt. Confirm no automatic send without the click. |
| F. No mailto / no phone mail app | `grep -r 'mailto:' src/` returns nothing after refactor. Manual mobile test: tap "שלח עותק ללקוח" → in-app dialog, no OS handoff. |
| G. Secrets isolation | After build: `grep -r 'EMAIL_PASS\|elkayam.yomanim' .next/static/` returns nothing. Importing `transport.ts` from a client component fails the build. |

**Field-safety conclusion**: this design is safe to test from mobile in the field **once `EMAIL_PASS` is set in Vercel env**. Without it, submits still succeed (diary saved) but archive banner shows amber error — non-destructive.

## 14. Open questions / risks

1. **`WorkDiaryDocument` Node-portability**: must spot-check during implementation for any `window`/`document`/`navigator` access. `@react-pdf/renderer` components are normally portable; risk is low. Mitigation: server route catches render exceptions and writes `internal_email_error`.
2. **Signature swap is a behaviour change** users may notice. Surfacing in release notes / banner copy. Worker signature being mandatory is more correct (workers always end the day on site; customer reps may not be present).
3. **Gmail SMTP daily limit** (~500/day per account) is far above expected diary volume (~10/day). No risk for current scale.
4. **In-memory rate limit** doesn't survive function cold start. For a 5/hour limit on a low-volume action, this is acceptable; the limit's purpose is anti-spam, not anti-abuse.
