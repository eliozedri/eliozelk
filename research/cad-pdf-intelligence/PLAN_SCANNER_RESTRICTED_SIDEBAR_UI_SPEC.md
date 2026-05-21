# Plan Scanner — Restricted Sidebar UI Spec
## סורק תוכניות — מפרט ממשק משתמש (בטא פנימי מוגבל)

**Date:** 2026-05-21  
**Status:** SPEC — pending review before any production code is written  
**Scope:** Research → restricted internal feature  
**Codebase root:** `/Users/eliozedri/Desktop/eliozelk/`  
**Research pipeline:** `research/cad-pdf-intelligence/`  
**Author:** Plan Scanner research session

> **Core product principle:** This is a scanner, not a plan archive.  
> The source PDF is a temporary input. The durable product is the generated export (HTML, Excel, JSON).

---

## 1. Feature Access and Rollout

### Access mechanism

The production app uses `canAccessTab(profile, tabId)` in `src/types/auth.ts:171`.  
The `master` role bypasses all tab checks (`profile.role === "master"` → all tabs visible).  
All other roles see only tabs in their `allowed_tabs` array in the `profiles` DB table.

**New tab ID:** `"plan-scanner"`

**Access rule for internal beta:**
- `master` role: automatically sees it (no change needed — master sees all tabs)
- Other internal users: must have `"plan-scanner"` explicitly added to their `allowed_tabs` in Supabase by an admin

**No change to any ROLE_DEFAULTS.** The tab is invisible to every non-master user unless an admin explicitly grants it. This is the strictest available access gate without a separate feature flag system.

### Rollout stages

| Stage | Who sees it | How granted |
|-------|-------------|-------------|
| Stage 0 (now) | Nobody | Not implemented |
| Stage 1 (restricted beta) | `master` only | Tab added to sidebar; no other change |
| Stage 2 (internal beta) | Named internal users | Admin adds `"plan-scanner"` to their `allowed_tabs` |
| Stage 3 (wider rollout) | Decision pending | Requires explicit approval + separate spec |

**No public rollout until explicitly approved.**  
**No self-service access — admin must grant per user.**

### Beta label

The feature must show a `BETA · מחקר` or `מוגבל` label everywhere:
- Sidebar item: small badge next to label
- Page header: visible BETA / RESEARCH tag
- All output cards: DRAFT banner (preserving research pipeline labels)

---

## 2. Sidebar Entry Point

### Where it appears

New section in `src/components/Sidebar.tsx`:

```
מחקר ותכנון          ← new section label
  ⎿ סורק תוכניות [BETA]   ← new item
```

The section `"מחקר ותכנון"` is placed between the `"ניתוח"` section and the `"מערכת"` section.

### Item definition (to be added to `NAV_SECTIONS` in `Sidebar.tsx`)

```typescript
// New section to add to NAV_SECTIONS, between "ניתוח" and "מערכת":
{
  label: "מחקר ותכנון",
  items: [
    {
      tabId: "plan-scanner",
      href: "/plan-scanner",
      label: "סורק תוכניות",
      icon: <ScanText className={ICON_CLS} />,   // lucide-react: ScanText or FileSearch2
      matchFn: (p) => p.startsWith("/plan-scanner"),
      noBadge: true,
    }
  ]
}
```

**Icon recommendation:** `ScanText` or `FileSearch2` from lucide-react — communicates "reading a document".

**Route:** `/plan-scanner`

**Access restriction behavior:**  
`canSeeTab("plan-scanner")` returns `false` for all non-master users without explicit `allowed_tabs` grant → item is invisible. No "coming soon" placeholder for normal users — the feature simply doesn't appear.

**Beta badge:** A small `[מחקר]` or `β` badge rendered inline after the label using the existing `NavBadge` component style (e.g., amber variant).

---

## 3. Main User Flow

### Step 1 — Upload plan

**Page path:** `/plan-scanner` (empty state → upload CTA)

**UI elements:**
- Page title: `סורק תוכניות — בטא מחקרי מוגבל`
- Subtitle: `העלה תוכנית תנועה בפורמט PDF לסריקה אוטומטית וייצוא טיוטת כתב כמויות`
- Upload area: drag-and-drop + file input button
- Accept: `.pdf` only (no DXF, images, Word)
- Max size: defined per deployment (suggest 20 MB initial limit)
- **Prominent notice (shown inline, not as a warning popup):**
  > ⚠ קובץ ה-PDF המקורי הוא קלט זמני בלבד.  
  > המוצר הסופי הוא הדוחות המיוצאים: HTML, Excel, JSON.  
  > קובץ המקור יימחק כברירת מחדל לאחר הסריקה.

**Upload triggers:**
- POST to `/api/plan-scanner/intake`
- Creates run directory (`runs/<slug>/`)
- Writes `plan_manifest.json`
- Returns `{ run_id, run_slug, status: "ready_for_pipeline" }`

**Validation before upload:**
- File must be PDF
- File must not exceed size limit
- Reject empty files

### Step 2 — Run scan

**Page path:** `/plan-scanner?run=<slug>` or `/plan-scanner/<slug>`

**Progress display:**

Show a vertical stage timeline (not a noisy log feed):

| # | Stage name (Hebrew) | Internal stage |
|---|---------------------|----------------|
| 1 | קליטת תוכנית | S1 — PDF intake |
| 2 | פירוק מקרא | S2 — legend extraction |
| 3 | זיהוי תמרורים / קודים | S3–S7 — symbol clustering, code detection |
| 4 | מדידות | S8 — scale + linear measurement |
| 5 | פירוק אלמנטים | S9 — element decomposition |
| 6 | כתיבת טיוטת כתב כמויות | S10 — BOQ aggregation |
| 7 | יצירת דוחות | S20 — export generation |

Each stage shows: `pending → running → done ✓` or `failed ✗`  
Do not surface raw Python logs or stack traces to the user.  
Show a spinner during `running` state.

**Backend:** The pipeline runs as a background job (spawned process or queued worker). Poll `/api/plan-scanner/run/<slug>/status` every 3–5 seconds.

**Timeout:** 5 minutes default. Show "הסריקה לוקחת יותר זמן מהרגיל" after 3 minutes.

### Step 3 — Results dashboard

**Page path:** `/plan-scanner/<slug>`

**Layout:** Two-column on desktop, single-column on mobile.

**Left column (status + summary):**
- Scan status badge: `הסתיים — דורש סקירה` / `נכשל`
- BOQ summary card:
  - Total items: `42`
  - Approved for BOQ: `0 (לא מאושר)`
  - Requires review: `40`
  - Scale status: `לא מאומת ⚠`
- Sign summary card:
  - Sign plates: `177`
  - Pole locations: `119`
- Measurement summary card:
  - Total linear (unverified): `9,407 m ⚠`
- Red flag count: `8` (with CRITICAL/WARNING breakdown)

**Right column (export + review):**
- Export buttons (see Step 5)
- Review required items (see Step 4)
- Audit/evidence links

**DRAFT banner at the very top of the results page:**

```
⚠ טיוטה בלבד — לא מאושר לביצוע או חשבון
  כל הכמויות מחייבות אימות אנושי לפני שימוש מבצעי.
  אמות מידה: לא מאומת | קודי תמרורים: לא מאושרים
```

### Step 4 — Review required

**Section on results page, or tab `סקירה נדרשת`:**

Show each unresolved item as a row with icon + description + action:

| # | Item | Type | Action |
|---|------|------|--------|
| 1 | כיול אמות מידה | CRITICAL | הזן ידנית / אשר 1:500 |
| 2 | קוד חלקי "33" — לא ניתן לפתרון | CRITICAL | בחר מהרשימה: 133 / 433 / 633 / 933 |
| 3 | תוויות מקרא — לא חולצו | WARNING | הפעל Vision API או הזן ידנית |
| 4 | טקסונומיית צבעים — לא מאומתת | WARNING | אשר מיפוי צבעים |
| 5 | קבוצות אלמנטים לא מסווגות (G-001 ועוד) | WARNING | סיווג ידני |
| 6 | 145 תמרורים ללא זיהוי | WARNING | הפעל Vision API |

Each item shows: `required_for_export: false` (export is allowed even with unresolved items).  
Items marked `required_for_boq_approval: true` are highlighted — those block BOQ approval.

### Step 5 — Export

**Export panel (right column or bottom of page):**

```
יצוא דוחות
─────────────────────────────────────
[📥 הורדת Excel — כמויות]          ← worker_operations_quantities.xlsx
[🌐 פתיחת דוח HTML]                ← worker_operations_report.html (opens in new tab)
[🖨 הדפסה / שמירה כ-PDF]           ← opens HTML in new tab + "Ctrl+P → Save as PDF" tooltip
[📦 חבילת ביקורת JSON]             ← export_manifest.json + pipeline_run_summary.json (zip)
─────────────────────────────────────
כל הדוחות הם טיוטה. לא מאושרים לביצוע.
```

**Download behavior:**
- Excel and JSON: direct file download from `/api/plan-scanner/run/<slug>/export/<filename>`
- HTML: served as a static file, opens in a new browser tab
- "Print to PDF" button: opens HTML in new tab + shows a tooltip with print instructions

**No PDF generation on the server.** Browser print is the recommended path.  
If weasyprint is later approved: add a `[🖨 ייצוא PDF]` button that calls a server-side render endpoint.

### Step 6 — Cleanup / retention

**After export, show retention prompt:**

```
מה לעשות עם קובץ ה-PDF המקורי?

○ מחק קובץ המקור — שמור דוחות בלבד  ← default
○ שמור קובץ המקור לפרויקט זה        ← requires explicit selection
○ מחק הכל                            ← removes run directory entirely

[ביצוע]
```

**Default:** source PDF deleted, exports retained.  
**"שמור קובץ המקור":** requires explicit user opt-in. Not the default. Adds a flag to `plan_manifest.json`.  
**"מחק הכל":** removes all outputs. User must confirm.

**After cleanup:** Show a summary card:
- `[plan_slug] — דוחות זמינים להורדה`
- If source was deleted: `קובץ PDF המקורי נמחק`
- Exports remain accessible at their download URLs until run is deleted

---

## 4. Screen Layout

### Empty state (no scan yet)

```
┌─────────────────────────────────────────────────────┐
│  סורק תוכניות  [BETA · מחקר]                        │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  גרור קובץ PDF לכאן, או בחר קובץ            │   │
│  │         [📂 בחר קובץ PDF]                    │   │
│  │                                              │   │
│  │  ⚠ קובץ PDF הוא קלט זמני בלבד.              │   │
│  │    המוצר הוא הדוחות המיוצאים.               │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  סריקות קודמות:  [ריק / רשימת runs אחרונים]        │
└─────────────────────────────────────────────────────┘
```

### Active scan state

```
┌─────────────────────────────────────────────────────┐
│  סורק תוכניות  [BETA · מחקר]      50-448-02-400.pdf │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  📋 מצב סריקה                                       │
│  ─────────────────                                  │
│  ✓  קליטת תוכנית                                    │
│  ✓  פירוק מקרא                                      │
│  ⟳  זיהוי תמרורים / קודים   [████████░░░░]         │
│  ⋯  מדידות                                          │
│  ⋯  פירוק אלמנטים                                   │
│  ⋯  כתיבת טיוטת כתב כמויות                         │
│  ⋯  יצירת דוחות                                     │
│                                                     │
│  הסריקה תתוכן כ-30–90 שניות                        │
└─────────────────────────────────────────────────────┘
```

### Results state (two-column)

```
┌───────────────────────────────────────────────────────────────────┐
│  ⚠ DRAFT — טיוטה בלבד — לא מאושר לביצוע או חשבון                │
├─────────────────────────────┬─────────────────────────────────────┤
│  📊 סיכום סריקה             │  📥 יצוא                            │
│  ─────────────────────────  │  ─────────────────────────────────  │
│  פריטי BOQ:    42           │  [📥 Excel — כמויות]                │
│  מאושרים:      0 ⚠          │  [🌐 דוח HTML]                      │
│  דורש סקירה:  40            │  [🖨 הדפסה / PDF]                   │
│  תמרורים:     177           │  [📦 חבילת ביקורת]                  │
│  עמודים:      119           │                                     │
│  מדידות:   9,407 m ⚠        │  ─────────────────────────────────  │
│  דגלים אדומים:  8 🚩         │  🚩 דגלים אדומים (8)               │
│                             │  [CRITICAL] סולם לא מאומת          │
│  ─────────────────────────  │  [CRITICAL] BOQ לא מאושר           │
│  🔍 פריטים לסקירה (40)      │  [CRITICAL] תוויות מקרא חסרות      │
│  [כיול סולם ← CRITICAL]     │  [WARNING]  קודים לא מאושרים        │
│  [קוד 33 ← CRITICAL]        │  ...                                │
│  [תוויות מקרא ← WARNING]    │                                     │
│  [קבוצות אלמנטים ← WARNING] │  ─────────────────────────────────  │
│  ...                        │  ♻ מדיניות שמירה                    │
│                             │  [מחק מקור — שמור דוחות]  ← default │
│                             │  [שמור מקור לפרויקט זה]             │
└─────────────────────────────┴─────────────────────────────────────┘
```

### Audit/evidence links (bottom of page)

```
📋 עדויות ומקורות
pipeline_run_summary.json | boq_unified_draft.json | export_manifest.json
master_dashboard.json | sign_inventory.json | scale_measurement/results.json
```

---

## 5. UI States

| State | Description | UI |
|-------|-------------|----|
| `idle` | No scan, no upload in progress | Upload CTA + recent runs list |
| `uploading` | File selected, uploading to server | Progress bar, file name, cancel |
| `queued` | Upload complete, pipeline not yet started | "הסריקה בתור..." spinner |
| `scanning` | Pipeline running | Stage timeline, progress per stage |
| `completed` | Pipeline finished, exports ready | Results dashboard, DRAFT banner |
| `completed_with_review` | Completed but unresolved review items | Results + review panel highlighted |
| `failed` | Pipeline error | Error message, retry option, contact support |
| `export_ready` | All exports confirmed generated | Export buttons active |
| `cleanup_pending` | User prompted for source retention decision | Retention prompt |
| `source_deleted` | Source PDF deleted | Green confirmation + "קובץ PDF נמחק" |
| `output_retained` | Exports kept, no source | Export download links remain |
| `fully_deleted` | Run and all outputs deleted | Neutral confirmation |

---

## 6. Safety Labels

The following labels **must appear** on all current outputs. They are already present in the research pipeline and must be preserved in the UI:

| Label | Where |
|-------|-------|
| `DRAFT — טיוטה בלבד` | Page header, all output cards, Excel sheet 1 row 1 |
| `REQUIRES REVIEW — דורש סקירה` | Results dashboard status, review panel header |
| `NOT APPROVED FOR EXECUTION OR BILLING — לא מאושר לביצוע או חשבון` | DRAFT banner, export panel footer |
| `SCALE UNVERIFIED — סולם לא מאומת` | Measurements card, measurements section of report |
| `BOQ NOT APPROVED — כתב כמויות לא מאושר` | BOQ summary card, all BOQ export headers |

No quantity, measurement, or sign code may be displayed without one of the above qualifiers until explicitly approved by a named user in a future approval workflow.

---

## 7. API / Backend Wrapper Concept

> Do not implement yet. This section defines the thin wrapper needed to connect the UI to the research pipeline.

**Design principle:** The UI is a thin wrapper around the existing research pipeline. No pipeline scripts need to change. Only a Next.js API layer is added.

### Endpoints

```
POST   /api/plan-scanner/intake
  Body: { file: PDF (multipart) }
  Returns: { run_id, run_slug, status, manifest }
  Action: stores PDF in runs/<slug>/source/, writes plan_manifest.json

GET    /api/plan-scanner/run/:slug/status
  Returns: { status, stages, elapsed_s, pipeline_status }
  Action: reads pipeline_run_summary.json + stage output presence

POST   /api/plan-scanner/run/:slug/start
  Returns: { job_id }
  Action: spawns pipeline process (or queues background job)
          calls: .venv/bin/python3 19_run_plan_scanner_pipeline.py --plan-run-dir runs/<slug>
          then:  .venv/bin/python3 33_worker_operations_export.py --plan-run-dir runs/<slug>

GET    /api/plan-scanner/run/:slug/export/:filename
  Returns: file stream (Content-Disposition: attachment)
  Files: worker_operations_quantities.xlsx, worker_operations_report.html,
         worker_operations_export_report.md, export_manifest.json

DELETE /api/plan-scanner/run/:slug/source
  Returns: { deleted: true }
  Action: deletes runs/<slug>/source/

DELETE /api/plan-scanner/run/:slug
  Returns: { deleted: true }
  Action: deletes entire run directory
```

**No new DB tables.** Run state lives in `plan_manifest.json` + `pipeline_run_summary.json` on disk.  
**No paid API.** The pipeline runs locally; no cloud calls.  
**Auth:** All endpoints require `canAccessTab(profile, "plan-scanner")` — checked via Supabase session in API route middleware.

---

## 8. Data / Storage Behavior

| Data item | Location | Lifecycle |
|-----------|----------|-----------|
| Source PDF | `runs/<slug>/source/<filename>.pdf` | Temporary — deleted after export (default) |
| Pipeline outputs | `runs/<slug>/outputs/*.json, *.html, *.png` | Retained until run is deleted |
| Export artifacts | `runs/<slug>/outputs/exports/` | Durable — these are the product |
| Export manifest | `runs/<slug>/outputs/exports/export_manifest.json` | Durable |
| Run metadata | `runs/<slug>/plan_manifest.json` | Durable while run exists |
| Run state | `runs/<slug>/state/plan_scan_state.json` | Durable while run exists |
| DB record | None | Not persisted to DB in internal beta |

**Default retention policy:**
- Source PDF: deleted after export confirmation (or immediately if user selects cleanup)
- Exports: retained indefinitely on disk (operator manages disk space)
- No automatic DB archiving until a future "plan archive" feature is explicitly approved

**Future DB persistence (not in this spec):**  
If plan archiving is approved later, the `runs/<slug>/plan_manifest.json` data model maps directly to the `plans` DB table defined in `PLAN_SCANNER_DATA_MODEL.md`. No migration needed until that decision is made.

---

## 9. Permissions / Security

| Action | Who can do it |
|--------|---------------|
| See sidebar item | `master` role (always) + users with `"plan-scanner"` in `allowed_tabs` |
| Upload PDF | Same as above |
| Run scan | Same as above |
| View results | Same as above |
| Download exports | Same as above |
| Delete source PDF | Same as above |
| Delete run entirely | `master` role only (initially) |
| Approve BOQ (future) | Not defined yet — requires separate approval workflow spec |
| Promote teaching rules (future) | Not defined yet |
| Grant access to other users | `manage_access` permission (admin) — adds `"plan-scanner"` to `allowed_tabs` |

**Authentication:** Supabase session via existing `AuthContext`. No new auth system.  
**Rate limiting:** Not in scope for internal beta. Single-user expected initially.  
**File validation:** Server-side: MIME type + extension check. Max size enforced in API route.  
**No external data exposure:** Run directories live on the server. Download URLs are authenticated.

---

## 10. What NOT to Build Yet

| Prohibition | Reason |
|-------------|--------|
| No full production implementation in this session | Spec must be reviewed first |
| No DB migration | No DB model finalized; local JSON is sufficient for beta |
| No final BOQ approval workflow | Requires a separate spec + business process design |
| No public rollout | Research-quality output; no external user access |
| No paid API dependency | Vision API for legend labels is optional enhancement |
| No permanent source PDF archive by default | Scanner-not-archive principle; operator chooses retention |
| No automatic quantity approval | All quantities remain DRAFT until a human explicitly approves |
| No multi-plan management | Single-plan flow for beta; history/comparison is future scope |
| No mobile-optimized upload | Desktop-first for internal beta |
| No real-time progress WebSocket | Polling every 3–5 seconds is sufficient for beta |

---

## 11. Recommended Implementation Slices

The implementation should be incremental and reversible. Each slice is independently shippable:

### Slice A — Restricted route shell (first)
**Scope:** Add `"plan-scanner"` to `TabId`, add sidebar item, create `/plan-scanner` page with:
- Access check (redirect if not authorized)
- Static upload placeholder UI (no backend)
- DRAFT + BETA labels
- No actual upload or pipeline connection

**Effort:** ~2–3 hours  
**Value:** Validates routing, access control, and layout in the real app  
**Reversible:** Delete the page + remove sidebar item

### Slice B — Upload + run backend
**Scope:** Add `/api/plan-scanner/intake` and `/api/plan-scanner/run/:slug/start`.  
Connect upload form to actual API.  
Pipeline runs as a server-side spawned process.  
Poll status endpoint.

**Effort:** ~4–6 hours  
**Dependencies:** Slice A complete; research pipeline already parameterized  
**Risk:** File handling, process spawning in Next.js API routes (may need background job queue)

### Slice C — Results dashboard + exports
**Scope:** Read pipeline outputs from run directory.  
Display summary cards, red flags, review items.  
Wire export download buttons to `/api/plan-scanner/run/:slug/export/:filename`.

**Effort:** ~4–6 hours  
**Dependencies:** Slice B complete

### Slice D — Review / writeback UI
**Scope:** Form UI for answering teaching loop questions (scale, sign codes, element groups).  
Write answers to `human_review_answers.json`.  
Trigger re-run of relevant pipeline stages.

**Effort:** ~6–8 hours  
**Dependencies:** Slice C complete

### Slice E — DB persistence + BOQ approval (future, separate spec)
**Scope:** DB schema for plans + scan runs + BOQ items.  
Approval workflow with explicit human sign-off.  
Run history and comparison.

**Effort:** Requires separate spec  
**Dependencies:** Slices A–D complete + business process design approved

---

## 12. Open Questions Before Implementation

These must be answered before writing Slice B (backend) code:

1. **Where do run directories live in production?**  
   Options: (a) inside the app repo under `runs/` (simplest, disk on Vercel — limited), (b) external storage (S3/Supabase Storage), (c) local filesystem only (dev/staging).  
   **Current research:** local filesystem. Production needs an explicit decision.

2. **How does the pipeline run in production?**  
   The research pipeline is Python. Production options: (a) spawn Python process from API route, (b) queue a background job (Vercel Queues / BullMQ), (c) call a separate Python microservice.  
   **Recommendation for beta:** spawn process if on a persistent server; Vercel Queues if on Vercel.

3. **Retention policy in production**  
   How long do run directories live? Who cleans them up? Define before Slice B.

4. **File size limits**  
   Research PDFs are ~2.7 MB. What is the maximum for production? 20 MB? 50 MB?

5. **Single user or concurrent users?**  
   Beta is single-user (master only). If multiple users may upload simultaneously, need to ensure run directories don't collide (already handled by slug uniqueness in intake wrapper).

---

*This spec is a research document. No production code should be written until this spec is reviewed and questions 1–3 above are answered.*
