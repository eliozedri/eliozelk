# Plan Scanner — Tooling & Performance Audit
**Date:** 2026-05-21 (updated 2026-05-22)
**Scope:** research/cad-pdf-intelligence pipeline
**Status:** Research-only. No production UI/DB/flows changed.

> **Cross-reference (added 2026-05-22):** Tool selection for the Image-Based Engine (Engine B) must be evaluated in the context of the **Image-Based Visual Teaching Loop / Agent Learning Principle** — see Section 9 of `PLAN_SCANNER_IMAGE_BASED_ENGINE_SPEC.md`. A tool's true value depends on whether its errors are catchable via human review questions, not only on raw accuracy. An OCR engine that misreads but produces a low-confidence flag is more useful than one that misreads with high confidence, because the teaching loop can correct the former.

---

## Executive Summary

The Plan Scanner pipeline is currently built almost entirely from custom scripts
using a small set of general-purpose Python libraries. No real CAD tooling
(ezdxf, ODA, LibreDWG) is installed. No AI/OCR tooling beyond Tesseract
(English only) is installed. The most critical missing pieces are:

1. **ezdxf** — 2.9 MB pure-Python DXF library, commented out in requirements.txt,
   not installed. If the source plans arrive as DXF (or can be converted), this
   would eliminate all vector-extraction complexity.
2. **Hebrew Tesseract language data** — `heb.traineddata` is not installed.
   All current OCR is English-only. This is a one-line fix.
3. **EasyOCR or docTR** — local, free, supports Hebrew, would replace the
   paid Claude Vision API for sign-code reading.

The 95% stall bug was cosmetic and is now fixed. The real pipeline was never
being called by the UI; this is now corrected by `34_ui_plan_scan_orchestrator.py`.

A realistic Fast Scan target is **2–5 minutes** for a standard CAD plan.
A 10-second scan is not realistic for any meaningful output from a raw PDF.

---

## Part A — 95% Stall Root Cause (Confirmed)

### What happened

The UI progress bar showed `כמעט מוכן...` at 95% and then timed out at 20 minutes.

### Root cause (confirmed)

The progress was **purely cosmetic**, computed from wall-clock time:

```
estimated_pct = min(95, round((elapsed_seconds / 900) * 100))
```

While the UI counted to 95%, the actual backend pipeline (`19_run_plan_scanner_pipeline.py`)
was a **validator, not a detector**. It checked whether output files already existed
(they did not, for a new upload), re-ran `17_boq_aggregator.py` on empty inputs
(producing empty output in < 1 second), and exited cleanly. No detection scripts
(01–18) were ever called by the UI pipeline.

Evidence:
- `api_run.log` = **0 bytes** on both failed UI runs
- Both UI runs have empty `outputs/` directories
- `pipeline_started.json` shows started, but subprocess output is absent
- The reference run (`poc_plan_50_448_02_400_20260520_223259`) was built
  **manually** using `run_pipeline.sh` with all detection outputs pre-existing

### Fix applied (commit 6f0445c)

`34_ui_plan_scan_orchestrator.py` now replaces the old `19_ && 33_` command.  
`runs.ts` calls the orchestrator via `startPipeline(slug, mode)`.  
Real stage progress is written to `state/scan_progress.json` before each stage.  
`inferRunStatus` reads real progress when available; falls back to time-based only
while the orchestrator has not yet started writing (first few seconds).

### Remaining stall risk

None for the cosmetic 95% bug. If a real detection stage hangs (e.g. a very large
plan causes `15_scale_measurement.py` to exceed 600s), the orchestrator now
writes `status: failed` with the stage name. The UI will show the real failure
rather than a silent 20-minute timeout.

---

## Part B — Current Tooling Inventory

### Python venv packages (installed)

| Package | Version | Used In | Role |
|---------|---------|---------|------|
| **PyMuPDF (fitz)** | 1.26.5 | 01, 02, 03, 05, 06, 07, 10, 11, 15, 16 | PDF parsing, vector path extraction, rasterisation |
| **pdfplumber** | 0.11.8 | 08, 09 | Character-level text extraction, supplemental |
| **Pillow** | 11.3.0 | 03, 05, 06, 09, 10, 11, 12, 14 | Image I/O, PNG generation, crop operations |
| **numpy** | 2.0.2 | 04, 06, 09, 12, 13, 15 | Arrays, centroids, math |
| **scipy** | 1.13.1 | 04, 09, 13 | Hierarchical clustering, cdist |
| **opencv-python-headless** | 4.13.0.92 | 06, 09, 10, 11, 12, 13 | Template matching, CC analysis, morphology (119 MB) |
| **pytesseract** | 0.3.13 | 10, 11 | Thin Python wrapper around system Tesseract |
| **openpyxl** | 3.1.5 | 33 | Excel workbook generation |
| **shapely** | 2.0.7 | _(none — installed but not imported in any script)_ | Reserved for POC 6 linear measurement |
| **anthropic** | 0.103.1 | _(commented out in research scripts — was used for Vision API)_ | **PAID API** — not suitable for free/local use |

### System tools (installed)

| Tool | Version | Role |
|------|---------|------|
| **tesseract** | 5.5.2 (brew) | OCR binary — only `eng`, `osd`, `snum` languages |
| **Python** | 3.9.6 | Pipeline runtime |

### Critical gaps

| Gap | Impact | Fix |
|-----|--------|-----|
| No Hebrew tesseract data | Hebrew text in plans is unreadable by OCR | `brew install tesseract-lang` or manual download |
| No ezdxf | DXF/DWG source files cannot be read natively | `pip install ezdxf` (2.9 MB) |
| No EasyOCR / docTR | Local AI OCR for sign codes requires paid Claude API | `pip install easyocr` (~300 MB + PyTorch) |
| Shapely installed but unused | Geometry measurement power wasted | Wire into `15_scale_measurement.py` for guardrail length |
| Python 3.9.6 | ~25% slower than Python 3.12 | Rebuild venv with Python 3.12 |

---

## Part C — Tools Discussed But Not Integrated

| Tool | Status | Reason |
|------|--------|--------|
| ezdxf | Commented out in `requirements.txt` | Waiting for DXF source files to test |
| svgwrite | Commented out in `requirements.txt` | SVG written manually instead |
| PaddleOCR | Not installed, not mentioned in code | Evaluated but not pursued |
| EasyOCR | Not installed, not mentioned in code | Same |
| ODA File Converter | Not installed (system binary) | No DWG source files to convert yet |
| LibreDWG | Not installed | Same |
| FreeCAD headless | Not installed | Overkill — 1 GB+ for our use case |
| QCAD command-line | Not installed | No DWG/DXF source files |
| networkx | Not installed | Considered for path connectivity graph |
| svgpathtools | Not installed | Considered for Bézier/arc math |
| Label Studio | Not installed | Considered for annotation review UI |
| VIA Annotator | Not installed | Single-file HTML — zero install needed |

---

## Part D — Mandatory CAD/AI Tooling Integration Opportunities

Each tool is evaluated against our pipeline's actual bottlenecks.

---

### 1. ezdxf

| Attribute | Value |
|-----------|-------|
| **Category** | CAD / DXF parsing |
| **Source** | https://github.com/mozman/ezdxf |
| **License** | MIT |
| **Local/Free** | Yes — fully local, no API key |
| **Mac (arm64)** | Yes — pre-built wheel (2.9 MB) |
| **Dependency weight** | ~3 MB installed |
| **Stage improved** | Stage 2 (vector extraction) — replaces PyMuPDF path extraction if source is DXF |
| **Speed impact** | +++ If source is DXF: extraction is O(entities) not O(rendered PDF paths). Likely 10× faster than PDF rasterisation. |
| **Accuracy impact** | +++ DXF preserves layer names, entity types, block references — eliminates all guesswork about what a path represents |
| **Install** | `.venv/bin/pip install ezdxf` |
| **Smoke test** | `python3 -c "import ezdxf; print(ezdxf.__version__)"` |
| **Risk** | LOW — pure Python, no system deps, MIT |
| **Recommendation** | **`use_now`** |
| **Notes** | Currently commented out in `requirements.txt`. Our source plans are AutoCAD PDFs, not DXF. However: (a) if the client can export DXF alongside PDF, this unlocks layer-level decomposition; (b) ezdxf can also parse PDFs' embedded DXF data via `ezdxf.recover`. Install it now; wire into a new `02b_extract_dxf.py` that falls back gracefully when DXF is unavailable. |

---

### 2. Hebrew Tesseract Language Data

| Attribute | Value |
|-----------|-------|
| **Category** | OCR / language data |
| **Source** | https://github.com/tesseract-ocr/tessdata |
| **License** | Apache 2.0 |
| **Local/Free** | Yes |
| **Mac (arm64)** | Yes — via brew or manual download |
| **Dependency weight** | ~3 MB (`heb.traineddata`) |
| **Stage improved** | Stage 10 (`10_local_ocr_sign_codes.py`) — Hebrew text in legend, annotations |
| **Speed impact** | Neutral — same Tesseract binary |
| **Accuracy impact** | ++ Enables reading Hebrew text in plan annotations, legend labels, title block. Currently 0% success on Hebrew. |
| **Install** | `brew install tesseract-lang` OR `wget https://github.com/tesseract-ocr/tessdata/raw/main/heb.traineddata -O /opt/homebrew/share/tessdata/heb.traineddata` |
| **Smoke test** | `tesseract --list-langs | grep heb` |
| **Risk** | ZERO |
| **Recommendation** | **`use_now`** — one command, zero risk |

---

### 3. EasyOCR

| Attribute | Value |
|-----------|-------|
| **Category** | AI / neural OCR |
| **Source** | https://github.com/JaidedAI/EasyOCR |
| **License** | Apache 2.0 |
| **Local/Free** | Yes — fully local inference |
| **Mac (arm64)** | Yes — PyTorch on Apple Silicon |
| **Dependency weight** | ~300 MB (PyTorch + model weights) |
| **Stage improved** | Stage 10/11 — replaces Tesseract for sign-code reading; reads Hebrew |
| **Speed impact** | - Slower than Tesseract per call; but GPU acceleration possible on M-series Mac |
| **Accuracy impact** | +++ Much better on stylised bold glyphs, vector-rasterised text, small fonts. This is exactly our problem — Tesseract fails because AutoCAD text renders as vector outlines. |
| **Install** | `.venv/bin/pip install easyocr` |
| **Smoke test** | `python3 -c "import easyocr; r = easyocr.Reader(['he','en']); print(r.readtext('test.png'))"` |
| **Risk** | MEDIUM — large install; first run downloads model (~200 MB). No API key. |
| **Recommendation** | **`smoke_test_now`** — install in a separate test environment first; measure accuracy on one crop before committing to requirements |

---

### 4. docTR (Document Text Recognition)

| Attribute | Value |
|-----------|-------|
| **Category** | AI / document OCR |
| **Source** | https://github.com/mindee/doctr |
| **License** | Apache 2.0 |
| **Local/Free** | Yes |
| **Mac (arm64)** | Yes |
| **Dependency weight** | ~200 MB (PyTorch or TensorFlow backend) |
| **Stage improved** | Stage 10/11 — alternative to EasyOCR; better for document-layout-aware OCR |
| **Speed impact** | - Slower than Tesseract; faster than Claude Vision API |
| **Accuracy impact** | ++ Better on structured documents; but not specifically tuned for Hebrew CAD text |
| **Install** | `.venv/bin/pip install "python-doctr[torch]"` |
| **Smoke test** | `python3 -c "from doctr.io import DocumentFile; print('doctr ok')"` |
| **Risk** | MEDIUM — large install |
| **Recommendation** | **`keep_for_later`** — evaluate EasyOCR first; docTR is an alternative if EasyOCR accuracy is insufficient |

---

### 5. networkx

| Attribute | Value |
|-----------|-------|
| **Category** | Graph analysis |
| **Source** | https://networkx.org |
| **License** | BSD |
| **Local/Free** | Yes |
| **Mac (arm64)** | Yes |
| **Dependency weight** | ~3 MB |
| **Stage improved** | Stage 4 (clustering) — model vector paths as a graph; connect adjacent path segments into higher-level features (road edges, sign assemblies, poles) |
| **Speed impact** | Neutral — adds graph construction; removes need for DBSCAN post-processing |
| **Accuracy impact** | ++ Better cluster connectivity; detects path chains that DBSCAN misses at non-uniform densities |
| **Install** | `.venv/bin/pip install networkx` |
| **Smoke test** | `python3 -c "import networkx as nx; G = nx.path_graph(5); print(list(G.edges()))"` |
| **Risk** | LOW |
| **Recommendation** | **`smoke_test_now`** — very lightweight, would unlock path-chain analysis |

---

### 6. svgpathtools

| Attribute | Value |
|-----------|-------|
| **Category** | Vector path math |
| **Source** | https://github.com/mathandy/svgpathtools |
| **License** | MIT |
| **Local/Free** | Yes |
| **Mac (arm64)** | Yes |
| **Dependency weight** | ~1 MB |
| **Stage improved** | Stage 2/4 — precise Bézier arc length, curvature, intersection math for curved road paths |
| **Speed impact** | Neutral |
| **Accuracy impact** | + More accurate linear measurement of curved guardrails/roads than straight-line approximation |
| **Install** | `.venv/bin/pip install svgpathtools` |
| **Smoke test** | `python3 -c "from svgpathtools import Path, Line; print('ok')"` |
| **Risk** | LOW |
| **Recommendation** | **`smoke_test_now`** — lightweight, directly improves curved-line measurement accuracy |

---

### 7. ODA File Converter

| Attribute | Value |
|-----------|-------|
| **Category** | CAD format conversion |
| **Source** | https://www.opendesign.com/guestfiles/oda_file_converter |
| **License** | Free binary (proprietary ODA) |
| **Local/Free** | Free download, local execution |
| **Mac (arm64)** | Yes — macOS dmg available |
| **Dependency weight** | ~50 MB (system app) |
| **Stage improved** | Pre-stage: converts DWG → DXF, then ezdxf handles parsing |
| **Speed impact** | +++ If client provides DWG: conversion is one-time per plan, then DXF pipeline is 10× faster |
| **Accuracy impact** | +++ Native layer/block preservation vs. PDF rendering |
| **Install** | Manual: download from opendesign.com/guestfiles → install .dmg |
| **Smoke test** | `ODAFileConverter /path/to.dwg /tmp/out DXF ACAD2018 0 1` |
| **Risk** | LOW — free binary, no telemetry, widely used |
| **Recommendation** | **`keep_for_later`** — only relevant when DWG source is available. Install manually when first DWG file arrives. |

---

### 8. LibreDWG

| Attribute | Value |
|-----------|-------|
| **Category** | DWG parsing library |
| **Source** | https://github.com/LibreDWG/libredwg |
| **License** | GPL 3.0 |
| **Local/Free** | Yes |
| **Mac (arm64)** | Yes via `brew install libredwg` |
| **Dependency weight** | ~20 MB (C library) |
| **Stage improved** | Pre-stage: direct DWG reading without ODA File Converter |
| **Speed impact** | ++ Direct binary reading of DWG; faster than round-trip via PDF |
| **Accuracy impact** | ++ Same as ezdxf + ODA chain |
| **Install** | `brew install libredwg` then `pip install python-libredwg` |
| **Smoke test** | `dwgread --version` |
| **Risk** | MEDIUM — GPL license; Python bindings are unofficial |
| **Recommendation** | **`keep_for_later`** — use ODA File Converter + ezdxf first (better ecosystem) |

---

### 9. Shapely (make it actually used)

| Attribute | Value |
|-----------|-------|
| **Category** | Computational geometry |
| **Source** | https://shapely.readthedocs.io |
| **License** | BSD |
| **Local/Free** | Yes |
| **Mac (arm64)** | Yes — already installed (2.0.7) |
| **Dependency weight** | Installed (6 MB) |
| **Stage improved** | Stage 15 — Shapely LineString/Polygon for accurate linear measurement (guardrails, barriers, painted lines) |
| **Speed impact** | Neutral (replaces manual geometry code) |
| **Accuracy impact** | ++ Proper polygon intersection, buffer, union operations for path analysis |
| **Install** | Already installed |
| **Smoke test** | `python3 -c "from shapely.geometry import LineString; print(LineString([(0,0),(1,0)]).length)"` |
| **Risk** | ZERO — already in venv |
| **Recommendation** | **`use_now`** — already installed, not imported anywhere. Wire into `15_scale_measurement.py` immediately for polyline arc length. |

---

### 10. VGG Image Annotator (VIA)

| Attribute | Value |
|-----------|-------|
| **Category** | Human-assisted annotation / review |
| **Source** | https://www.robots.ox.ac.uk/~vgg/software/via/ |
| **License** | BSD |
| **Local/Free** | Yes — single static HTML file |
| **Mac (arm64)** | Yes — browser-only |
| **Dependency weight** | 400 KB single HTML file |
| **Stage improved** | Review (stage 14 / 23) — human annotation of sign clusters, legend rows, scale reference points |
| **Speed impact** | N/A |
| **Accuracy impact** | +++ Human-in-the-loop corrections directly improve BOQ accuracy |
| **Install** | Download single HTML file: `via.html` |
| **Smoke test** | Open in browser |
| **Risk** | ZERO |
| **Recommendation** | **`use_now`** — zero install overhead, already familiar pattern |

---

### 11. PaddleOCR

| Attribute | Value |
|-----------|-------|
| **Category** | AI / OCR |
| **Source** | https://github.com/PaddlePaddle/PaddleOCR |
| **License** | Apache 2.0 |
| **Local/Free** | Yes |
| **Mac (arm64)** | Partial — PaddlePaddle macOS ARM builds have historically had issues |
| **Dependency weight** | ~500 MB (PaddlePaddle + models) |
| **Stage improved** | Stage 10/11 — high-accuracy OCR; SOTA for many character sets |
| **Speed impact** | - Slower than EasyOCR on CPU; faster on GPU/NPU |
| **Accuracy impact** | +++ SOTA accuracy on dense text |
| **Install** | `pip install paddlepaddle paddleocr` |
| **Smoke test** | `python3 -c "from paddleocr import PaddleOCR; print('ok')"` |
| **Risk** | HIGH on macOS ARM — dependency conflicts with paddle; confirm arm64 support first |
| **Recommendation** | **`keep_for_later`** — try EasyOCR first; only add PaddleOCR if EasyOCR is insufficient |

---

### 12. Label Studio

| Attribute | Value |
|-----------|-------|
| **Category** | Human annotation platform |
| **Source** | https://labelstud.io |
| **License** | Apache 2.0 |
| **Local/Free** | Yes — self-hosted |
| **Mac (arm64)** | Yes via Docker or pip |
| **Dependency weight** | ~100 MB |
| **Stage improved** | Review — structured annotation interface for sign images, legend rows, BOQ items |
| **Speed impact** | N/A |
| **Accuracy impact** | ++ Structured review with export to JSON |
| **Install** | `pip install label-studio && label-studio start` |
| **Smoke test** | `label-studio start --port 8080` |
| **Risk** | LOW — but heavy for what we need |
| **Recommendation** | **`keep_for_later`** — VIA covers 90% of our annotation needs with 0 setup |

---

### 13. FreeCAD (headless)

| Attribute | Value |
|-----------|-------|
| **Category** | CAD application |
| **Source** | https://www.freecad.org |
| **License** | LGPL 2+ |
| **Local/Free** | Yes |
| **Mac (arm64)** | Yes |
| **Dependency weight** | ~1.5 GB |
| **Stage improved** | DXF/STEP/IGES parsing — overkill for our use case |
| **Speed impact** | N/A |
| **Accuracy impact** | N/A |
| **Risk** | HIGH — enormous dependency for marginal benefit |
| **Recommendation** | **`reject`** — ezdxf handles our DXF needs with 0.3% of the footprint |

---

### 14. MMOCR

| Attribute | Value |
|-----------|-------|
| **Category** | AI / OCR |
| **Source** | https://github.com/open-mmlab/mmocr |
| **License** | Apache 2.0 |
| **Local/Free** | Yes |
| **Mac (arm64)** | Partial |
| **Dependency weight** | ~2 GB (mmcv + mmocr + models) |
| **Risk** | HIGH — large complex install, mmcv has ARM issues |
| **Recommendation** | **`reject`** — EasyOCR is simpler, lighter, and sufficient |

---

### 15. Docling (IBM)

| Attribute | Value |
|-----------|-------|
| **Category** | AI / document parsing |
| **Source** | https://github.com/DS4SD/docling |
| **License** | MIT |
| **Local/Free** | Yes |
| **Mac (arm64)** | Yes |
| **Dependency weight** | ~500 MB |
| **Stage improved** | Stage 7 (legend extraction) — structured document understanding |
| **Speed impact** | - Slow on first inference |
| **Accuracy impact** | ++ Better at table/layout detection than raw PyMuPDF |
| **Recommendation** | **`keep_for_later`** — promising for legend extraction; evaluate after EasyOCR is working |

---

## Part E — Performance Bottleneck Analysis

### Current Fast Scan timing (estimated, based on reference run)

| Stage | Script | Estimated time | Bottleneck |
|-------|--------|---------------|-----------|
| S1 | 01_inspect.py | 1–3 s | Simple PDF metadata |
| S2 | 02_extract_vectors.py | **15–45 s** | All PDF paths traversed; O(paths). Reference plan has ~50k paths. |
| S3 | 03_analyze_colors_geometry.py | 10–25 s | Color buckets + bounding boxes |
| S4 | 04_cluster_symbols.py | **10–30 s** | Hierarchical clustering O(N²) on candidates |
| S5 | 06_match_signs.py | **20–60 s** | Template matching via OpenCV; large template set |
| S6 | 07_extract_legend.py | 15–30 s | PDF page rendering + region detection |
| S7 | 09_stage_g_inventory.py | 15–30 s | Pole grouping + assembly building |
| S8 | 15_scale_measurement.py | **30–60 s** | Page rendering at high DPI + geometric measurement |
| S9 | 17_boq_aggregator.py | 3–8 s | JSON aggregation |
| S10 | 33_worker_operations_export.py | 5–15 s | HTML/Excel generation |
| **Fast total** | | **~2–5 minutes** | |

### Primary bottlenecks

1. **`02_extract_vectors.py`** — PyMuPDF path traversal on large plans.
   Mitigation: cache `vector_objects.json`; skip re-extraction if JSON and PDF checksum match.

2. **`06_match_signs.py`** — OpenCV template matching.
   Mitigation: reduce template set to most common signs; use GPU-accelerated cv2 if available.

3. **`15_scale_measurement.py`** — High-DPI page rendering.
   Mitigation: reduce render DPI for scale detection (150 DPI is sufficient vs. 300 DPI).

4. **`04_cluster_symbols.py`** — Hierarchical clustering.
   Mitigation: use DBSCAN from scipy instead of fclusterdata; or Annoy/Faiss for approximate NN.

### 10-second Fast Scan: realistic?

**No — not realistic for a meaningful output from a raw PDF.**

The minimum useful pipeline (vector extraction + clustering + BOQ) takes ~45–90 s
on a standard 3–5 page CAD plan with 20k–100k paths.

**What IS achievable:**

| Mode | Target | Under what conditions |
|------|--------|----------------------|
| Pre-cached re-scan | ~15–30 s | `vector_objects.json` already exists and checksum matches |
| Minimal draft | ~60–90 s | Only 01+02+04+17+33 (no template matching, no legend) |
| Full Fast Scan | ~2–5 min | All 10 Fast stages with current tooling |
| Full Fast (with ezdxf on DXF source) | ~30–60 s | DXF source eliminates PyMuPDF path traversal |
| Full Deep Scan | ~15–40 min | Current tooling + EasyOCR inference |

### Python 3.9 vs 3.12

The venv uses Python 3.9.6. Python 3.12 is ~25% faster on pure computation.
Rebuilding the venv with Python 3.12 would improve all stages uniformly.

---

## Part F — Fast Scan / Deep Scan Architecture

### Fast Scan (now implemented in 34_)

**Goal:** Useful operational output for field workers and production planning.  
**Target:** 2–5 minutes wall time (achievable with current tooling).  
**Output:** Draft BOQ, scale measurements, worker operations report, Excel.

Stages: `01→02→03→04→06→07→09→15→17→33`

Skips: heavy OCR, vector glyph experiments, element decomposition, validation,
partial-code resolution, debug overlays, review queue generation.

Labels all outputs as `requires_review: true`, `approved_for_boq: false`.

### Deep Scan (now implemented in 34_)

**Goal:** Full analysis for sign-code accuracy, review queue, teaching loop.  
**Target:** 15–40 minutes (no strict time constraint).  
**Output:** Everything in Fast + sign codes, review queue, element groups, validation results, human-review template.

Additional stages (inserted after `15_`):
`10→11→12→13→14→16→18→20→22→23` then `17→33`

### Export-only / Re-export

Already implemented: `reexportWithCalibration()` in `runs.ts` calls `33_` directly.
No full pipeline rerun. Triggered after scale calibration or review answer write-back.

---

## Part G — Quick-Win Action Plan

### Tier 1: Do now (zero-risk, minimal install)

1. **Install ezdxf**
   ```bash
   cd research/cad-pdf-intelligence
   .venv/bin/pip install ezdxf  # 2.9 MB
   ```
   Add `ezdxf>=1.3.0` to `requirements.txt` (uncomment existing line).
   Write `02b_extract_dxf.py` that uses ezdxf when a `.dxf` file is present
   alongside the PDF; falls back to `02_extract_vectors.py`.

2. **Install Hebrew Tesseract**
   ```bash
   brew install tesseract-lang
   # OR manual:
   wget https://github.com/tesseract-ocr/tessdata/raw/main/heb.traineddata \
     -O /opt/homebrew/share/tessdata/heb.traineddata
   ```
   Update `10_local_ocr_sign_codes.py` to use `lang='heb+eng'`.

3. **Wire Shapely into `15_scale_measurement.py`**
   Already installed (2.0.7). Import and use `LineString.length` for curved-path
   measurement. Eliminates current straight-line approximation.

4. **Add caching to `02_extract_vectors.py`**
   Check if `vector_objects.json` exists AND matches PDF checksum in `plan_manifest.json`.
   If yes, skip extraction. This converts repeat scans (after calibration) from 45 s to < 1 s.

### Tier 2: Smoke-test next (medium install)

5. **Smoke-test EasyOCR on one sign crop**
   ```bash
   .venv/bin/pip install easyocr
   python3 -c "
   import easyocr
   reader = easyocr.Reader(['he', 'en'], gpu=False)
   results = reader.readtext('runs/poc_plan_50_448_02_400_20260520_223259/outputs/stage_g_code_crops/occ_001.png')
   print(results)
   "
   ```
   If accuracy is significantly better than Tesseract on 3 crops, add to requirements.

6. **Smoke-test networkx path connectivity**
   ```bash
   .venv/bin/pip install networkx
   python3 -c "import networkx as nx; print(nx.__version__)"
   ```
   Use in `04_cluster_symbols.py` to model adjacent path segments as graph edges.

7. **Smoke-test svgpathtools arc length**
   ```bash
   .venv/bin/pip install svgpathtools
   python3 -c "from svgpathtools import Path, Line; p=Line(0+0j, 1+0j); print(p.length())"
   ```

### Tier 3: Keep for later

- ODA File Converter — when first DWG file arrives from client
- docTR — if EasyOCR insufficient for Hebrew
- PaddleOCR — if EasyOCR insufficient, after verifying ARM64 support
- Label Studio — if VIA proves insufficient for review workflow

---

## Part H — Confirmation: No Production Changes

This audit and the commit that accompanies it (orchestrator + progress fix) make
no changes to:

- Database schema (no migrations)
- Production UI routes (no new pages, no nav changes)
- Authentication / permissions (plan-scanner remains restricted to authorized users)
- BOQ approval state (`approved_for_boq: false` enforced by all pipeline scripts)
- Source PDF retention (temporary; deleted after user exports)
- Any Supabase tables, RLS policies, or Edge Functions

The only production-visible changes are:
1. The plan-scanner upload step shows a Fast/Deep mode selector (intake_created phase)
2. The progress bar shows real stage labels instead of time-based estimates
3. A new scan actually runs the detection pipeline (whereas previously it ran the validator only)

---

## Summary Table

| Question | Answer |
|----------|--------|
| Any real CAD tooling installed? | **No.** ezdxf commented out; ODA/LibreDWG/FreeCAD absent. |
| Any real AI/OCR tooling installed? | **Partial.** Tesseract (eng only, no Hebrew). No EasyOCR, PaddleOCR, docTR. Anthropic installed but is paid/cloud. |
| Tools discussed but not integrated | ezdxf, PaddleOCR, EasyOCR, ODA, LibreDWG, networkx, svgpathtools, Label Studio |
| Was 95% stall cosmetic? | **Yes — confirmed.** Fixed by 34_ui_plan_scan_orchestrator.py. |
| Top 5 tools to smoke-test next | (1) Hebrew Tesseract, (2) ezdxf, (3) EasyOCR, (4) networkx, (5) svgpathtools |
| Top 3 to integrate immediately | (1) Hebrew Tesseract (1 command), (2) ezdxf (1 pip install), (3) Shapely wire-up (already installed) |
| Fast Scan realistic target | 2–5 minutes (current tooling); ~30–60 s (if DXF source + ezdxf) |
| 10-second scan realistic? | Only for pre-cached re-scan or trivially simple plans (<5k paths) |
| Major remaining bottleneck | 02_ vector extraction + 06_ template matching + 15_ scale rendering |
| Python version risk | 3.9.6 is slow — rebuild venv with 3.12 for free ~25% speedup |
