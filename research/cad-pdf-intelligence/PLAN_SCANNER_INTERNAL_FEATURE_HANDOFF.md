# Plan Scanner — Internal Restricted Feature Handoff

**Date:** 2026-05-21  
**Status:** Research complete — ready for restricted internal beta spec  
**Scope:** `research/cad-pdf-intelligence/` — zero production changes made  
**Prepared for:** Internal team / product owner review before production planning

---

## 1. Current Milestone

The research pipeline has reached a fully functional state. As of commit `173eb31` (hardening: this document):

| Capability | Status |
|-----------|--------|
| Plan-scoped pipeline runs | ✅ all 21 scripts support `--plan-run-dir` |
| Worker/operations HTML export | ✅ print-ready, self-contained, plan-scoped |
| Excel quantities workbook (10 sheets) | ✅ freeze panes, DRAFT banner, plan-scoped |
| Export manifest JSON | ✅ `exists`, `run_dir`, `pdf/html/excel_status` |
| Markdown export report | ✅ includes PDF print instructions |
| BOQ draft (42 items, all unverified) | ✅ never marks anything approved |
| Sign inventory (177 plates, 119 poles) | ✅ pending human code confirmation |
| Linear measurements (9,407 m assumed) | ✅ scale flagged unverified throughout |
| Red flag audit trail (8 flags) | ✅ CRITICAL/WARNING/INFO tiered |
| Plan-scoped isolation | ✅ global `outputs/` not contaminated |
| Paid API used | ❌ none |
| Production UI/DB/flows modified | ❌ none |
| PDF direct export | ⏳ optional — browser print instructions provided |

### What this means in practice

A user with access to the research CLI can today:
1. Drop a plan PDF into the intake wrapper
2. Run the pipeline
3. Get an HTML report + Excel workbook + JSON manifest for worker/operations use
4. All quantities are clearly DRAFT with full audit trail

The research pipeline is **operationally usable as a restricted internal tool** — it just has no UI, no upload flow, and no access control.

---

## 2. What the Internal Beta Feature Should Do

When exposed as an internal restricted feature in the product:

1. **Upload PDF temporarily**
   - User uploads a plan PDF via a restricted admin/internal page
   - PDF stored temporarily (not permanently archived by default)
   - Intake generates a unique run ID and run directory

2. **Create a plan scan run**
   - Run directory created under a configurable storage path
   - `plan_manifest.json` written with plan metadata and run ID
   - No permanent DB record until human explicitly archives/approves

3. **Run the scanner pipeline**
   - Execute the research pipeline stages (or a curated subset for production)
   - All outputs scoped under the run directory
   - No global state contamination

4. **Generate exports**
   - `worker_operations_report.html` — downloadable
   - `worker_operations_quantities.xlsx` — downloadable
   - `export_manifest.json` — machine-readable status

5. **Allow download/export**
   - Provide download links for HTML and Excel
   - HTML opens directly in browser for print-to-PDF
   - No server-rendered PDF required (weasyprint is optional)

6. **Keep source PDF temporary by default**
   - Source PDF deleted after scan run completes (or configurable retention window)
   - Exported reports (HTML, Excel, MD) are the durable products
   - Make this policy explicit in the UI

7. **Keep all quantities draft/requires_review**
   - No automatic BOQ approval
   - No "approved for execution" state in the UI without a dedicated approval flow
   - All report headers must show DRAFT status

8. **Restrict access — admin/internal/engineering only**
   - Feature gated behind a feature flag or role check (`is_admin` or `allowed_tabs`)
   - Not visible in the standard user sidebar
   - No external (customer-facing) access

---

## 3. What Must NOT Happen Yet

| Prohibition | Reason |
|-------------|--------|
| No automatic BOQ approval | Quantities are unverified — scale unconfirmed, sign codes unresolved |
| No public user access | Research-quality output is not yet operational-quality |
| No permanent source PDF archive by default | Source PDFs are temporary inputs; export reports are durable |
| No paid API dependency | Vision API for legend labels is optional enhancement, not a blocker |
| No unreviewed operational use | "Plan Scanner says X" cannot drive purchasing without human sign-off |
| No DB migration without explicit approval | No schema changes until the data model is finalized and approved |
| No production deployment without feature flag | Must remain gated until internal validation is complete |

---

## 4. Remaining Blockers Before Real Sidebar Feature

### Must-have for a restricted internal sidebar
1. **Upload UI** — file input, temporary storage, progress indicator
2. **Restricted access / feature flag** — `allowed_tabs` row in `profiles` or a feature flag system
3. **Temporary storage / cleanup** — where run directories live in production, retention policy
4. **Export download flow** — serve HTML and Excel files from run directory
5. **Error handling** — pipeline failure feedback to user

### Should-have before wider internal rollout
6. **Optional PDF generation** — decide: browser-print-only vs. weasyprint vs. skip entirely
7. **Performance limits** — max PDF size, run timeout, queue if needed
8. **Manual calibration path** — UI or form to input scale confirmation
9. **BOQ approval workflow (later)** — separate gate for human sign-off on quantities

### Future (not blocking internal beta)
10. **Sign code resolution** — fix 2→3 digit adjacency logic in POC 3
11. **Legend label extraction** — Vision API pass for Hebrew labels (optional, paid)
12. **Multi-plan management** — run history, comparison, archiving

---

## 5. Technical Architecture for Internal Beta

```
User (admin/internal)
  └── /plan-scanner page (restricted)
       ├── Upload form → POST /api/plan-scanner/intake
       │    └── stores PDF temporarily → creates run directory
       ├── Run status → GET /api/plan-scanner/run/{id}
       │    └── polls pipeline progress (or simple "processing / done / error")
       └── Download links → GET /api/plan-scanner/run/{id}/export/{filename}
            └── serves files from runs/<slug>/outputs/exports/

Research pipeline (unchanged):
  └── 31_upload_intake_wrapper.py  → creates run dir
  └── 19_run_plan_scanner_pipeline.py --plan-run-dir <run> → runs pipeline
  └── 33_worker_operations_export.py --plan-run-dir <run> → generates exports
```

The pipeline runs are currently CLI-only. The production integration wraps these as server-side jobs (Next.js API route → spawns process or queues a background job).

**No pipeline scripts need to change for the internal beta.** Only a thin API + UI wrapper is needed.

---

## 6. Recommended Next Build Steps

The options below are ordered by business value and reversibility:

| Option | Description | Recommended? |
|--------|-------------|:------------:|
| **A. Restricted sidebar UI spec only** | Write the spec for the upload/scan/download flow without coding. Validate the interaction model before any production code. | ✅ **Yes — do this first** |
| B. Upload/run/export local prototype | Build a minimal Next.js API + UI locally. No deployment yet. Validates end-to-end feasibility. | After spec |
| C. Optional PDF dependency decision | Decide weasyprint vs. browser-print as the permanent policy. Low urgency. | Defer |
| D. Production feature flag planning | Define which role/tab controls access. Needs DB migration or `allowed_tabs` policy. | Part of spec |
| E. Manual calibration helper | Small form/tool for scale input. Unblocks accurate BOQ. | After spec |

**Recommendation:** Start with **Option A — restricted sidebar UI spec**. This is a 1–2 day design exercise that:
- Validates the interaction model (upload → scan → download)
- Defines access control before any code is written
- Produces a spec that can be sent for review without deploying anything
- Is fully reversible — it's just a document

Only after the spec is reviewed and approved should production code begin.

---

## 7. Files and Artifacts

### Research pipeline (all under `research/cad-pdf-intelligence/`)

| File | Purpose |
|------|---------|
| `33_worker_operations_export.py` | Export generator — HTML, Excel, MD, manifest |
| `19_run_plan_scanner_pipeline.py` | Orchestrator — runs all stages plan-scoped |
| `31_upload_intake_wrapper.py` | Intake — creates run directory from PDF |
| `plan_run_context.py` | Shared context helper for all scripts |
| `runs/poc_plan_50_448_02_400_20260520_223259/` | Sample run with all outputs |
| `PLAN_SCANNER_ARCHITECTURE.md` | Full pipeline architecture documentation |
| `PLAN_SCANNER_DATA_MODEL.md` | Data model for future DB integration |
| `PLAN_SCANNER_PRODUCTION_READINESS_AUDIT.md` | Pre-production readiness checklist |
| `PLAN_SCANNER_PRODUCTIZATION_ROADMAP.md` | Longer-term roadmap |

### Sample run outputs (`runs/poc_plan_50_448_02_400_20260520_223259/outputs/exports/`)

| File | Description |
|------|-------------|
| `worker_operations_report.html` | Print-ready HTML report (40 KB) |
| `worker_operations_quantities.xlsx` | 10-sheet Excel workbook (37 KB) |
| `worker_operations_export_report.md` | Markdown summary |
| `export_manifest.json` | Machine-readable export status |

---

## 8. Safety and Compliance Notes

- **approved_for_boq: false** — hardcoded throughout; no path to true without explicit human approval
- **Scale unverified** — all linear measurements (9,407 m) are provisional pending manual calibration
- **Sign codes unconfirmed** — pipeline structural limitation (2-digit partial codes); fix requires POC 3 upgrade
- **No data leaves the machine** — pipeline is fully local; no cloud storage, no paid API in current exports
- **Source PDF is temporary** — not permanently archived by the scanner; exports are the product
- **DRAFT visible everywhere** — in HTML header, Excel DRAFT banner (red row), export manifest, markdown

---

*This handoff document is research-only. No production changes have been made. All decisions described here require explicit approval before implementation.*
