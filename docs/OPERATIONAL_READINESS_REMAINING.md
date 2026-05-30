# Operational Readiness — Remaining Items (reference checklists & proposals)

Status as of commit `87c0a94` (deployed READY). This doc holds the precise
manual-QA checklists and the schema/OCR proposals for the items that cannot be
finished from the terminal (auth-gated runtime, device testing) or require your
approval (DB migration, sidecar deploy). No migration applied. No pricing changed.

---

## 1. `/agents` scan — runtime verification (Option C: manual, precise)

Scans are `verifyMasterAuth`-gated → cannot run from terminal. Run as a
master/office/finance user:

1. Go to **`/agents`** → header **"סריקת מערכת"** (runs all scannable agents), or
   open an agent room (e.g. **מנהל ייצור מסגרייה**, **מנהל התיאומים / QA**,
   **מנהל ציוד ורכבים**, **מנהל פעילות**) → **"הפעל סריקה"**.
2. **Tasks tab** — expect assigned tasks, each with **בעלים** (domain agent) +
   recommended action + reason + related order/asset:
   - orders → `הזמנה … — השלמת שדות חובה` / `אישור בקשת הזמנה חיצונית`
   - fabrication → `הזמנה … — טיפול ייצור נדרש`
   - coordination-qa → `הזמנה … — תיאום/QA נדרש`
   - graphics → `הזמנה … — טיפול גרפיקה/עיצוב נדרש` (incl. "מפרט עיצוב/ייצור חסר")
   - equipment-fleet → `ציוד … — טיפול תאימות נדרש`
   - ceo → `הסלמת CEO — סיכון/משימות מערכתיות`
3. **Check fields per task:** owner set, severity/priority, recommended action,
   related record link.
4. **Duplicates:** run the same scan **twice** → counts update, **no new
   duplicate task** with the same title (dedupe by stable title).
5. **Activity → "תקשורת בין סוכנים"** view → CEO→agent + routing handoffs show as
   `מקור → יעד`.
6. **Bug indicators:** duplicate tasks on re-scan · a task with no owner · scan
   returns 500 · an order with open gates shows "ready" · empty Tasks tab after a
   scan that reported `tasksCreated > 0`.

**Future safe upgrade (Option B, not built):** add `?dryRun=1` to each
`…/scan/route.ts` that returns would-create/update + dedupe key + owner without
writing. Clean but touches all 11 write-paths — deferred.

---

## 2. Graphics / Production — minimal schema proposal (NOT applied)

**Available today (used now):** `signRows` (signNumber, quantity, size, type,
imageUrl, lookupStatus) + `miscRows` (description, quantity, customWidth/Height,
attachment) in `work_orders.data`; `FabricationDetails` (width/height/material).
The graphics scan already flags missing quantity / not-in-catalog / no design
image / custom-without-dimensions.

**Missing first-class fields (would need migration):** add to `work_orders`
(or a `production_spec` jsonb column to avoid wide schema):
- `reflective_type` text — סוג הילוך/רפלקטיב
- `installation_notes` text
- `production_status` text enum: `pending` | `in_production` | `ready` | `blocked`
- `production_blocker_reason` text
- `production_owner` text (agent/department id)
- `production_approval_state` text: `not_required` | `pending` | `approved`

**Where they'd live / be edited:** order form (new-order) graphics/production
section; shown in OrderDetailPanel `DepartmentBreakdown` + graphics department UI.
**Agent use:** graphics scan flags missing reflective/installation/readiness and
sets `production_status`-aware tasks; coordination-qa gates on `production_status`.
**Migration needed:** one additive column (`production_spec jsonb` default `{}`) —
no destructive change, backfill not required. **Do today without schema:** keep
the existing line-item-derived checks (done).

---

## 3. Self-hosted OCR readiness checklist (no deploy now)

- **Exists:** `ocr-service/` (Dockerfile: native `tesseract-ocr-heb`+`eng` +
  poppler; FastAPI `app.py` `/ocr`+`/health`; optional PaddleOCR build-arg;
  `requirements.txt`).
- **Run locally:** `docker build -t elkayam-ocr ./ocr-service` then
  `docker run -p 8080:8080 -e OCR_SERVICE_TOKEN=dev elkayam-ocr`; test:
  `POST http://localhost:8080/ocr` (multipart `file`, `lang=heb+eng`).
- **Env vars:** `OCR_SERVICE_URL` (sidecar base URL), `OCR_SERVICE_TOKEN`
  (bearer), optional `OCR_SERVICE_ENGINE=auto`.
- **`OCR_SERVICE_URL` effect:** when set, `ocrAdapter` provider chain becomes
  `["http","wasm"]` → native Tesseract first, WASM fallback. When unset (today):
  `["wasm"]` only.
- **Production today:** WASM-only (`tesseract.js`) — fail-safe (crash-guard +
  manual-entry draft) but weaker accuracy on photographed/low-light Hebrew scans;
  digital-PDF text is fine.
- **Test with a normal invoice:** upload in הנהלת חשבונות → check
  `extraction_confidence`, parsed supplier/number/date/total, `ocrProvider`.
- **Uncertainty → human-review task:** low confidence / OCR fail / missing core
  fields / duplicate / type-mismatch → assigned task (cfo / equipment-fleet).
  Implemented (`reviewTask.ts`).
- **Do NOT:** use paid OCR APIs; deploy external hosting yet. PaddleOCR has no
  Hebrew model → keep Tesseract baseline.

---

## 4. Mobile / iPad QA checklist (device testing required — can't run from terminal)

Inspect on iPhone (≤390px), iPad portrait (768px), iPad landscape (1024px), RTL.
Common failure indicators: horizontal scrollbar, clipped action buttons, modal
header/footer off-screen, chips overflowing instead of wrapping.

- **`/orders`** — table scrolls horizontally without breaking layout; department
  chips wrap; readiness text not clipped.
- **Order detail drawer** — `max-w-lg` drawer scrolls; `DepartmentBreakdown` rows
  (owner/state) don't overflow; close (X) always visible.
- **`/agents`** — KPI row wraps; risk-pulse grid reflows (2→3→4); CEO aggregation
  rows readable; Tasks panel assign-select reachable; Activity "תקשורת" lines wrap.
- **`/jarvis-requests`** — table scroll; details modal scrolls; routing select +
  answer textarea reachable; next-action banner wraps.
- **`/catalog`** — card/gallery ⇄ table toggle; cards stack.
- **Notifications center** — list + mark-as-read reachable.
- **New-order / customer form** — inline create-customer dropdown reachable; rows
  don't overflow.
- **OCR/document review modal** — preview stacks above fields on mobile; scrolls.
