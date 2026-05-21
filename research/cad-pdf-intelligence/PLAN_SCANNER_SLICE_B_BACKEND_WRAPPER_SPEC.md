# Plan Scanner — Slice B: Backend Wrapper Spec

**Date:** 2026-05-21
**Status:** Implemented
**Scope:** `src/lib/planScanner/`, `src/app/api/plan-scanner/`, `src/app/plan-scanner/page.tsx`
**Prerequisite:** Slice A (restricted route shell) — complete

---

## 1. Feature Classification

The Plan Scanner is a **scanner/workstation tool**, not a document archive.

| IS | IS NOT |
|----|--------|
| Temporary scan workspace | Document archive |
| BOQ/export generator | File manager |
| Human-assisted review tool | Permanent plan storage |
| Session-based analysis tool | Project document library |

**Principle: Source PDFs are temporary scan inputs. Exported reports (HTML, Excel, JSON) are the durable products.**

This must be visible throughout the UI: banners, cleanup prompts, export labels, and the leave-confirmation dialog all reinforce this.

---

## 2. Session State Model

Every scan run has a `phase` that drives the UI:

| Phase | Meaning |
|-------|---------|
| `idle` | No run started — upload prompt shown |
| `uploading` | PDF being transferred to intake API |
| `intake_created` | Run directory created, manifest written, ready to scan |
| `running` | Pipeline executing in background |
| `outputs_generated` | Exports available for download |
| `source_deleted` | Source PDF cleaned up — exports still available |
| `failed` | Pipeline error — retry available |

Supporting state fields per run:
- `scan_run_status` — mirrors `phase`
- `source_storage_status` — `present` | `deleted`
- `retention_policy` — `keep_outputs_only` (default, not configurable in UI)
- `outputs_generated` — boolean
- `exports_available` — list of available export files
- `export_downloaded` — tracked per session (not persisted to disk)
- `cleanup_status` — `pending` | `done`
- `leave_warning_required` — true when `phase !== "idle" && phase !== "source_deleted"`

---

## 3. Leave Confirmation

When `leave_warning_required` is true (active scan with undeleted source), navigating away triggers a confirmation:

**Uses existing `useDirtyGuard` hook** (from `NavigationGuardContext`) — this:
1. Intercepts sidebar navigation via the existing `DraftProtectionModal`
2. Adds `beforeunload` protection for browser refresh/close
3. `onDiscard` → triggers `/cleanup` endpoint (best-effort, fire-and-forget)
4. `onSaveDraft` → resolves immediately (user should download first, then navigate)

**Slice B**: Uses existing generic modal copy ("שמור כטיוטה" / "מחק ויצא" / "הישאר בעמוד").
**Slice C**: Extend `DraftProtectionModal` to accept custom copy props for scanner-specific language.

Custom scanner copy (for Slice C):
> "האם לצאת מסורק התוכניות?
> הנתונים וקובץ התוכנית אינם נשמרים לאחר היציאה.
> ודא שהורדת / הדפסת את דוח העבודה לפני היציאה."

---

## 4. Run Directory Management

### Location

```
PLAN_SCANNER_RUNS_DIR (env var)
  fallback: process.cwd()/research/cad-pdf-intelligence/runs/
  Vercel: /tmp/plan-scanner-runs/
```

### Run slug format

```
ui_<sanitized_plan_name>_<YYYYMMDDHHmmss>
example: ui_50_448_02_400_20260521_143022
```

### Directory structure

```
runs/<slug>/
  source/          ← PDF stored here (temporary)
  outputs/         ← pipeline writes here
    exports/       ← export scripts write here
      export_manifest.json   ← presence = outputs_generated
      worker_operations_report.html
      worker_operations_quantities.xlsx
  artifacts/
  logs/
    api_run.log    ← stdout/stderr from spawned pipeline
  state/
    pipeline_started.json    ← presence + timestamp = running
  plan_manifest.json         ← always present after intake
  plan_config.json           ← PlanRunContext compatibility
```

### Status inference

| Condition | Phase |
|-----------|-------|
| No run dir | `failed` |
| No `pipeline_started.json` | `intake_created` |
| `pipeline_started.json` present, no `export_manifest.json`, elapsed < 15 min | `running` |
| `pipeline_started.json` present, no `export_manifest.json`, elapsed > 15 min | `failed` |
| `export_manifest.json` exists, source PDF present | `outputs_generated` |
| `export_manifest.json` exists, no source PDF | `source_deleted` |

---

## 5. Python Execution Strategy

```typescript
const isVercel = !!process.env.VERCEL;
const venvExists = fs.existsSync(VENV_PYTHON);

if (isVercel || !venvExists) {
  // Return controlled status with manual CLI instructions
  return { status: "execution_not_supported", manual_command: "..." };
}

// Spawn: pipeline → export (sequential via bash &&)
const child = spawn('bash', ['-c', shellCmd], { detached: true, ... });
child.unref(); // don't wait
```

The `manual_command` tells the user exactly what to run in the terminal if the API cannot execute.

---

## 6. API Endpoints

All endpoints require `Authorization: Bearer <token>` and check `canAccessTab(profile, "plan-scanner")`.

### `POST /api/plan-scanner/intake`
- **Input**: `FormData` with `file` (PDF only, max 50 MB)
- **Action**: Creates run directory, writes plan_manifest.json + plan_config.json, stores PDF in `source/`
- **Output**: `{ slug, planName }`
- **Security**: PDF mime type check, file size limit, filename sanitization

### `POST /api/plan-scanner/run/[slug]/start`
- **Input**: none
- **Action**: Spawns pipeline + export script (or returns `execution_not_supported`)
- **Output**: `{ status: "started" | "execution_not_supported", pid?, message?, manual_command? }`

### `GET /api/plan-scanner/run/[slug]/status`
- **Output**: `{ phase, source_present, outputs_generated, exports, plan_name, created_at }`

### `GET /api/plan-scanner/run/[slug]/exports`
- **Output**: `ExportEntry[]` — files actually present in `outputs/exports/`

### `GET /api/plan-scanner/run/[slug]/export/[filename]`
- **Action**: Streams file from `outputs/exports/<filename>`
- **Security**: Filename whitelist (.html, .xlsx, .json, .md), path traversal prevention

### `POST /api/plan-scanner/run/[slug]/cleanup`
- **Action**: Deletes source PDF from `source/`, updates manifest status
- **Output**: `{ cleaned: true, source_deleted: true }`

---

## 7. Retention Policy

| File | Retention |
|------|-----------|
| Source PDF (`source/*.pdf`) | Deleted on cleanup (default, immediate after user confirms) |
| HTML report | Kept indefinitely (durable product) |
| Excel workbook | Kept indefinitely (durable product) |
| Export manifest JSON | Kept indefinitely (durable product) |
| Pipeline logs | Kept with outputs (for audit) |
| Run directory | Kept (user must manually delete or future Slice D adds management) |

Default: `keep_outputs_only` — source deleted, exports kept.

---

## 8. Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| Auth required on all endpoints | `getPlanScannerUser()` — bearer token → profile → `canAccessTab` |
| PDF mime type check | `file.type === 'application/pdf'` |
| File size limit | 50 MB (`MAX_PDF_SIZE`) |
| Filename sanitization | Regex: `[^a-zA-Z0-9._-]` → `_`, max 200 chars |
| Path traversal prevention | `getRunDir(slug)` validates slug and checks path prefix |
| Export file whitelist | Only `.html`, `.xlsx`, `.json`, `.md` served |
| No arbitrary path access | `safeExportPath()` locks to `outputs/exports/` |
| No permanent PDF archive | Default retention deletes source on cleanup |

---

## 9. Slice Scope

### Slice B (this slice) — Implemented
- Spec document (this file)
- `src/lib/planScanner/auth.ts` — bearer token → plan-scanner access check
- `src/lib/planScanner/runs.ts` — run management, status inference, path safety
- All 6 API routes
- Page updated: functional upload, stepper, polling, export buttons, cleanup, leave guard

### Slice C (next)
- Custom modal copy for leave confirmation (scanner-specific vs generic form language)
- `export_downloaded` tracking persisted to disk
- Performance limits (queue, timeout, PDF page count check)
- Error recovery UI (retry button, better error messages)
- Manual scale calibration form

### Slice D (future)
- Run history / management (list past scans)
- Multi-run comparison
- Permanent archival option (opt-in, with DB record)
- BOQ approval workflow
- Sign code resolution UI

---

## 10. Implementation Files

| File | Purpose |
|------|---------|
| `src/lib/planScanner/auth.ts` | Auth helper |
| `src/lib/planScanner/runs.ts` | Run management, status, path safety |
| `src/app/api/plan-scanner/intake/route.ts` | PDF upload + run creation |
| `src/app/api/plan-scanner/run/[slug]/start/route.ts` | Pipeline execution |
| `src/app/api/plan-scanner/run/[slug]/status/route.ts` | Status polling |
| `src/app/api/plan-scanner/run/[slug]/exports/route.ts` | Export listing |
| `src/app/api/plan-scanner/run/[slug]/export/[filename]/route.ts` | File download |
| `src/app/api/plan-scanner/run/[slug]/cleanup/route.ts` | Source PDF deletion |
| `src/app/plan-scanner/page.tsx` | Scanner UI (state machine, upload, stepper, exports) |

---

*All production code is restricted to `canAccessTab(profile, "plan-scanner")` users. No DB migrations. No paid API. No permanent source archive by default.*
