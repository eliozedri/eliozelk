#!/usr/bin/env python3
"""
35_image_based_plan_scanner_poc.py
===================================
Engine B: Image-Based Plan Scanner POC

Renders PDF pages as raster images and detects signs/poles/codes visually.
Does NOT touch or modify any existing scripts (01-34) or the existing pipeline.

Usage:
    .venv/bin/python 35_image_based_plan_scanner_poc.py \
        --plan-run-dir runs/poc_plan_50_448_02_400_20260520_223259 \
        [--page 0] [--dpi 300] [--mode fast|deep] [--ocr all|tesseract|easyocr|paddleocr]
"""

# --- 1. CLI & configuration ---
import argparse
import json
import math
import os
import sys
import time
import traceback
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import base64
import textwrap

warnings.filterwarnings("ignore")

# Suppress urllib3 SSL warning from paddleocr deps
import urllib3
urllib3.disable_warnings()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Engine B: Image-Based Plan Scanner POC"
    )
    parser.add_argument(
        "--plan-run-dir", required=True,
        help="Path to the plan run directory (e.g. runs/poc_plan_50_448_02_400_...)"
    )
    parser.add_argument(
        "--page", type=int, default=0,
        help="Page index to scan (0-based, default=0)"
    )
    parser.add_argument(
        "--dpi", type=int, default=300,
        help="Rendering DPI (150=fast, 300=default, 600=deep)"
    )
    parser.add_argument(
        "--mode", choices=["fast", "deep", "tile"], default="fast",
        help="Scan mode: fast=patches only, deep=full-page grid OCR too, tile=tile-based high-res scan"
    )
    parser.add_argument(
        "--ocr", choices=["all", "tesseract", "easyocr", "paddleocr"], default="all",
        help="OCR engines to use"
    )
    # --- Tile mode arguments ---
    parser.add_argument(
        "--tile-grid", default="4x4",
        help="Tile grid dimensions NxM (default: 4x4)"
    )
    parser.add_argument(
        "--tile-overlap", type=float, default=0.1,
        help="Fractional overlap between adjacent tiles (default: 0.1 = 10%%)"
    )
    parser.add_argument(
        "--max-tiles", type=int, default=None,
        help="Stop after N tiles (for testing)"
    )
    parser.add_argument(
        "--tile-dpi", type=int, default=150,
        help="DPI per tile (default: 150)"
    )
    return parser.parse_args()


def log(msg: str, indent: int = 0) -> None:
    prefix = "  " * indent
    print(f"{prefix}{msg}", flush=True)


# --- 2. Input resolution ---

def find_source_pdf(run_dir: Path) -> Optional[Path]:
    """Find source PDF in run_dir/source/, run_dir/uploads/, or run_dir/ directly."""
    search_dirs = [
        run_dir / "source",
        run_dir / "uploads",
        run_dir,
    ]
    for d in search_dirs:
        if d.exists():
            for f in sorted(d.iterdir()):
                if f.suffix.lower() == ".pdf" and f.is_file():
                    return f
    return None


# --- 3. PDF rendering ---

MAX_IMG_PIXELS = 4_000_000   # 4 Megapixels — safety cap for CV processing (connectedComponents scales as O(n))
MAX_BLOB_PIXELS = 4_000_000  # Pole detection runs on a downscaled version if needed


def render_page(pdf_path: Path, page_idx: int, dpi: int, output_dir: Path) -> Tuple[Any, str]:
    """Render PDF page to numpy array and save PNG. Returns (img_bgr, save_path, elapsed_ms).

    Applies a MAX_IMG_PIXELS cap: if the rendered image would exceed 16MP at the requested
    DPI, the DPI is reduced proportionally so the total pixel count stays under the cap.
    This prevents multi-minute connectedComponents runs on A0/A1 plans at 300 DPI.
    """
    import fitz  # PyMuPDF
    import numpy as np
    import cv2

    t0 = time.perf_counter()
    log(f"Rendering page {page_idx} at {dpi} DPI ...", indent=1)

    doc = fitz.open(str(pdf_path))
    if page_idx >= len(doc):
        log(f"  ERROR: PDF has {len(doc)} pages; page index {page_idx} out of range.", indent=1)
        sys.exit(1)

    page = doc[page_idx]
    # Compute rendered size at requested DPI to check cap
    page_rect = page.rect  # in points (1 pt = 1/72 inch)
    w_px_req = int(page_rect.width * dpi / 72)
    h_px_req = int(page_rect.height * dpi / 72)
    total_px_req = w_px_req * h_px_req

    effective_dpi = dpi
    if total_px_req > MAX_IMG_PIXELS:
        scale = math.sqrt(MAX_IMG_PIXELS / total_px_req)
        effective_dpi = max(36, int(dpi * scale))
        log(f"  WARNING: Requested DPI={dpi} would yield {w_px_req}x{h_px_req}px ({total_px_req/1e6:.1f}MP), "
            f"exceeding {MAX_IMG_PIXELS/1e6:.0f}MP cap.", indent=1)
        log(f"  Auto-reducing DPI to {effective_dpi} for processing (rendering will be ~{int(w_px_req*scale)}x{int(h_px_req*scale)}px).", indent=1)

    mat = fitz.Matrix(effective_dpi / 72, effective_dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)

    # Save PNG
    output_dir.mkdir(parents=True, exist_ok=True)
    png_path = output_dir / f"page_{page_idx}_{effective_dpi}dpi.png"
    pix.save(str(png_path))

    # Convert to numpy BGR for OpenCV
    img_data = pix.samples  # RGB bytes
    img_np = np.frombuffer(img_data, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

    elapsed_ms = (time.perf_counter() - t0) * 1000
    doc.close()

    w, h = pix.width, pix.height
    log(f"  Rendered: {w}x{h}px ({w*h/1e6:.1f}MP), effective_dpi={effective_dpi}, "
        f"saved to {png_path.name}, elapsed={elapsed_ms:.0f}ms", indent=1)
    return img_bgr, str(png_path), elapsed_ms, effective_dpi


# --- 4. Pole/tick detection (anchor pass 1) ---

def detect_poles_and_ticks(
    img_bgr,
    dpi: int,
    pole_search_radius_px: int = None
) -> Tuple[List[Dict], float]:
    """
    Detect pole candidates as small filled circles, then find tick marks near each.
    Uses SimpleBlobDetector (fast, O(pixels)) then a contour pass on small ROIs.
    Returns (list of pole candidates, elapsed_ms).
    """
    import cv2
    import numpy as np

    if pole_search_radius_px is None:
        pole_search_radius_px = max(20, int(80 * dpi / 300))

    t0 = time.perf_counter()
    log("Pole/tick detection (anchor pass 1) ...", indent=1)

    h_img, w_img = img_bgr.shape[:2]

    # If image is still too large for fast blob detection, work on a downscaled version
    blob_scale = 1.0
    work_img = img_bgr
    if h_img * w_img > MAX_BLOB_PIXELS:
        blob_scale = math.sqrt(MAX_BLOB_PIXELS / (h_img * w_img))
        new_w = int(w_img * blob_scale)
        new_h = int(h_img * blob_scale)
        work_img = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
        log(f"  Downscaling for pole detection: {w_img}x{h_img} → {new_w}x{new_h} (scale={blob_scale:.3f})", indent=2)

    gray = cv2.cvtColor(work_img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Use SimpleBlobDetector — much faster than connectedComponents on large images
    effective_dpi = dpi * blob_scale
    # Blob area bounds at effective DPI: poles are 0.5–3mm diameter
    # At effective_dpi: 1mm = effective_dpi/25.4 px; area = π*(d/2)²
    mm_to_px = effective_dpi / 25.4
    min_dia_px = max(2, int(0.5 * mm_to_px))   # 0.5mm min pole diameter
    max_dia_px = max(10, int(6.0 * mm_to_px))  # 6mm max pole diameter
    min_area = math.pi * (min_dia_px / 2) ** 2
    max_area = math.pi * (max_dia_px / 2) ** 2

    params = cv2.SimpleBlobDetector_Params()
    params.filterByArea = True
    params.minArea = max(4, min_area)
    params.maxArea = max_area
    params.filterByCircularity = True
    params.minCircularity = 0.5
    params.filterByConvexity = False
    params.filterByInertia = False
    params.minDistBetweenBlobs = max(2, int(min_dia_px * 0.8))

    detector = cv2.SimpleBlobDetector_create(params)
    # SimpleBlobDetector expects white blobs on black background — invert thresh
    keypoints = detector.detect(cv2.bitwise_not(thresh))

    pole_candidates = []
    for kp in keypoints:
        cx_s, cy_s = kp.pt
        # Scale back to original image coords
        cx = cx_s / blob_scale
        cy = cy_s / blob_scale
        radius_s = kp.size / 2
        radius_px = radius_s / blob_scale

        # Search for tick marks in original image around this pole
        margin = int(pole_search_radius_px)
        roi_x1 = max(0, int(cx) - margin)
        roi_y1 = max(0, int(cy) - margin)
        roi_x2 = min(w_img, int(cx) + margin)
        roi_y2 = min(h_img, int(cy) + margin)

        # Re-threshold on the original image ROI for tick detection
        gray_orig = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        roi_gray = gray_orig[roi_y1:roi_y2, roi_x1:roi_x2]
        if roi_gray.size == 0:
            continue
        _, roi_thresh = cv2.threshold(roi_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Hough lines for ticks
        tick_bboxes = []
        min_line_len = max(3, int(5 * dpi / 300))
        max_line_gap = max(2, int(3 * dpi / 300))
        max_tick_len = int(80 * dpi / 300)

        lines = cv2.HoughLinesP(
            roi_thresh, rho=1, theta=math.pi / 180,
            threshold=max(5, int(8 * dpi / 300)),
            minLineLength=min_line_len,
            maxLineGap=max_line_gap
        )
        tick_count = 0
        if lines is not None:
            for line in lines:
                x1_l, y1_l, x2_l, y2_l = line[0]
                length = math.hypot(x2_l - x1_l, y2_l - y1_l)
                if min_line_len <= length <= max_tick_len:
                    tick_bboxes.append([
                        roi_x1 + x1_l, roi_y1 + y1_l,
                        roi_x1 + x2_l, roi_y1 + y2_l
                    ])
                    tick_count += 1

        bbox_r = int(radius_px)
        pole_candidates.append({
            "center_x": float(cx),
            "center_y": float(cy),
            "radius_px": float(radius_px),
            "area_px": math.pi * radius_px ** 2,
            "circularity": 1.0,  # SimpleBlobDetector already filters circularity
            "bbox": [max(0, int(cx) - bbox_r), max(0, int(cy) - bbox_r),
                     min(w_img, int(cx) + bbox_r), min(h_img, int(cy) + bbox_r)],
            "tick_count": tick_count,
            "tick_bboxes": tick_bboxes[:10],
        })

    elapsed_ms = (time.perf_counter() - t0) * 1000
    log(f"  Found {len(pole_candidates)} pole candidates "
        f"(dia range: {min_dia_px:.0f}–{max_dia_px:.0f}px at {effective_dpi:.0f}dpi), "
        f"elapsed={elapsed_ms:.0f}ms", indent=1)
    return pole_candidates, elapsed_ms


# --- 5. OCR pass (anchor pass 2) ---

def _check_ocr_availability(ocr_choice: str) -> Dict[str, bool]:
    available = {}
    if ocr_choice in ("all", "tesseract"):
        try:
            import pytesseract
            pytesseract.get_tesseract_version()
            available["tesseract"] = True
        except Exception:
            available["tesseract"] = False
    else:
        available["tesseract"] = False

    if ocr_choice in ("all", "easyocr"):
        try:
            import easyocr  # noqa: F401
            available["easyocr"] = True
        except ImportError:
            available["easyocr"] = False
    else:
        available["easyocr"] = False

    if ocr_choice in ("all", "paddleocr"):
        try:
            from paddleocr import PaddleOCR  # noqa: F401
            available["paddleocr"] = True
        except ImportError:
            available["paddleocr"] = False
    else:
        available["paddleocr"] = False

    return available


def _is_valid_sign_code(text: str) -> bool:
    """Return True if text looks like a sign code: 2-4 digits, value 1-9999."""
    text = text.strip()
    if not text.isdigit():
        return False
    if len(text) < 2 or len(text) > 4:
        return False
    val = int(text)
    return 1 <= val <= 9999


def _ocr_tesseract(crop_img, region_id: str) -> Dict[str, Any]:
    """Run Tesseract digit-mode OCR on crop. Returns result dict."""
    import pytesseract
    import numpy as np

    t0 = time.perf_counter()
    try:
        data = pytesseract.image_to_data(
            crop_img,
            lang="eng",
            config="--psm 7 -c tessedit_char_whitelist=0123456789",
            output_type=pytesseract.Output.DICT
        )
        best_text = ""
        best_conf = 0.0
        for i, text in enumerate(data["text"]):
            text = str(text).strip()
            conf = float(data["conf"][i])
            if _is_valid_sign_code(text) and conf > best_conf:
                best_text = text
                best_conf = conf
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return {
            "engine": "tesseract",
            "text": best_text if best_text else None,
            "confidence": best_conf if best_text else 0.0,
            "elapsed_ms": round(elapsed_ms, 1),
            "status": "ok"
        }
    except Exception as e:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return {"engine": "tesseract", "text": None, "confidence": 0.0,
                "elapsed_ms": round(elapsed_ms, 1), "status": f"error: {e}"}


def _ocr_easyocr(crop_img, reader_cache: Dict, region_id: str) -> Dict[str, Any]:
    """Run EasyOCR on crop. reader_cache allows reuse across calls."""
    t0 = time.perf_counter()
    try:
        import easyocr
        if "reader" not in reader_cache:
            log("    Initializing EasyOCR reader (may download models on first run) ...", indent=2)
            t_load = time.perf_counter()
            # Use English + Hebrew
            reader_cache["reader"] = easyocr.Reader(["en", "he"], gpu=False, verbose=False)
            load_ms = (time.perf_counter() - t_load) * 1000
            log(f"    EasyOCR reader initialized in {load_ms:.0f}ms", indent=2)

        reader = reader_cache["reader"]
        results = reader.readtext(crop_img, detail=1, paragraph=False)
        best_text = ""
        best_conf = 0.0
        for (bbox_pts, text, conf) in results:
            text = str(text).strip()
            if _is_valid_sign_code(text) and conf > best_conf:
                best_text = text
                best_conf = conf
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return {
            "engine": "easyocr",
            "text": best_text if best_text else None,
            "confidence": float(best_conf) if best_text else 0.0,
            "elapsed_ms": round(elapsed_ms, 1),
            "status": "ok"
        }
    except Exception as e:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return {"engine": "easyocr", "text": None, "confidence": 0.0,
                "elapsed_ms": round(elapsed_ms, 1), "status": f"error: {e}"}


def _ocr_paddleocr(crop_img, paddle_cache: Dict, region_id: str) -> Dict[str, Any]:
    """Run PaddleOCR on crop. paddle_cache allows reuse across calls."""
    t0 = time.perf_counter()
    try:
        from paddleocr import PaddleOCR
        import numpy as np

        if "ocr" not in paddle_cache:
            log("    Initializing PaddleOCR (may download models on first run) ...", indent=2)
            t_load = time.perf_counter()
            paddle_cache["ocr"] = PaddleOCR(
                use_angle_cls=True, lang="en",
                use_gpu=False, show_log=False
            )
            load_ms = (time.perf_counter() - t_load) * 1000
            log(f"    PaddleOCR initialized in {load_ms:.0f}ms", indent=2)

        ocr = paddle_cache["ocr"]
        result = ocr.ocr(crop_img, cls=True)
        best_text = ""
        best_conf = 0.0
        if result and result[0]:
            for line in result[0]:
                if line and len(line) >= 2:
                    text_conf = line[1]
                    if isinstance(text_conf, (list, tuple)) and len(text_conf) >= 2:
                        text, conf = str(text_conf[0]).strip(), float(text_conf[1])
                    else:
                        continue
                    if _is_valid_sign_code(text) and conf > best_conf:
                        best_text = text
                        best_conf = conf
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return {
            "engine": "paddleocr",
            "text": best_text if best_text else None,
            "confidence": float(best_conf) if best_text else 0.0,
            "elapsed_ms": round(elapsed_ms, 1),
            "status": "ok"
        }
    except Exception as e:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return {"engine": "paddleocr", "text": None, "confidence": 0.0,
                "elapsed_ms": round(elapsed_ms, 1), "status": f"error: {e}"}


def _init_ocr_engines(available_engines: Dict[str, bool]) -> Dict[str, Any]:
    """Initialize all available OCR engines once. Returns dict of {engine_name: instance}."""
    engines: Dict[str, Any] = {}

    if available_engines.get("easyocr"):
        log("  Initializing EasyOCR reader (first run may download ~800MB models) ...", indent=1)
        t0 = time.perf_counter()
        try:
            import easyocr
            # Hebrew ('he') is not directly supported; use English only.
            # For Hebrew annotation support, consider 'he' via a separate easyocr model in future.
            engines["easyocr"] = easyocr.Reader(["en"], gpu=False, verbose=False)
            log(f"  EasyOCR ready in {(time.perf_counter()-t0)*1000:.0f}ms", indent=1)
        except Exception as e:
            log(f"  EasyOCR init failed: {e}", indent=1)
            engines["easyocr"] = None

    if available_engines.get("paddleocr"):
        log("  Initializing PaddleOCR (first run may download models) ...", indent=1)
        t0 = time.perf_counter()
        try:
            from paddleocr import PaddleOCR
            # PaddleOCR v3+ changed API; try progressively simpler argument sets
            for kwargs in [
                {"use_angle_cls": True, "lang": "en", "device": "cpu"},
                {"use_angle_cls": True, "lang": "en"},
                {"lang": "en"},
            ]:
                try:
                    engines["paddleocr"] = PaddleOCR(**kwargs)
                    break
                except TypeError:
                    continue
            log(f"  PaddleOCR ready in {(time.perf_counter()-t0)*1000:.0f}ms", indent=1)
        except Exception as e:
            log(f"  PaddleOCR init failed: {e}", indent=1)
            engines["paddleocr"] = None

    if available_engines.get("tesseract"):
        try:
            import pytesseract
            pytesseract.get_tesseract_version()
            engines["tesseract"] = True  # No instance needed
            log("  Tesseract ready.", indent=1)
        except Exception as e:
            log(f"  Tesseract unavailable: {e}", indent=1)
            engines["tesseract"] = None

    return engines


def render_crop_hires(pdf_path: Path, page_idx: int, crop_bbox_px: Tuple,
                      source_dpi: int, target_dpi: int = 150):
    """Render a specific region of the PDF at higher DPI for better OCR.
    crop_bbox_px: (x1,y1,x2,y2) in source_dpi pixel space.
    Returns a BGR numpy array of the crop at target_dpi, or None on error.
    """
    try:
        import fitz
        import numpy as np
        import cv2
        x1, y1, x2, y2 = crop_bbox_px
        # Convert px coords to PDF points (pt = px * 72 / dpi)
        pt_x1 = x1 * 72 / source_dpi
        pt_y1 = y1 * 72 / source_dpi
        pt_x2 = x2 * 72 / source_dpi
        pt_y2 = y2 * 72 / source_dpi
        clip = fitz.Rect(pt_x1, pt_y1, pt_x2, pt_y2)
        doc = fitz.open(str(pdf_path))
        page = doc[page_idx]
        mat = fitz.Matrix(target_dpi / 72, target_dpi / 72)
        pix = page.get_pixmap(matrix=mat, clip=clip, colorspace=fitz.csRGB)
        doc.close()
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
        return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    except Exception:
        return None


def run_ocr_pass(
    img_bgr,
    pole_candidates: List[Dict],
    dpi: int,
    ocr_choice: str,
    mode: str,
    available_engines: Dict[str, bool],
    run_slug: str,
    pdf_path: Path = None,
    page_idx: int = 0,
) -> Tuple[List[Dict], List[Dict], float]:
    """
    Run OCR on crops around each pole candidate + optionally full-page grid.
    Returns (ocr_results, ocr_comparison, elapsed_ms).
    """
    import cv2
    import numpy as np

    t0 = time.perf_counter()
    log("OCR pass (anchor pass 2) ...", indent=1)

    h_img, w_img = img_bgr.shape[:2]
    # Patch radius: about 10mm at the effective DPI. Min 40px, max 200px.
    patch_radius_mm = 10.0
    patch_radius = min(200, max(40, int(patch_radius_mm * dpi / 25.4)))

    # Initialize all engines ONCE before the loop
    ocr_engines = _init_ocr_engines(available_engines)

    ocr_results: List[Dict] = []
    ocr_comparison: List[Dict] = []

    # For OCR, try to use hi-res PDF crop (150 DPI) for better text quality
    # If the source DPI is already < 100, the main render is too low for OCR
    ocr_render_dpi = 150  # Target DPI for OCR crops
    use_hires_ocr = (pdf_path is not None and dpi < 100)

    def crop_patch(cx: float, cy: float) -> Optional[Tuple]:
        x1 = max(0, int(cx) - patch_radius)
        y1 = max(0, int(cy) - patch_radius)
        x2 = min(w_img, int(cx) + patch_radius)
        y2 = min(h_img, int(cy) + patch_radius)
        if x2 <= x1 or y2 <= y1:
            return None
        if use_hires_ocr:
            # Re-render this region from PDF at higher DPI for better OCR
            hires_crop = render_crop_hires(pdf_path, page_idx, (x1, y1, x2, y2),
                                           source_dpi=dpi, target_dpi=ocr_render_dpi)
            if hires_crop is not None and hires_crop.size > 0:
                return hires_crop, (x1, y1, x2, y2)
        crop = img_bgr[y1:y2, x1:x2]
        return crop, (x1, y1, x2, y2)

    def run_all_engines(crop, crop_bbox, region_id: str) -> Dict:
        results_per_engine = {}
        if ocr_engines.get("tesseract"):
            results_per_engine["tesseract"] = _ocr_tesseract(crop, region_id)
        else:
            results_per_engine["tesseract"] = {"engine": "tesseract", "text": None,
                                                "confidence": 0.0, "elapsed_ms": 0,
                                                "status": "not_installed"}

        if ocr_engines.get("easyocr"):
            t_e = time.perf_counter()
            try:
                reader = ocr_engines["easyocr"]
                results = reader.readtext(crop, detail=1, paragraph=False)
                best_text, best_conf = "", 0.0
                for (_, text, conf) in results:
                    text = str(text).strip()
                    if _is_valid_sign_code(text) and conf > best_conf:
                        best_text, best_conf = text, conf
                elapsed_ms = (time.perf_counter() - t_e) * 1000
                results_per_engine["easyocr"] = {
                    "engine": "easyocr",
                    "text": best_text if best_text else None,
                    "confidence": float(best_conf) if best_text else 0.0,
                    "elapsed_ms": round(elapsed_ms, 1), "status": "ok"
                }
            except Exception as e:
                results_per_engine["easyocr"] = {"engine": "easyocr", "text": None,
                                                  "confidence": 0.0, "elapsed_ms": 0,
                                                  "status": f"error:{e}"}
        else:
            results_per_engine["easyocr"] = {"engine": "easyocr", "text": None,
                                              "confidence": 0.0, "elapsed_ms": 0,
                                              "status": "not_installed"}

        if ocr_engines.get("paddleocr"):
            t_p = time.perf_counter()
            try:
                ocr_inst = ocr_engines["paddleocr"]
                result = ocr_inst.ocr(crop, cls=True)
                best_text, best_conf = "", 0.0
                if result and result[0]:
                    for line in result[0]:
                        if line and len(line) >= 2:
                            tc = line[1]
                            if isinstance(tc, (list, tuple)) and len(tc) >= 2:
                                text, conf = str(tc[0]).strip(), float(tc[1])
                                if _is_valid_sign_code(text) and conf > best_conf:
                                    best_text, best_conf = text, conf
                elapsed_ms = (time.perf_counter() - t_p) * 1000
                results_per_engine["paddleocr"] = {
                    "engine": "paddleocr",
                    "text": best_text if best_text else None,
                    "confidence": float(best_conf) if best_text else 0.0,
                    "elapsed_ms": round(elapsed_ms, 1), "status": "ok"
                }
            except Exception as e:
                results_per_engine["paddleocr"] = {"engine": "paddleocr", "text": None,
                                                    "confidence": 0.0, "elapsed_ms": 0,
                                                    "status": f"error:{e}"}
        else:
            results_per_engine["paddleocr"] = {"engine": "paddleocr", "text": None,
                                                "confidence": 0.0, "elapsed_ms": 0,
                                                "status": "not_installed"}

        # Determine consensus
        texts = [v["text"] for v in results_per_engine.values() if v["text"]]
        from collections import Counter
        if texts:
            most_common, count = Counter(texts).most_common(1)[0]
            consensus = most_common
            engines_agree = (count >= 2) or (len(texts) == 1)
        else:
            consensus = None
            engines_agree = False

        comparison_record = {
            "region_id": region_id,
            "crop_bbox": list(crop_bbox),
            "tesseract": results_per_engine.get("tesseract", {}),
            "easyocr": results_per_engine.get("easyocr", {}),
            "paddleocr": results_per_engine.get("paddleocr", {}),
            "consensus": consensus,
            "engines_agree": engines_agree
        }
        ocr_comparison.append(comparison_record)

        # Pick best result for output
        best = None
        best_conf = 0.0
        best_engine = None
        for eng_name, res in results_per_engine.items():
            if res["text"] and res["confidence"] > best_conf:
                best = res["text"]
                best_conf = res["confidence"]
                best_engine = eng_name
        if consensus and engines_agree and len(texts) > 1:
            best_engine = "consensus"

        return {
            "text": best,
            "confidence": best_conf,
            "engine": best_engine or "none",
            "crop_bbox": list(crop_bbox),
            "engines_agree": engines_agree,
            "region_id": region_id
        }

    # Limit OCR patches to avoid extremely long runs
    # Prioritize poles with tick_count > 0, then sample the rest
    MAX_OCR_PATCHES = 50 if mode == "fast" else 200
    poles_with_ticks = [p for p in pole_candidates if p.get("tick_count", 0) > 0]
    poles_no_ticks = [p for p in pole_candidates if p.get("tick_count", 0) == 0]
    # Sort by tick count desc, take up to MAX_OCR_PATCHES
    poles_sorted = sorted(poles_with_ticks, key=lambda p: p.get("tick_count", 0), reverse=True)
    remaining = MAX_OCR_PATCHES - len(poles_sorted)
    if remaining > 0:
        poles_sorted.extend(poles_no_ticks[:remaining])
    ocr_pole_candidates = poles_sorted[:MAX_OCR_PATCHES]
    if len(pole_candidates) > MAX_OCR_PATCHES:
        log(f"  Capped OCR to {len(ocr_pole_candidates)}/{len(pole_candidates)} pole patches "
            f"(prioritising {len(poles_with_ticks)} with ticks)", indent=1)

    # Process crops around each pole candidate
    log(f"  Processing {len(ocr_pole_candidates)} pole patches ...", indent=1)
    for i, pole in enumerate(ocr_pole_candidates):
        cx, cy = pole["center_x"], pole["center_y"]
        result = crop_patch(cx, cy)
        if result is None:
            continue
        crop, crop_bbox = result
        region_id = f"pole_{i:04d}"
        ocr_result = run_all_engines(crop, crop_bbox, region_id)
        ocr_result["pole_index"] = i
        ocr_result["source"] = "pole_patch"
        ocr_results.append(ocr_result)

    # Full-page grid OCR fallback (deep mode or if very few poles found)
    if mode == "deep" or len(pole_candidates) < 3:
        grid_step = int(300 * dpi / 300)  # 300px grid at 300dpi
        grid_size = int(200 * dpi / 300)  # 200px patch
        log(f"  Running grid OCR fallback (mode={mode}, poles={len(pole_candidates)}) ...", indent=1)
        grid_count = 0
        for gy in range(0, h_img - grid_size, grid_step):
            for gx in range(0, w_img - grid_size, grid_step):
                crop = img_bgr[gy:gy + grid_size, gx:gx + grid_size]
                crop_bbox = (gx, gy, gx + grid_size, gy + grid_size)
                region_id = f"grid_{gy:04d}_{gx:04d}"
                # Quick Tesseract pre-filter to avoid running all engines on blank patches
                tess_result = _ocr_tesseract(crop, region_id) if available_engines.get("tesseract") else {"text": None}
                if tess_result["text"] is None:
                    continue  # skip blank patches
                ocr_result = run_all_engines(crop, crop_bbox, region_id)
                ocr_result["pole_index"] = None
                ocr_result["source"] = "grid"
                ocr_results.append(ocr_result)
                grid_count += 1
        log(f"  Grid OCR added {grid_count} additional text candidates", indent=1)

    elapsed_ms = (time.perf_counter() - t0) * 1000
    found = sum(1 for r in ocr_results if r["text"])
    log(f"  OCR pass complete: {len(ocr_results)} regions checked, {found} with text, elapsed={elapsed_ms:.0f}ms", indent=1)
    return ocr_results, ocr_comparison, elapsed_ms


# --- 6. Sign shape detection (anchor pass 3) ---

def detect_sign_shapes(img_bgr, dpi: int) -> Tuple[List[Dict], float]:
    """
    Detect sign shapes (circle, triangle, rectangle, octagon, arrow) via contour analysis.
    Returns (list of shape candidates, elapsed_ms).
    """
    import cv2
    import numpy as np

    t0 = time.perf_counter()
    log("Sign shape detection (anchor pass 3) ...", indent=1)

    scale = (dpi / 300) ** 2
    min_area = int(200 * scale)
    max_area = int(50000 * scale)

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)

    # Dilate edges slightly to close gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges_dilated = cv2.dilate(edges, kernel, iterations=1)

    contours, _ = cv2.findContours(edges_dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    shape_candidates = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue

        circularity = 4 * math.pi * area / (perimeter ** 2)

        # Approximate polygon
        epsilon = 0.02 * perimeter
        approx = cv2.approxPolyDP(cnt, epsilon, True)
        n_vertices = len(approx)

        # Bounding box
        bx, by, bw, bh = cv2.boundingRect(cnt)
        aspect_ratio = bw / bh if bh > 0 else 1.0

        # Centroid via moments
        M = cv2.moments(cnt)
        if M["m00"] == 0:
            continue
        cx = M["m10"] / M["m00"]
        cy = M["m01"] / M["m00"]

        # Classify shape
        if circularity > 0.8:
            shape_type = "circle"
            shape_conf = circularity
        elif n_vertices == 3:
            shape_type = "triangle"
            shape_conf = 0.7
        elif n_vertices == 4:
            if 0.8 <= aspect_ratio <= 1.25:
                shape_type = "square"
                shape_conf = 0.65
            else:
                shape_type = "rectangle"
                shape_conf = 0.65
        elif n_vertices >= 8 or (6 <= n_vertices <= 9 and circularity > 0.7):
            shape_type = "octagon"
            shape_conf = 0.7
        elif n_vertices == 5 or n_vertices == 6:
            # Could be arrow or pentagon
            hull = cv2.convexHull(cnt)
            hull_area = cv2.contourArea(hull)
            solidity = area / hull_area if hull_area > 0 else 0
            if solidity < 0.75:
                shape_type = "arrow"
                shape_conf = 0.6
            else:
                shape_type = "polygon"
                shape_conf = 0.5
        else:
            shape_type = "unknown"
            shape_conf = 0.3

        # Skip very low confidence unknowns
        if shape_type == "unknown" and area < min_area * 2:
            continue

        shape_candidates.append({
            "centroid_x": float(cx),
            "centroid_y": float(cy),
            "bbox": [int(bx), int(by), int(bx + bw), int(by + bh)],
            "area_px": float(area),
            "circularity": float(circularity),
            "shape_type": shape_type,
            "shape_confidence": float(shape_conf),
            "vertex_count": int(n_vertices),
            "aspect_ratio": float(aspect_ratio),
        })

    elapsed_ms = (time.perf_counter() - t0) * 1000
    log(f"  Found {len(shape_candidates)} shape candidates, elapsed={elapsed_ms:.0f}ms", indent=1)
    return shape_candidates, elapsed_ms


# --- 7. Spatial association ---

def euclidean_dist(x1: float, y1: float, x2: float, y2: float) -> float:
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def spatial_association(
    pole_candidates: List[Dict],
    ocr_results: List[Dict],
    shape_candidates: List[Dict],
    dpi: int,
    run_slug: str
) -> Tuple[List[Dict], float]:
    """
    Build association candidates linking poles, text, and shapes.
    Returns (candidates list, elapsed_ms).
    """
    t0 = time.perf_counter()
    log("Spatial association ...", indent=1)

    # Radii scaled with DPI
    pole_ocr_radius = int(150 * dpi / 300)
    pole_shape_radius = int(200 * dpi / 300)
    text_pole_radius = int(200 * dpi / 300)
    shape_text_radius = int(120 * dpi / 300)

    px_per_mm = dpi / 25.4

    candidates: List[Dict] = []
    candidate_counter = [0]
    used_ocr_indices: set = set()
    used_shape_indices: set = set()

    def make_candidate_id() -> str:
        cid = f"{run_slug}_p0_c{candidate_counter[0]:04d}"
        candidate_counter[0] += 1
        return cid

    def find_nearest_ocr(ref_x: float, ref_y: float, radius: float,
                         exclude_indices: set = None) -> Optional[Tuple[int, Dict, float]]:
        best_idx = None
        best_dist = float("inf")
        best_item = None
        for i, r in enumerate(ocr_results):
            if exclude_indices and i in exclude_indices:
                continue
            if r["text"] is None:
                continue
            bx = (r["crop_bbox"][0] + r["crop_bbox"][2]) / 2
            by = (r["crop_bbox"][1] + r["crop_bbox"][3]) / 2
            d = euclidean_dist(ref_x, ref_y, bx, by)
            if d <= radius and d < best_dist:
                best_dist = d
                best_idx = i
                best_item = r
        return (best_idx, best_item, best_dist) if best_idx is not None else None

    def find_nearest_shape(ref_x: float, ref_y: float, radius: float,
                           exclude_indices: set = None) -> Optional[Tuple[int, Dict, float]]:
        best_idx = None
        best_dist = float("inf")
        best_item = None
        for i, s in enumerate(shape_candidates):
            if exclude_indices and i in exclude_indices:
                continue
            d = euclidean_dist(ref_x, ref_y, s["centroid_x"], s["centroid_y"])
            if d <= radius and d < best_dist:
                best_dist = d
                best_idx = i
                best_item = s
        return (best_idx, best_item, best_dist) if best_idx is not None else None

    def find_nearest_pole(ref_x: float, ref_y: float, radius: float) -> Optional[Tuple[int, Dict, float]]:
        best_idx = None
        best_dist = float("inf")
        best_item = None
        for i, p in enumerate(pole_candidates):
            d = euclidean_dist(ref_x, ref_y, p["center_x"], p["center_y"])
            if d <= radius and d < best_dist:
                best_dist = d
                best_idx = i
                best_item = p
        return (best_idx, best_item, best_dist) if best_idx is not None else None

    def compute_score(pole: Optional[Dict], ocr: Optional[Dict], shape: Optional[Dict], engines_agree: bool) -> Tuple[int, List[str]]:
        score = 0
        reasons = []
        if pole:
            score += 40
            reasons.append("pole_detected")
            if pole.get("tick_count", 0) > 0:
                score += 20
                reasons.append("tick_marks_found")
        if ocr and ocr.get("text"):
            score += 30
            reasons.append("sign_code_found")
            if engines_agree:
                score += 10
                reasons.append("ocr_engines_agree")
        if shape:
            score += 10
            reasons.append("shape_detected")
        return min(score, 100), reasons

    def review_reasons(score: int, ocr: Optional[Dict], pole: Optional[Dict], shape: Optional[Dict]) -> Optional[str]:
        reasons = []
        if score < 60:
            reasons.append(f"low_confidence_{score}")
        if not ocr or not ocr.get("text"):
            reasons.append("no_sign_code")
        if not pole:
            reasons.append("no_pole_detected")
        if not shape:
            reasons.append("no_shape_detected")
        return "; ".join(reasons) if reasons else None

    # Primary: pole-first
    log(f"  Pole-first association ({len(pole_candidates)} poles) ...", indent=2)
    for pole_idx, pole in enumerate(pole_candidates):
        cx, cy = pole["center_x"], pole["center_y"]

        ocr_match = find_nearest_ocr(cx, cy, pole_ocr_radius)
        shape_match = find_nearest_shape(cx, cy, pole_shape_radius)

        ocr_item = ocr_match[1] if ocr_match else None
        ocr_dist = ocr_match[2] if ocr_match else None
        ocr_idx = ocr_match[0] if ocr_match else None

        shape_item = shape_match[1] if shape_match else None
        shape_dist = shape_match[2] if shape_match else None
        shape_idx = shape_match[0] if shape_match else None

        engines_agree = ocr_item.get("engines_agree", False) if ocr_item else False
        score, score_reasons = compute_score(pole, ocr_item, shape_item, engines_agree)
        rev_reason = review_reasons(score, ocr_item, pole, shape_item)

        assoc_dist_px = ocr_dist if ocr_dist is not None else (shape_dist if shape_dist is not None else 0.0)
        assoc_dist_mm = assoc_dist_px / px_per_mm if px_per_mm > 0 else 0.0

        cid = make_candidate_id()
        candidates.append({
            "candidate_id": cid,
            "page_number": 0,
            "anchor_type": "pole",
            "pole_bbox": pole["bbox"],
            "pole_center": [round(cx, 1), round(cy, 1)],
            "tick_count": pole["tick_count"],
            "tick_bboxes": pole["tick_bboxes"],
            "sign_code_text": ocr_item["text"] if ocr_item else None,
            "sign_code_confidence": round(ocr_item["confidence"], 3) if ocr_item else 0.0,
            "sign_code_bbox": ocr_item["crop_bbox"] if ocr_item else None,
            "sign_code_ocr_engine": ocr_item["engine"] if ocr_item else None,
            "sign_shape_bbox": shape_item["bbox"] if shape_item else None,
            "sign_shape_type": shape_item["shape_type"] if shape_item else None,
            "sign_shape_confidence": round(shape_item["shape_confidence"], 3) if shape_item else 0.0,
            "association_distance_px": round(assoc_dist_px, 1),
            "association_distance_mm": round(assoc_dist_mm, 2),
            "overall_confidence": score,
            "requires_review": score < 60 or (ocr_item is None or not ocr_item.get("text")),
            "review_reason": rev_reason,
            "evidence_crop_path": f"outputs/image_scan_debug/evidence_crop_{cid}.png",
            "_debug_score_reasons": score_reasons,
        })

        if ocr_idx is not None:
            used_ocr_indices.add(ocr_idx)
        if shape_idx is not None:
            used_shape_indices.add(shape_idx)

    # Text-first fallback: OCR results not yet associated
    text_fallback_count = 0
    for i, ocr_item in enumerate(ocr_results):
        if i in used_ocr_indices:
            continue
        if not ocr_item.get("text"):
            continue
        bx = (ocr_item["crop_bbox"][0] + ocr_item["crop_bbox"][2]) / 2
        by = (ocr_item["crop_bbox"][1] + ocr_item["crop_bbox"][3]) / 2

        pole_match = find_nearest_pole(bx, by, text_pole_radius)
        shape_match = find_nearest_shape(bx, by, shape_text_radius)

        pole_item = pole_match[1] if pole_match else None
        pole_dist = pole_match[2] if pole_match else None

        shape_item = shape_match[1] if shape_match else None
        shape_dist = shape_match[2] if shape_match else None
        shape_idx = shape_match[0] if shape_match else None

        engines_agree = ocr_item.get("engines_agree", False)
        score, _ = compute_score(pole_item, ocr_item, shape_item, engines_agree)
        rev_reason = review_reasons(score, ocr_item, pole_item, shape_item)

        anchor = "text" if pole_item else "text_standalone"
        assoc_dist_px = pole_dist if pole_dist is not None else 0.0
        assoc_dist_mm = assoc_dist_px / px_per_mm if px_per_mm > 0 else 0.0

        cid = make_candidate_id()
        candidates.append({
            "candidate_id": cid,
            "page_number": 0,
            "anchor_type": anchor,
            "pole_bbox": pole_item["bbox"] if pole_item else None,
            "pole_center": [round(pole_item["center_x"], 1), round(pole_item["center_y"], 1)] if pole_item else None,
            "tick_count": pole_item["tick_count"] if pole_item else 0,
            "tick_bboxes": pole_item["tick_bboxes"] if pole_item else [],
            "sign_code_text": ocr_item["text"],
            "sign_code_confidence": round(ocr_item["confidence"], 3),
            "sign_code_bbox": ocr_item["crop_bbox"],
            "sign_code_ocr_engine": ocr_item["engine"],
            "sign_shape_bbox": shape_item["bbox"] if shape_item else None,
            "sign_shape_type": shape_item["shape_type"] if shape_item else None,
            "sign_shape_confidence": round(shape_item["shape_confidence"], 3) if shape_item else 0.0,
            "association_distance_px": round(assoc_dist_px, 1),
            "association_distance_mm": round(assoc_dist_mm, 2),
            "overall_confidence": score,
            "requires_review": score < 60,
            "review_reason": rev_reason,
            "evidence_crop_path": f"outputs/image_scan_debug/evidence_crop_{cid}.png",
            "_debug_score_reasons": [],
        })

        if shape_idx is not None:
            used_shape_indices.add(shape_idx)
        text_fallback_count += 1

    # Shape-first fallback: shapes not yet associated
    shape_fallback_count = 0
    for i, shape_item in enumerate(shape_candidates):
        if i in used_shape_indices:
            continue
        scx, scy = shape_item["centroid_x"], shape_item["centroid_y"]
        ocr_match = find_nearest_ocr(scx, scy, shape_text_radius)
        if not ocr_match:
            continue
        ocr_item = ocr_match[1]
        if not ocr_item.get("text"):
            continue

        engines_agree = ocr_item.get("engines_agree", False)
        score, _ = compute_score(None, ocr_item, shape_item, engines_agree)
        rev_reason = review_reasons(score, ocr_item, None, shape_item)

        assoc_dist_px = ocr_match[2]
        assoc_dist_mm = assoc_dist_px / px_per_mm if px_per_mm > 0 else 0.0

        cid = make_candidate_id()
        candidates.append({
            "candidate_id": cid,
            "page_number": 0,
            "anchor_type": "shape",
            "pole_bbox": None,
            "pole_center": None,
            "tick_count": 0,
            "tick_bboxes": [],
            "sign_code_text": ocr_item["text"],
            "sign_code_confidence": round(ocr_item["confidence"], 3),
            "sign_code_bbox": ocr_item["crop_bbox"],
            "sign_code_ocr_engine": ocr_item["engine"],
            "sign_shape_bbox": shape_item["bbox"],
            "sign_shape_type": shape_item["shape_type"],
            "sign_shape_confidence": round(shape_item["shape_confidence"], 3),
            "association_distance_px": round(assoc_dist_px, 1),
            "association_distance_mm": round(assoc_dist_mm, 2),
            "overall_confidence": score,
            "requires_review": score < 60,
            "review_reason": rev_reason,
            "evidence_crop_path": f"outputs/image_scan_debug/evidence_crop_{cid}.png",
            "_debug_score_reasons": [],
        })
        shape_fallback_count += 1

    elapsed_ms = (time.perf_counter() - t0) * 1000
    total = len(candidates)
    needs_review = sum(1 for c in candidates if c["requires_review"])
    log(f"  Association complete: {total} candidates ({needs_review} require review), "
        f"text-fallback={text_fallback_count}, shape-fallback={shape_fallback_count}, "
        f"elapsed={elapsed_ms:.0f}ms", indent=1)
    return candidates, elapsed_ms


# --- 8. Evidence crops ---

def save_evidence_crops(
    img_bgr,
    candidates: List[Dict],
    output_dir: Path,
    run_dir: Path
) -> Tuple[int, float]:
    """
    For each candidate, save an annotated crop as evidence.
    Returns (count_saved, elapsed_ms).
    """
    import cv2
    import numpy as np

    t0 = time.perf_counter()
    log("Saving evidence crops ...", indent=1)

    debug_dir = output_dir / "image_scan_debug"
    debug_dir.mkdir(parents=True, exist_ok=True)

    h_img, w_img = img_bgr.shape[:2]
    padding = 20
    count_saved = 0

    for cand in candidates:
        cid = cand["candidate_id"]
        # Compute bounding box covering all elements
        all_x1, all_y1, all_x2, all_y2 = [], [], [], []

        def add_bbox(bbox):
            if bbox:
                all_x1.append(bbox[0])
                all_y1.append(bbox[1])
                all_x2.append(bbox[2])
                all_y2.append(bbox[3])

        add_bbox(cand.get("pole_bbox"))
        add_bbox(cand.get("sign_code_bbox"))
        add_bbox(cand.get("sign_shape_bbox"))
        for tb in cand.get("tick_bboxes", []):
            add_bbox(tb)

        if not all_x1:
            # Use pole center as fallback
            pc = cand.get("pole_center")
            if pc:
                cx, cy = pc
                all_x1 = [cx - 50]
                all_y1 = [cy - 50]
                all_x2 = [cx + 50]
                all_y2 = [cy + 50]
            else:
                # Use sign code bbox center
                scb = cand.get("sign_code_bbox")
                if scb:
                    cx = (scb[0] + scb[2]) / 2
                    cy = (scb[1] + scb[3]) / 2
                    all_x1 = [cx - 50]
                    all_y1 = [cy - 50]
                    all_x2 = [cx + 50]
                    all_y2 = [cy + 50]
                else:
                    continue

        crop_x1 = max(0, int(min(all_x1)) - padding)
        crop_y1 = max(0, int(min(all_y1)) - padding)
        crop_x2 = min(w_img, int(max(all_x2)) + padding)
        crop_y2 = min(h_img, int(max(all_y2)) + padding)

        if crop_x2 <= crop_x1 or crop_y2 <= crop_y1:
            continue

        crop = img_bgr[crop_y1:crop_y2, crop_x1:crop_x2].copy()

        def to_local(bbox):
            if not bbox:
                return None
            return [bbox[0] - crop_x1, bbox[1] - crop_y1, bbox[2] - crop_x1, bbox[3] - crop_y1]

        # Annotate: pole = green, text = blue, shape = red, ticks = yellow
        pole_bbox_local = to_local(cand.get("pole_bbox"))
        if pole_bbox_local:
            cv2.rectangle(crop, (pole_bbox_local[0], pole_bbox_local[1]),
                          (pole_bbox_local[2], pole_bbox_local[3]), (0, 255, 0), 2)

        code_bbox_local = to_local(cand.get("sign_code_bbox"))
        if code_bbox_local:
            cv2.rectangle(crop, (code_bbox_local[0], code_bbox_local[1]),
                          (code_bbox_local[2], code_bbox_local[3]), (255, 0, 0), 2)
            code_text = cand.get("sign_code_text", "?")
            cv2.putText(crop, str(code_text), (code_bbox_local[0], max(0, code_bbox_local[1] - 4)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 1)

        shape_bbox_local = to_local(cand.get("sign_shape_bbox"))
        if shape_bbox_local:
            cv2.rectangle(crop, (shape_bbox_local[0], shape_bbox_local[1]),
                          (shape_bbox_local[2], shape_bbox_local[3]), (0, 0, 255), 2)

        for tb in cand.get("tick_bboxes", []):
            tb_local = to_local(tb)
            if tb_local:
                cv2.rectangle(crop, (tb_local[0], tb_local[1]),
                              (tb_local[2], tb_local[3]), (0, 255, 255), 1)

        # Add confidence label
        conf = cand.get("overall_confidence", 0)
        anchor = cand.get("anchor_type", "?")
        label = f"{cid.split('_')[-1]} {anchor} conf={conf}"
        cv2.putText(crop, label, (5, min(25, crop.shape[0] - 5)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 2)
        cv2.putText(crop, label, (5, min(25, crop.shape[0] - 5)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

        save_path = debug_dir / f"evidence_crop_{cid}.png"
        cv2.imwrite(str(save_path), crop)
        count_saved += 1

    elapsed_ms = (time.perf_counter() - t0) * 1000
    log(f"  Saved {count_saved} evidence crops to {debug_dir.name}/, elapsed={elapsed_ms:.0f}ms", indent=1)
    return count_saved, elapsed_ms


# --- 9. Output generation ---

class _NumpyEncoder(json.JSONEncoder):
    """JSON encoder that handles numpy int/float types."""
    def default(self, obj):
        import numpy as np
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


def _json_safe(obj):
    """Recursively convert numpy types in nested structures to Python native types."""
    import numpy as np
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


def write_outputs(
    run_dir: Path,
    candidates: List[Dict],
    ocr_comparison: List[Dict],
    page_idx: int,
    dpi: int,
    mode: str,
    ocr_choice: str,
    available_engines: Dict[str, bool],
    timing: Dict[str, float],
    png_path: str,
) -> None:
    """Write all output files."""
    import json
    import base64

    output_dir = run_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)

    # --- image_scan_candidates.json ---
    candidates_path = output_dir / "image_scan_candidates.json"
    # Remove private debug fields and convert numpy types before saving
    clean_candidates = []
    for c in candidates:
        cc = {k: v for k, v in c.items() if not k.startswith("_")}
        clean_candidates.append(_json_safe(cc))
    with open(candidates_path, "w", encoding="utf-8") as f:
        json.dump(clean_candidates, f, indent=2, ensure_ascii=False)

    # --- image_scan_ocr_comparison.json ---
    ocr_comp_path = output_dir / "image_scan_ocr_comparison.json"
    with open(ocr_comp_path, "w", encoding="utf-8") as f:
        json.dump(_json_safe(ocr_comparison), f, indent=2, ensure_ascii=False)

    total = len(candidates)
    needs_review = sum(1 for c in candidates if c.get("requires_review"))
    with_code = sum(1 for c in candidates if c.get("sign_code_text"))
    with_shape = sum(1 for c in candidates if c.get("sign_shape_type"))
    high_conf = sum(1 for c in candidates if c.get("overall_confidence", 0) >= 70)

    total_elapsed = sum(timing.values())

    # --- image_scan_report.md ---
    md_path = output_dir / "image_scan_report.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# Image Scan Report — Engine B POC\n\n")
        f.write(f"**Run dir:** `{run_dir}`  \n")
        f.write(f"**Page:** {page_idx}  \n")
        f.write(f"**DPI:** {dpi}  \n")
        f.write(f"**Mode:** {mode}  \n")
        f.write(f"**OCR engines requested:** {ocr_choice}  \n")
        f.write(f"**OCR engines available:** "
                f"tesseract={available_engines.get('tesseract')}, "
                f"easyocr={available_engines.get('easyocr')}, "
                f"paddleocr={available_engines.get('paddleocr')}  \n\n")
        f.write(f"## Summary\n\n")
        f.write(f"| Metric | Value |\n|---|---|\n")
        f.write(f"| Total candidates | {total} |\n")
        f.write(f"| Requires review | {needs_review} |\n")
        f.write(f"| High confidence (≥70) | {high_conf} |\n")
        f.write(f"| Candidates with sign code | {with_code} |\n")
        f.write(f"| Candidates with shape | {with_shape} |\n\n")
        f.write(f"## Timing\n\n")
        f.write(f"| Stage | Elapsed (ms) |\n|---|---|\n")
        for stage, ms in timing.items():
            f.write(f"| {stage} | {ms:.0f} |\n")
        f.write(f"| **Total** | **{total_elapsed:.0f}** |\n\n")
        f.write(f"## Top Candidates\n\n")
        top = sorted(candidates, key=lambda x: x.get("overall_confidence", 0), reverse=True)[:20]
        f.write(f"| ID | Anchor | Code | Code Conf | Shape | Overall Conf | Review |\n")
        f.write(f"|---|---|---|---|---|---|---|\n")
        for c in top:
            rev = "YES" if c.get("requires_review") else "no"
            f.write(f"| {c['candidate_id'].split('_')[-1]} "
                    f"| {c.get('anchor_type','?')} "
                    f"| {c.get('sign_code_text','—')} "
                    f"| {c.get('sign_code_confidence',0):.2f} "
                    f"| {c.get('sign_shape_type','—')} "
                    f"| {c.get('overall_confidence',0)} "
                    f"| {rev} |\n")

    # --- image_scan_ocr_comparison.md ---
    ocr_md_path = output_dir / "image_scan_ocr_comparison.md"
    with open(ocr_md_path, "w", encoding="utf-8") as f:
        f.write(f"# OCR Engine Comparison\n\n")
        f.write(f"| Region | Tesseract | EasyOCR | PaddleOCR | Consensus | Agree |\n")
        f.write(f"|---|---|---|---|---|---|\n")
        shown = 0
        for comp in ocr_comparison:
            t_text = comp.get("tesseract", {}).get("text") or "—"
            e_text = comp.get("easyocr", {}).get("text") or "—"
            p_text = comp.get("paddleocr", {}).get("text") or "—"
            cons = comp.get("consensus") or "—"
            agree = "YES" if comp.get("engines_agree") else "no"
            if cons != "—":  # only show regions where something was found
                f.write(f"| {comp['region_id']} | {t_text} | {e_text} | {p_text} | {cons} | {agree} |\n")
                shown += 1
            if shown >= 50:
                f.write(f"\n*(truncated at 50 rows — see JSON for full data)*\n")
                break

    # --- image_scan_report.html ---
    html_path = output_dir / "image_scan_report.html"
    debug_dir = output_dir / "image_scan_debug"

    def img_to_b64(path: Path) -> Optional[str]:
        try:
            with open(path, "rb") as fh:
                return base64.b64encode(fh.read()).decode("ascii")
        except Exception:
            return None

    top20 = sorted(candidates, key=lambda x: x.get("overall_confidence", 0), reverse=True)[:20]

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(textwrap.dedent(f"""\
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8">
            <title>Image Scan Report — Engine B POC</title>
            <style>
              body {{ font-family: monospace; background: #111; color: #eee; padding: 20px; }}
              h1, h2 {{ color: #7cf; }}
              table {{ border-collapse: collapse; margin-bottom: 20px; }}
              th, td {{ border: 1px solid #444; padding: 6px 10px; text-align: left; }}
              th {{ background: #222; color: #7cf; }}
              .high {{ color: #4f4; }}
              .low {{ color: #f84; }}
              .review {{ color: #f44; font-weight: bold; }}
              img {{ max-width: 200px; border: 1px solid #555; background: #222; }}
              .grid {{ display: flex; flex-wrap: wrap; gap: 12px; }}
              .card {{ background: #1a1a1a; border: 1px solid #333; padding: 10px; width: 220px; }}
              .card img {{ width: 200px; height: auto; }}
              .card .label {{ font-size: 11px; margin-top: 6px; color: #aaa; }}
            </style>
            </head>
            <body>
            <h1>Image Scan Report — Engine B POC</h1>
            <p><b>Run dir:</b> {run_dir}<br>
            <b>Page:</b> {page_idx} &nbsp; <b>DPI:</b> {dpi} &nbsp; <b>Mode:</b> {mode}</p>
            <h2>Summary</h2>
            <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Total candidates</td><td>{total}</td></tr>
            <tr><td>Requires review</td><td class="review">{needs_review}</td></tr>
            <tr><td>High confidence (≥70)</td><td class="high">{high_conf}</td></tr>
            <tr><td>With sign code</td><td>{with_code}</td></tr>
            <tr><td>With shape</td><td>{with_shape}</td></tr>
            </table>
            <h2>Timing</h2>
            <table>
            <tr><th>Stage</th><th>ms</th></tr>
        """))
        for stage, ms in timing.items():
            f.write(f"<tr><td>{stage}</td><td>{ms:.0f}</td></tr>\n")
        f.write(f"<tr><td><b>Total</b></td><td><b>{total_elapsed:.0f}</b></td></tr>\n")
        f.write("</table>\n<h2>Top 20 Candidates</h2>\n<div class='grid'>\n")

        for c in top20:
            cid = c["candidate_id"]
            crop_file = debug_dir / f"evidence_crop_{cid}.png"
            b64 = img_to_b64(crop_file)
            img_tag = f'<img src="data:image/png;base64,{b64}">' if b64 else '<span style="color:#888">[no crop]</span>'
            conf = c.get("overall_confidence", 0)
            conf_class = "high" if conf >= 70 else ("low" if conf < 40 else "")
            rev_class = "review" if c.get("requires_review") else ""
            f.write(f"""<div class='card'>
  {img_tag}
  <div class='label'>
    <b>{c.get('anchor_type','?')}</b> &nbsp;
    code: <b>{c.get('sign_code_text','—')}</b> ({c.get('sign_code_confidence',0):.2f})<br>
    shape: {c.get('sign_shape_type','—')}<br>
    conf: <span class='{conf_class}'>{conf}</span>
    {f'<span class="review">REVIEW</span>' if c.get("requires_review") else ''}
    <br><small>{cid}</small>
  </div>
</div>\n""")
        f.write("</div>\n</body>\n</html>\n")

    log(f"  Outputs written:", indent=1)
    log(f"    {candidates_path.name} ({len(candidates)} candidates)", indent=2)
    log(f"    {ocr_comp_path.name} ({len(ocr_comparison)} regions)", indent=2)
    log(f"    {md_path.name}", indent=2)
    log(f"    {ocr_md_path.name}", indent=2)
    log(f"    {html_path.name}", indent=2)


# --- 10. Tile mode ---

def _parse_tile_grid(grid_str: str) -> Tuple[int, int]:
    """Parse '4x4' or '3x5' into (rows, cols)."""
    parts = grid_str.lower().split("x")
    if len(parts) != 2:
        raise ValueError(f"Invalid tile grid: {grid_str!r}. Expected format NxM (e.g. 4x4)")
    return int(parts[0]), int(parts[1])


def render_tile(pdf_path: Path, page_idx: int, tile_rect, tile_dpi: int):
    """Render a single tile of the PDF at the given DPI.
    tile_rect is a fitz.Rect in PDF points.
    Returns (img_bgr, elapsed_ms).
    """
    import fitz
    import numpy as np
    import cv2

    t0 = time.perf_counter()
    doc = fitz.open(str(pdf_path))
    page = doc[page_idx]
    mat = fitz.Matrix(tile_dpi / 72, tile_dpi / 72)
    pix = page.get_pixmap(matrix=mat, clip=tile_rect, colorspace=fitz.csRGB)
    doc.close()

    img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    return img_bgr, elapsed_ms


def detect_poles_tile(img_bgr, tile_dpi: int) -> Tuple[List[Dict], float]:
    """
    Pole/tick detection tuned for tile mode at 150 DPI.
    At 150 DPI, poles are 15-40px blobs. Uses tighter blob params to reduce false positives.
    Returns (pole_candidates, elapsed_ms).
    """
    import cv2
    import numpy as np

    t0 = time.perf_counter()
    h_img, w_img = img_bgr.shape[:2]

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Tighter blob params for 150 DPI tiles — poles are 15-40px blobs
    params = cv2.SimpleBlobDetector_Params()
    params.filterByArea = True
    params.minArea = 50        # px² — tighter than full-page (avoids text dots)
    params.maxArea = 3000      # px²
    params.filterByCircularity = True
    params.minCircularity = 0.5
    params.filterByConvexity = True
    params.minConvexity = 0.7
    params.filterByInertia = True
    params.minInertiaRatio = 0.3
    params.minDistBetweenBlobs = 5

    detector = cv2.SimpleBlobDetector_create(params)
    keypoints = detector.detect(cv2.bitwise_not(thresh))

    pole_search_radius_px = max(20, int(80 * tile_dpi / 300))

    # Re-use original image for tick ROI (no blob-scale downscaling needed at 150 DPI tiles)
    gray_orig = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    pole_candidates = []
    for kp in keypoints:
        cx, cy = kp.pt
        radius_px = kp.size / 2

        # Tick search ROI
        margin = pole_search_radius_px
        roi_x1 = max(0, int(cx) - margin)
        roi_y1 = max(0, int(cy) - margin)
        roi_x2 = min(w_img, int(cx) + margin)
        roi_y2 = min(h_img, int(cy) + margin)

        roi_gray = gray_orig[roi_y1:roi_y2, roi_x1:roi_x2]
        if roi_gray.size == 0:
            continue
        _, roi_thresh = cv2.threshold(roi_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Tighter Hough params for 150 DPI
        min_line_len = 8    # px at 150 DPI
        max_line_gap = 3
        hough_threshold = 15
        max_tick_len = int(60 * tile_dpi / 300)

        lines = cv2.HoughLinesP(
            roi_thresh, rho=1, theta=math.pi / 180,
            threshold=hough_threshold,
            minLineLength=min_line_len,
            maxLineGap=max_line_gap
        )
        tick_bboxes = []
        tick_count = 0
        if lines is not None:
            for line in lines:
                x1_l, y1_l, x2_l, y2_l = line[0]
                length = math.hypot(x2_l - x1_l, y2_l - y1_l)
                if min_line_len <= length <= max_tick_len:
                    tick_bboxes.append([
                        roi_x1 + x1_l, roi_y1 + y1_l,
                        roi_x1 + x2_l, roi_y1 + y2_l
                    ])
                    tick_count += 1

        bbox_r = max(1, int(radius_px))
        pole_candidates.append({
            "center_x": float(cx),
            "center_y": float(cy),
            "radius_px": float(radius_px),
            "area_px": math.pi * radius_px ** 2,
            "circularity": 1.0,
            "bbox": [max(0, int(cx) - bbox_r), max(0, int(cy) - bbox_r),
                     min(w_img, int(cx) + bbox_r), min(h_img, int(cy) + bbox_r)],
            "tick_count": tick_count,
            "tick_bboxes": tick_bboxes[:10],
        })

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return pole_candidates, elapsed_ms


def detect_shapes_tile(img_bgr, tile_dpi: int) -> Tuple[List[Dict], float]:
    """Shape detection tuned for tile mode."""
    import cv2
    import numpy as np

    t0 = time.perf_counter()
    # At 150 DPI tiles: shapes are larger in px than at 42 DPI full-page
    scale = (tile_dpi / 300) ** 2
    min_area = int(200 * scale)
    max_area = int(50000 * scale)

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges_dilated = cv2.dilate(edges, kernel, iterations=1)
    contours, _ = cv2.findContours(edges_dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    shape_candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue
        circularity = 4 * math.pi * area / (perimeter ** 2)
        epsilon = 0.02 * perimeter
        approx = cv2.approxPolyDP(cnt, epsilon, True)
        n_vertices = len(approx)
        bx, by, bw, bh = cv2.boundingRect(cnt)
        aspect_ratio = bw / bh if bh > 0 else 1.0
        M = cv2.moments(cnt)
        if M["m00"] == 0:
            continue
        cx = M["m10"] / M["m00"]
        cy = M["m01"] / M["m00"]

        if circularity > 0.8:
            shape_type, shape_conf = "circle", circularity
        elif n_vertices == 3:
            shape_type, shape_conf = "triangle", 0.7
        elif n_vertices == 4:
            if 0.8 <= aspect_ratio <= 1.25:
                shape_type, shape_conf = "square", 0.65
            else:
                shape_type, shape_conf = "rectangle", 0.65
        elif n_vertices >= 8 or (6 <= n_vertices <= 9 and circularity > 0.7):
            shape_type, shape_conf = "octagon", 0.7
        elif n_vertices in (5, 6):
            hull = cv2.convexHull(cnt)
            hull_area = cv2.contourArea(hull)
            solidity = area / hull_area if hull_area > 0 else 0
            shape_type = "arrow" if solidity < 0.75 else "polygon"
            shape_conf = 0.6 if solidity < 0.75 else 0.5
        else:
            shape_type, shape_conf = "unknown", 0.3

        if shape_type == "unknown" and area < min_area * 2:
            continue

        shape_candidates.append({
            "centroid_x": float(cx),
            "centroid_y": float(cy),
            "bbox": [int(bx), int(by), int(bx + bw), int(by + bh)],
            "area_px": float(area),
            "circularity": float(circularity),
            "shape_type": shape_type,
            "shape_confidence": float(shape_conf),
            "vertex_count": int(n_vertices),
            "aspect_ratio": float(aspect_ratio),
        })

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return shape_candidates, elapsed_ms


def _ocr_tile(img_bgr, ocr_engines: Dict, tile_dpi: int) -> Tuple[List[Dict], List[Dict], float]:
    """
    Run OCR on a tile image. Returns (ocr_results, ocr_comparison, elapsed_ms).
    OCR is run on the full tile image (not patch-by-patch) for efficiency.
    """
    import cv2
    import numpy as np
    from collections import Counter

    t0 = time.perf_counter()
    ocr_results: List[Dict] = []
    ocr_comparison: List[Dict] = []

    h_img, w_img = img_bgr.shape[:2]

    def run_engines_on_crop(crop, crop_bbox, region_id: str) -> Dict:
        results_per_engine: Dict[str, Any] = {}

        if ocr_engines.get("tesseract"):
            results_per_engine["tesseract"] = _ocr_tesseract(crop, region_id)
        else:
            results_per_engine["tesseract"] = {
                "engine": "tesseract", "text": None, "confidence": 0.0,
                "elapsed_ms": 0, "status": "not_installed"
            }

        if ocr_engines.get("easyocr"):
            t_e = time.perf_counter()
            try:
                reader = ocr_engines["easyocr"]
                results = reader.readtext(crop, detail=1, paragraph=False)
                best_text, best_conf = "", 0.0
                for (_, text, conf) in results:
                    text = str(text).strip()
                    if _is_valid_sign_code(text) and conf > best_conf:
                        best_text, best_conf = text, conf
                elapsed_ms = (time.perf_counter() - t_e) * 1000
                results_per_engine["easyocr"] = {
                    "engine": "easyocr",
                    "text": best_text if best_text else None,
                    "confidence": float(best_conf) if best_text else 0.0,
                    "elapsed_ms": round(elapsed_ms, 1), "status": "ok"
                }
            except Exception as e:
                results_per_engine["easyocr"] = {
                    "engine": "easyocr", "text": None, "confidence": 0.0,
                    "elapsed_ms": 0, "status": f"error:{e}"
                }
        else:
            results_per_engine["easyocr"] = {
                "engine": "easyocr", "text": None, "confidence": 0.0,
                "elapsed_ms": 0, "status": "not_installed"
            }

        if ocr_engines.get("paddleocr"):
            t_p = time.perf_counter()
            try:
                ocr_inst = ocr_engines["paddleocr"]
                result = ocr_inst.ocr(crop, cls=True)
                best_text, best_conf = "", 0.0
                if result and result[0]:
                    for line in result[0]:
                        if line and len(line) >= 2:
                            tc = line[1]
                            if isinstance(tc, (list, tuple)) and len(tc) >= 2:
                                text, conf = str(tc[0]).strip(), float(tc[1])
                                if _is_valid_sign_code(text) and conf > best_conf:
                                    best_text, best_conf = text, conf
                elapsed_ms = (time.perf_counter() - t_p) * 1000
                results_per_engine["paddleocr"] = {
                    "engine": "paddleocr",
                    "text": best_text if best_text else None,
                    "confidence": float(best_conf) if best_text else 0.0,
                    "elapsed_ms": round(elapsed_ms, 1), "status": "ok"
                }
            except Exception as e:
                results_per_engine["paddleocr"] = {
                    "engine": "paddleocr", "text": None, "confidence": 0.0,
                    "elapsed_ms": 0, "status": f"error:{e}"
                }
        else:
            results_per_engine["paddleocr"] = {
                "engine": "paddleocr", "text": None, "confidence": 0.0,
                "elapsed_ms": 0, "status": "not_installed"
            }

        texts = [v["text"] for v in results_per_engine.values() if v["text"]]
        if texts:
            most_common, count = Counter(texts).most_common(1)[0]
            consensus = most_common
            engines_agree = (count >= 2) or (len(texts) == 1)
        else:
            consensus = None
            engines_agree = False

        comparison_record = {
            "region_id": region_id,
            "crop_bbox": list(crop_bbox),
            "tesseract": results_per_engine.get("tesseract", {}),
            "easyocr": results_per_engine.get("easyocr", {}),
            "paddleocr": results_per_engine.get("paddleocr", {}),
            "consensus": consensus,
            "engines_agree": engines_agree
        }
        ocr_comparison.append(comparison_record)

        best, best_conf2, best_engine = None, 0.0, None
        for eng_name, res in results_per_engine.items():
            if res["text"] and res["confidence"] > best_conf2:
                best = res["text"]
                best_conf2 = res["confidence"]
                best_engine = eng_name
        if consensus and engines_agree and len(texts) > 1:
            best_engine = "consensus"

        return {
            "text": best,
            "confidence": best_conf2,
            "engine": best_engine or "none",
            "crop_bbox": list(crop_bbox),
            "engines_agree": engines_agree,
            "region_id": region_id
        }

    # Run OCR on the full tile as one region
    full_bbox = (0, 0, w_img, h_img)
    result = run_engines_on_crop(img_bgr, full_bbox, "tile_full")
    result["source"] = "tile_full"
    result["pole_index"] = None
    ocr_results.append(result)

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return ocr_results, ocr_comparison, elapsed_ms


def _offset_candidates(
    pole_candidates: List[Dict],
    shape_candidates: List[Dict],
    ocr_results: List[Dict],
    offset_x: float,
    offset_y: float,
) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """Shift all detected coordinates by (offset_x, offset_y) to page-level coordinates."""
    import copy

    def shift_bbox(bbox):
        if not bbox:
            return bbox
        return [bbox[0] + offset_x, bbox[1] + offset_y,
                bbox[2] + offset_x, bbox[3] + offset_y]

    shifted_poles = []
    for p in pole_candidates:
        sp = copy.deepcopy(p)
        sp["center_x"] += offset_x
        sp["center_y"] += offset_y
        sp["bbox"] = shift_bbox(sp.get("bbox"))
        sp["tick_bboxes"] = [shift_bbox(tb) for tb in sp.get("tick_bboxes", [])]
        shifted_poles.append(sp)

    shifted_shapes = []
    for s in shape_candidates:
        ss = copy.deepcopy(s)
        ss["centroid_x"] += offset_x
        ss["centroid_y"] += offset_y
        ss["bbox"] = shift_bbox(ss.get("bbox"))
        shifted_shapes.append(ss)

    shifted_ocr = []
    for o in ocr_results:
        so = copy.deepcopy(o)
        so["crop_bbox"] = shift_bbox(so.get("crop_bbox"))
        shifted_ocr.append(so)

    return shifted_poles, shifted_shapes, shifted_ocr


def _dedup_candidates(candidates: List[Dict], dedup_radius_px: float = 30.0) -> List[Dict]:
    """
    Deduplicate candidates within dedup_radius_px of each other.
    For duplicates, keep the one with higher overall_confidence.
    Uses scipy cdist for efficiency when N > 100, else O(N^2).
    Returns deduplicated list.
    """
    if len(candidates) <= 1:
        return candidates

    # Extract pole centers (use first available position)
    positions = []
    for c in candidates:
        pc = c.get("pole_center")
        if pc:
            positions.append((pc[0], pc[1]))
        else:
            scb = c.get("sign_code_bbox")
            if scb:
                positions.append(((scb[0] + scb[2]) / 2, (scb[1] + scb[3]) / 2))
            else:
                positions.append((0.0, 0.0))

    import numpy as np
    pos_arr = np.array(positions, dtype=float)
    n = len(pos_arr)
    keep = [True] * n

    if n > 100:
        try:
            from scipy.spatial.distance import cdist
            dists = cdist(pos_arr, pos_arr)
            for i in range(n):
                if not keep[i]:
                    continue
                for j in range(i + 1, n):
                    if not keep[j]:
                        continue
                    if dists[i, j] <= dedup_radius_px:
                        # Keep higher confidence
                        ci = candidates[i].get("overall_confidence", 0)
                        cj = candidates[j].get("overall_confidence", 0)
                        if ci >= cj:
                            keep[j] = False
                        else:
                            keep[i] = False
                            break
        except ImportError:
            # Fall back to O(N^2)
            for i in range(n):
                if not keep[i]:
                    continue
                for j in range(i + 1, n):
                    if not keep[j]:
                        continue
                    dx = pos_arr[i, 0] - pos_arr[j, 0]
                    dy = pos_arr[i, 1] - pos_arr[j, 1]
                    if math.hypot(dx, dy) <= dedup_radius_px:
                        ci = candidates[i].get("overall_confidence", 0)
                        cj = candidates[j].get("overall_confidence", 0)
                        if ci >= cj:
                            keep[j] = False
                        else:
                            keep[i] = False
                            break
    else:
        for i in range(n):
            if not keep[i]:
                continue
            for j in range(i + 1, n):
                if not keep[j]:
                    continue
                dx = pos_arr[i, 0] - pos_arr[j, 0]
                dy = pos_arr[i, 1] - pos_arr[j, 1]
                if math.hypot(dx, dy) <= dedup_radius_px:
                    ci = candidates[i].get("overall_confidence", 0)
                    cj = candidates[j].get("overall_confidence", 0)
                    if ci >= cj:
                        keep[j] = False
                    else:
                        keep[i] = False
                        break

    return [c for c, k in zip(candidates, keep) if k]


def save_tile_debug_image(
    tile_img: Any,
    pole_candidates: List[Dict],
    ocr_results: List[Dict],
    shape_candidates: List[Dict],
    tile_dir: Path,
    row: int,
    col: int,
) -> None:
    """Save an annotated debug image for a single tile."""
    import cv2
    tile_dir.mkdir(parents=True, exist_ok=True)
    debug = tile_img.copy()

    # Poles = green dots
    for p in pole_candidates:
        cx, cy = int(p["center_x"]), int(p["center_y"])
        r = max(3, int(p.get("radius_px", 5)))
        cv2.circle(debug, (cx, cy), r, (0, 255, 0), 2)

    # Tick lines = yellow
    for p in pole_candidates:
        for tb in p.get("tick_bboxes", []):
            if tb:
                cv2.line(debug, (int(tb[0]), int(tb[1])), (int(tb[2]), int(tb[3])), (0, 255, 255), 1)

    # OCR boxes = blue
    for o in ocr_results:
        if o.get("text"):
            bb = o.get("crop_bbox")
            if bb:
                cv2.rectangle(debug, (int(bb[0]), int(bb[1])), (int(bb[2]), int(bb[3])), (255, 0, 0), 1)
                cv2.putText(debug, str(o["text"]), (int(bb[0]) + 2, int(bb[1]) + 14),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 0, 0), 1)

    # Shapes = red
    for s in shape_candidates:
        bb = s.get("bbox")
        if bb:
            cv2.rectangle(debug, (int(bb[0]), int(bb[1])), (int(bb[2]), int(bb[3])), (0, 0, 255), 1)

    save_path = tile_dir / f"tile_{row:02d}_{col:02d}.png"
    cv2.imwrite(str(save_path), debug)


def run_tile_mode(
    pdf_path: Path,
    page_idx: int,
    run_dir: Path,
    ocr_choice: str,
    tile_grid_str: str,
    tile_overlap: float,
    tile_dpi: int,
    max_tiles: Optional[int],
) -> int:
    """
    Main entry point for tile mode. Processes the PDF page in an NxM grid of overlapping tiles,
    detects poles/ticks/OCR/shapes in each tile, merges results, and writes outputs.
    Returns exit code (0 = success).
    """
    import fitz
    import json

    t_total_start = time.perf_counter()

    log(f"\n============================================================")
    log(f"Engine B — Tile Mode (v0.2)")
    log(f"============================================================")
    log(f"PDF       : {pdf_path.name}")
    log(f"Page      : {page_idx}")
    log(f"Tile grid : {tile_grid_str}")
    log(f"Tile DPI  : {tile_dpi}")
    log(f"Overlap   : {tile_overlap*100:.0f}%")
    if max_tiles:
        log(f"Max tiles : {max_tiles} (test mode)")
    log(f"")

    n_rows, n_cols = _parse_tile_grid(tile_grid_str)

    # --- Step 1: Page geometry ---
    log("Step 1: Reading page geometry ...")
    doc = fitz.open(str(pdf_path))
    if page_idx >= len(doc):
        log(f"  ERROR: PDF has {len(doc)} pages; index {page_idx} out of range.")
        doc.close()
        return 1
    page = doc[page_idx]
    page_rect = page.rect   # in PDF points
    doc.close()

    page_w_pt = page_rect.width
    page_h_pt = page_rect.height
    log(f"  Page size: {page_w_pt:.1f} x {page_h_pt:.1f} pt "
        f"({page_w_pt/72*25.4:.0f} x {page_h_pt/72*25.4:.0f} mm)")

    # Tile size in points (base, without overlap)
    tile_w_pt_base = page_w_pt / n_cols
    tile_h_pt_base = page_h_pt / n_rows

    # --- Step 2: Tile grid calculation ---
    # Each tile: base size + overlap on each edge (clipped to page)
    ovlp_w = tile_w_pt_base * tile_overlap
    ovlp_h = tile_h_pt_base * tile_overlap

    # Page pixel size at tile_dpi (for coordinate transforms)
    page_w_px = page_w_pt * tile_dpi / 72
    page_h_px = page_h_pt * tile_dpi / 72

    # --- Step 3: OCR engine init ---
    log("Step 2: Initializing OCR engines ...")
    available_engines = _check_ocr_availability(ocr_choice)
    for eng, avail in available_engines.items():
        log(f"  {eng}: {'available' if avail else 'not available'}", indent=1)
    ocr_engines = _init_ocr_engines(available_engines)

    # --- Step 3: Per-tile processing ---
    output_dir = run_dir / "outputs"
    debug_dir = output_dir / "image_scan_debug"
    tile_debug_dir = debug_dir / "tiles"
    tile_debug_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    run_slug = run_dir.name

    per_tile_stats: List[Dict] = []
    all_poles: List[Dict] = []
    all_shapes: List[Dict] = []
    all_ocr: List[Dict] = []
    all_ocr_comparison: List[Dict] = []

    tiles_processed = 0
    total_tiles = n_rows * n_cols

    log(f"\nStep 3: Processing tiles ({n_rows}x{n_cols} = {total_tiles} tiles) ...")

    for row in range(n_rows):
        for col in range(n_cols):
            tile_idx = row * n_cols + col
            if max_tiles is not None and tiles_processed >= max_tiles:
                log(f"  [tile {tile_idx}] Reached --max-tiles={max_tiles}, stopping early.")
                break

            t_tile_start = time.perf_counter()

            # Tile rect in PDF points (with overlap, clipped to page)
            x0_pt = max(0.0, col * tile_w_pt_base - ovlp_w)
            y0_pt = max(0.0, row * tile_h_pt_base - ovlp_h)
            x1_pt = min(page_w_pt, (col + 1) * tile_w_pt_base + ovlp_w)
            y1_pt = min(page_h_pt, (row + 1) * tile_h_pt_base + ovlp_h)

            tile_rect = fitz.Rect(x0_pt, y0_pt, x1_pt, y1_pt)

            # The tile origin in page pixels (top-left of the tile's *base* region, no overlap offset)
            # We need to account for overlap: the tile image starts at x0_pt, y0_pt
            tile_origin_x_px = x0_pt * tile_dpi / 72  # page-level pixel coord of tile's left edge
            tile_origin_y_px = y0_pt * tile_dpi / 72  # page-level pixel coord of tile's top edge

            log(f"  [tile {row},{col}] rect=({x0_pt:.0f},{y0_pt:.0f},{x1_pt:.0f},{y1_pt:.0f})pt ...", indent=1)

            # Render tile
            try:
                tile_img, render_ms = render_tile(pdf_path, page_idx, tile_rect, tile_dpi)
            except Exception as e:
                log(f"    ERROR rendering tile {row},{col}: {e}", indent=2)
                tiles_processed += 1
                per_tile_stats.append({
                    "row": row, "col": col, "tile_idx": tile_idx,
                    "render_ms": 0, "poles": 0, "ocr_codes": 0, "shapes": 0,
                    "total_ms": 0, "error": str(e)
                })
                continue

            tile_h_px, tile_w_px = tile_img.shape[:2]
            log(f"    Tile size: {tile_w_px}x{tile_h_px}px, render={render_ms:.0f}ms", indent=2)

            # Pole detection
            try:
                tile_poles, pole_ms = detect_poles_tile(tile_img, tile_dpi)
            except Exception as e:
                log(f"    ERROR in pole detection: {e}", indent=2)
                tile_poles, pole_ms = [], 0.0

            # Shape detection
            try:
                tile_shapes, shape_ms = detect_shapes_tile(tile_img, tile_dpi)
            except Exception as e:
                log(f"    ERROR in shape detection: {e}", indent=2)
                tile_shapes, shape_ms = [], 0.0

            # OCR on tile
            try:
                tile_ocr_results, tile_ocr_cmp, ocr_ms = _ocr_tile(tile_img, ocr_engines, tile_dpi)
            except Exception as e:
                log(f"    ERROR in OCR: {e}", indent=2)
                tile_ocr_results, tile_ocr_cmp, ocr_ms = [], [], 0.0

            ocr_codes_found = sum(1 for o in tile_ocr_results if o.get("text"))

            log(f"    poles={len(tile_poles)}, shapes={len(tile_shapes)}, "
                f"ocr_codes={ocr_codes_found}, "
                f"pole_ms={pole_ms:.0f}, shape_ms={shape_ms:.0f}, ocr_ms={ocr_ms:.0f}",
                indent=2)

            # Save tile debug image (using tile-local coords)
            try:
                save_tile_debug_image(
                    tile_img, tile_poles, tile_ocr_results, tile_shapes,
                    tile_debug_dir, row, col
                )
            except Exception as e:
                log(f"    WARNING: Could not save tile debug image: {e}", indent=2)

            # Shift coordinates to page level
            shifted_poles, shifted_shapes, shifted_ocr = _offset_candidates(
                tile_poles, tile_shapes, tile_ocr_results,
                tile_origin_x_px, tile_origin_y_px
            )

            # Tag each shifted element with tile_id
            tile_id = f"tile_{row:02d}_{col:02d}"
            for p in shifted_poles:
                p["tile_id"] = tile_id
            for s in shifted_shapes:
                s["tile_id"] = tile_id
            for o in shifted_ocr:
                o["tile_id"] = tile_id
            for c in tile_ocr_cmp:
                c["tile_id"] = tile_id

            all_poles.extend(shifted_poles)
            all_shapes.extend(shifted_shapes)
            all_ocr.extend(shifted_ocr)
            all_ocr_comparison.extend(tile_ocr_cmp)

            tile_total_ms = (time.perf_counter() - t_tile_start) * 1000
            per_tile_stats.append({
                "row": row, "col": col, "tile_idx": tile_idx,
                "tile_id": tile_id,
                "render_ms": round(render_ms, 0),
                "poles": len(tile_poles),
                "ocr_codes": ocr_codes_found,
                "shapes": len(tile_shapes),
                "total_ms": round(tile_total_ms, 0),
                "error": None,
            })
            tiles_processed += 1

        else:
            continue
        break  # also break outer loop when max_tiles hit

    log(f"\n  Processed {tiles_processed} tiles.")
    log(f"  Raw candidates before dedup: poles={len(all_poles)}, shapes={len(all_shapes)}, ocr={len(all_ocr)}")

    # --- Step 4: Spatial association across all tiles ---
    log(f"\nStep 4: Running spatial association ...")
    try:
        raw_candidates, assoc_ms = spatial_association(
            all_poles, all_ocr, all_shapes, tile_dpi, run_slug
        )
    except Exception as e:
        log(f"  ERROR in spatial association: {e}")
        traceback.print_exc()
        raw_candidates, assoc_ms = [], 0.0

    raw_count = len(raw_candidates)
    log(f"  Raw candidates: {raw_count}")

    # Add tile_id from pole if available (for traceability)
    pole_tile_map = {(round(p["center_x"], 1), round(p["center_y"], 1)): p.get("tile_id") for p in all_poles}
    for c in raw_candidates:
        pc = c.get("pole_center")
        if pc:
            key = (round(pc[0], 1), round(pc[1], 1))
            c["tile_id"] = pole_tile_map.get(key, "unknown")
        else:
            c["tile_id"] = "unknown"

    # --- Step 5: Deduplication ---
    log(f"\nStep 5: Deduplicating candidates (30px radius) ...")
    merged_candidates = _dedup_candidates(raw_candidates, dedup_radius_px=30.0)
    merged_count = len(merged_candidates)
    log(f"  After dedup: {merged_count} candidates (removed {raw_count - merged_count} duplicates)")

    total_elapsed_s = time.perf_counter() - t_total_start

    # --- Step 6: Write outputs ---
    log(f"\nStep 6: Writing outputs ...")
    _write_tile_outputs(
        run_dir=run_dir,
        candidates=merged_candidates,
        raw_count=raw_count,
        ocr_comparison=all_ocr_comparison,
        per_tile_stats=per_tile_stats,
        tiles_processed=tiles_processed,
        total_tiles=total_tiles,
        tile_grid_str=tile_grid_str,
        tile_dpi=tile_dpi,
        tile_overlap=tile_overlap,
        available_engines=available_engines,
        ocr_choice=ocr_choice,
        total_elapsed_s=total_elapsed_s,
        page_idx=page_idx,
        page_w_px=page_w_px,
        page_h_px=page_h_px,
    )

    # Summary
    needs_review = sum(1 for c in merged_candidates if c.get("requires_review"))
    with_code = sum(1 for c in merged_candidates if c.get("sign_code_text"))
    high_conf = sum(1 for c in merged_candidates if c.get("overall_confidence", 0) >= 70)
    fp_reduction = (2224 - merged_count) / 2224 * 100 if merged_count <= 2224 else 0.0

    log(f"\n============================================================")
    log(f"DONE — Engine B Tile Mode")
    log(f"============================================================")
    log(f"  Grid: {tile_grid_str}, DPI: {tile_dpi}")
    log(f"  Tiles processed: {tiles_processed}/{total_tiles}")
    log(f"  Raw candidates (before dedup): {raw_count}")
    log(f"  Merged candidates (after dedup): {merged_count}")
    log(f"  False positive reduction vs full-page (2224): {fp_reduction:.1f}%")
    log(f"  With sign code: {with_code}")
    log(f"  High confidence (>=70): {high_conf}")
    log(f"  Requires review: {needs_review}")
    log(f"  Total elapsed: {total_elapsed_s:.1f}s")
    log(f"")
    log(f"  Output files:")
    log(f"    outputs/image_scan_tile_candidates.json")
    log(f"    outputs/image_scan_tile_report.md")
    log(f"    outputs/image_scan_tile_report.html")
    log(f"    outputs/image_scan_debug/tiles/  ({tiles_processed} tile images)")
    log(f"")
    return 0


def _write_tile_outputs(
    run_dir: Path,
    candidates: List[Dict],
    raw_count: int,
    ocr_comparison: List[Dict],
    per_tile_stats: List[Dict],
    tiles_processed: int,
    total_tiles: int,
    tile_grid_str: str,
    tile_dpi: int,
    tile_overlap: float,
    available_engines: Dict[str, bool],
    ocr_choice: str,
    total_elapsed_s: float,
    page_idx: int,
    page_w_px: float,
    page_h_px: float,
) -> None:
    """Write tile-mode output files."""
    import json
    import base64

    output_dir = run_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)

    merged_count = len(candidates)
    fp_reduction = (2224 - merged_count) / 2224 * 100 if merged_count <= 2224 else 0.0
    needs_review = sum(1 for c in candidates if c.get("requires_review"))
    with_code = sum(1 for c in candidates if c.get("sign_code_text"))
    high_conf = sum(1 for c in candidates if c.get("overall_confidence", 0) >= 70)

    # --- Candidates JSON ---
    cands_path = output_dir / "image_scan_tile_candidates.json"
    clean_cands = [_json_safe({k: v for k, v in c.items() if not k.startswith("_")}) for c in candidates]
    with open(cands_path, "w", encoding="utf-8") as f:
        json.dump(clean_cands, f, indent=2, ensure_ascii=False)

    # --- OCR comparison JSON ---
    ocr_cmp_path = output_dir / "image_scan_tile_ocr_comparison.json"
    with open(ocr_cmp_path, "w", encoding="utf-8") as f:
        json.dump(_json_safe(ocr_comparison), f, indent=2, ensure_ascii=False)

    # --- Timing table: avg per-tile ---
    tile_timings = [s for s in per_tile_stats if not s.get("error")]
    avg_render = sum(s["render_ms"] for s in tile_timings) / len(tile_timings) if tile_timings else 0
    avg_total = sum(s["total_ms"] for s in tile_timings) / len(tile_timings) if tile_timings else 0
    avg_poles = sum(s["poles"] for s in tile_timings) / len(tile_timings) if tile_timings else 0
    avg_ocr_codes = sum(s["ocr_codes"] for s in tile_timings) / len(tile_timings) if tile_timings else 0
    avg_shapes = sum(s["shapes"] for s in tile_timings) / len(tile_timings) if tile_timings else 0

    # OCR engine summary
    engines_list = [k for k, v in available_engines.items() if v]
    ocr_with_text = sum(1 for o in ocr_comparison if o.get("consensus"))
    engines_str = ", ".join(engines_list) if engines_list else "none"

    # Qualitative assessment
    if merged_count < 100:
        accuracy_note = "IMPROVED — tile mode yields far fewer candidates than full-page (2224), likely more accurate."
    elif merged_count < 500:
        accuracy_note = "MODERATE — tile mode reduces candidates vs full-page (2224) but still has significant candidates."
    else:
        accuracy_note = "NOT IMPROVED — candidate count still high; further tuning needed."

    if tiles_processed < total_tiles:
        speed_note = f"Only {tiles_processed}/{total_tiles} tiles processed (--max-tiles test). Full run would take ~{avg_total * total_tiles / 1000:.0f}s estimated."
    elif total_elapsed_s < 60:
        speed_note = f"Faster than full-page render+scan if full-page takes >60s; tile mode completed in {total_elapsed_s:.1f}s."
    else:
        speed_note = f"Tile mode is SLOWER than a quick full-page scan (total {total_elapsed_s:.1f}s). Use only when accuracy matters more than speed."

    # Recommendation
    if merged_count < 100 and high_conf > 5:
        recommendation = "Proceed to Deep/Validation mode with these tile candidates as seed coordinates."
    elif merged_count < 300:
        recommendation = "Fast Scan result is reasonable. Manual review of high-confidence candidates recommended."
    else:
        recommendation = "Too many candidates; further blob parameter tuning required before production use."

    # --- Markdown report ---
    md_path = output_dir / "image_scan_tile_report.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("# Tile-Based Image Scan Report — Engine B v0.2\n\n")
        f.write(f"**Run dir:** `{run_dir}`  \n")
        f.write(f"**Page:** {page_idx}  \n")
        f.write(f"**Grid:** {tile_grid_str}  \n")
        f.write(f"**Tile DPI:** {tile_dpi}  \n")
        f.write(f"**Overlap:** {tile_overlap*100:.0f}%  \n")
        f.write(f"**OCR engines requested:** {ocr_choice}  \n")
        f.write(f"**OCR engines available:** "
                f"tesseract={available_engines.get('tesseract')}, "
                f"easyocr={available_engines.get('easyocr')}, "
                f"paddleocr={available_engines.get('paddleocr')}  \n\n")

        f.write("## Summary\n\n")
        f.write("| Metric | Value |\n|---|---|\n")
        f.write(f"| Grid | {tile_grid_str} |\n")
        f.write(f"| Tile DPI | {tile_dpi} |\n")
        f.write(f"| Total tiles processed | {tiles_processed}/{total_tiles} |\n")
        f.write(f"| Raw candidates (before dedup) | {raw_count} |\n")
        f.write(f"| Merged candidates (after dedup) | {merged_count} |\n")
        f.write(f"| False positive estimate vs full-page (2224) | {fp_reduction:.1f}% |\n")
        f.write(f"| Candidates with sign code | {with_code} |\n")
        f.write(f"| High confidence (≥70) | {high_conf} |\n")
        f.write(f"| Requires review | {needs_review} |\n")
        f.write(f"| Total runtime | {total_elapsed_s:.1f}s |\n")
        f.write(f"| OCR engines used | {engines_str} |\n")
        f.write(f"| OCR codes found (all tiles) | {ocr_with_text} |\n\n")

        f.write("## Per-Tile Timing\n\n")
        f.write("| Tile | Render(ms) | Poles | OCR codes | Shapes | Total(ms) |\n")
        f.write("|---|---|---|---|---|---|\n")
        for s in per_tile_stats:
            err = f" ERROR: {s['error']}" if s.get("error") else ""
            f.write(f"| {s['row']},{s['col']} | {s['render_ms']:.0f} | {s['poles']} "
                    f"| {s['ocr_codes']} | {s['shapes']} | {s['total_ms']:.0f}{err} |\n")
        f.write(f"| **Avg** | **{avg_render:.0f}** | **{avg_poles:.1f}** "
                f"| **{avg_ocr_codes:.1f}** | **{avg_shapes:.1f}** | **{avg_total:.0f}** |\n\n")

        f.write("## Assessment\n\n")
        f.write(f"**Accuracy:** {accuracy_note}  \n\n")
        f.write(f"**Speed:** {speed_note}  \n\n")
        f.write(f"**Recommendation:** {recommendation}  \n\n")

        f.write("## Top Candidates\n\n")
        f.write("| Tile | Anchor | Code | Conf | Shape | Overall | Review |\n")
        f.write("|---|---|---|---|---|---|---|\n")
        top = sorted(candidates, key=lambda x: x.get("overall_confidence", 0), reverse=True)[:20]
        for c in top:
            rev = "YES" if c.get("requires_review") else "no"
            f.write(f"| {c.get('tile_id','?')} "
                    f"| {c.get('anchor_type','?')} "
                    f"| {c.get('sign_code_text','—')} "
                    f"| {c.get('sign_code_confidence',0):.2f} "
                    f"| {c.get('sign_shape_type','—')} "
                    f"| {c.get('overall_confidence',0)} "
                    f"| {rev} |\n")

    log(f"  Wrote {md_path.name}")

    # --- HTML report ---
    html_path = output_dir / "image_scan_tile_report.html"
    tile_debug_dir = output_dir / "image_scan_debug" / "tiles"

    # Build tile grid visualization data
    tile_cells_html = ""
    for s in per_tile_stats:
        tile_img_path = tile_debug_dir / f"tile_{s['row']:02d}_{s['col']:02d}.png"
        try:
            with open(tile_img_path, "rb") as fh:
                b64 = base64.b64encode(fh.read()).decode("ascii")
            img_src = f"data:image/png;base64,{b64}"
        except Exception:
            img_src = ""
        err_cls = ' style="border:2px solid red"' if s.get("error") else ""
        img_tag = f'<img src="{img_src}" style="width:180px;height:auto">' if img_src else '<span style="color:#888">[no image]</span>'
        tile_cells_html += (
            f'<div class="tile-cell"{err_cls}>'
            f'{img_tag}'
            f'<div class="tile-label">'
            f'[{s["row"]},{s["col"]}] poles={s["poles"]} ocr={s["ocr_codes"]} '
            f'shapes={s["shapes"]} {s["total_ms"]:.0f}ms'
            f'</div></div>\n'
        )

    top20 = sorted(candidates, key=lambda x: x.get("overall_confidence", 0), reverse=True)[:20]
    cands_html = ""
    for c in top20:
        conf = c.get("overall_confidence", 0)
        conf_cls = "high" if conf >= 70 else ("low" if conf < 40 else "")
        rev_cls = "review" if c.get("requires_review") else ""
        cands_html += (
            f'<div class="card">'
            f'<div class="label">'
            f'<b>{c.get("anchor_type","?")}</b> '
            f'tile: {c.get("tile_id","?")} '
            f'code: <b>{c.get("sign_code_text","—")}</b> ({c.get("sign_code_confidence",0):.2f})<br>'
            f'shape: {c.get("sign_shape_type","—")}<br>'
            f'conf: <span class="{conf_cls}">{conf}</span> '
            f'{"<span class=review>REVIEW</span>" if c.get("requires_review") else ""}'
            f'<br><small>{c.get("candidate_id","?")}</small>'
            f'</div></div>\n'
        )

    n_rows_grid, n_cols_grid = _parse_tile_grid(tile_grid_str)

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(textwrap.dedent(f"""\
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8">
            <title>Tile Scan Report — Engine B v0.2</title>
            <style>
              body {{ font-family: monospace; background: #111; color: #eee; padding: 20px; }}
              h1, h2 {{ color: #7cf; }}
              table {{ border-collapse: collapse; margin-bottom: 20px; }}
              th, td {{ border: 1px solid #444; padding: 6px 10px; text-align: left; }}
              th {{ background: #222; color: #7cf; }}
              .high {{ color: #4f4; }}
              .low {{ color: #f84; }}
              .review {{ color: #f44; font-weight: bold; }}
              .tile-grid {{ display: grid; grid-template-columns: repeat({n_cols_grid}, 200px); gap: 8px; margin-bottom: 24px; }}
              .tile-cell {{ background: #1a1a1a; border: 1px solid #333; padding: 4px; }}
              .tile-label {{ font-size: 10px; color: #aaa; margin-top: 4px; }}
              .grid {{ display: flex; flex-wrap: wrap; gap: 12px; }}
              .card {{ background: #1a1a1a; border: 1px solid #333; padding: 10px; width: 220px; }}
              .label {{ font-size: 11px; margin-top: 6px; color: #aaa; }}
            </style>
            </head>
            <body>
            <h1>Tile-Based Image Scan Report — Engine B v0.2</h1>
            <p><b>Run dir:</b> {run_dir}<br>
            <b>Page:</b> {page_idx} &nbsp; <b>Grid:</b> {tile_grid_str} &nbsp;
            <b>Tile DPI:</b> {tile_dpi} &nbsp; <b>Overlap:</b> {tile_overlap*100:.0f}%</p>

            <h2>Summary</h2>
            <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Tiles processed</td><td>{tiles_processed}/{total_tiles}</td></tr>
            <tr><td>Raw candidates (before dedup)</td><td>{raw_count}</td></tr>
            <tr><td>Merged candidates (after dedup)</td><td>{merged_count}</td></tr>
            <tr><td>False positive reduction vs full-page (2224)</td><td>{fp_reduction:.1f}%</td></tr>
            <tr><td>With sign code</td><td>{with_code}</td></tr>
            <tr><td>High confidence (≥70)</td><td class="high">{high_conf}</td></tr>
            <tr><td>Requires review</td><td class="review">{needs_review}</td></tr>
            <tr><td>Total runtime</td><td>{total_elapsed_s:.1f}s</td></tr>
            <tr><td>OCR engines used</td><td>{engines_str}</td></tr>
            <tr><td>OCR codes found</td><td>{ocr_with_text}</td></tr>
            </table>

            <h2>Per-Tile Timing</h2>
            <table>
            <tr><th>Tile</th><th>Render(ms)</th><th>Poles</th><th>OCR codes</th><th>Shapes</th><th>Total(ms)</th></tr>
        """))
        for s in per_tile_stats:
            err_note = f" <span style='color:red'>ERROR: {s['error']}</span>" if s.get("error") else ""
            f.write(f"<tr><td>{s['row']},{s['col']}</td><td>{s['render_ms']:.0f}</td>"
                    f"<td>{s['poles']}</td><td>{s['ocr_codes']}</td>"
                    f"<td>{s['shapes']}</td><td>{s['total_ms']:.0f}{err_note}</td></tr>\n")
        f.write(f"<tr><td><b>Avg</b></td><td><b>{avg_render:.0f}</b></td>"
                f"<td><b>{avg_poles:.1f}</b></td><td><b>{avg_ocr_codes:.1f}</b></td>"
                f"<td><b>{avg_shapes:.1f}</b></td><td><b>{avg_total:.0f}</b></td></tr>\n")
        f.write(textwrap.dedent(f"""\
            </table>

            <h2>Assessment</h2>
            <p><b>Accuracy:</b> {accuracy_note}</p>
            <p><b>Speed:</b> {speed_note}</p>
            <p><b>Recommendation:</b> {recommendation}</p>

            <h2>Tile Grid Visualization</h2>
            <div class="tile-grid">
            {tile_cells_html}
            </div>

            <h2>Top 20 Candidates</h2>
            <div class="grid">
            {cands_html}
            </div>
            </body>
            </html>
        """))

    log(f"  Wrote {html_path.name}")
    log(f"  Wrote {cands_path.name} ({merged_count} candidates)")


# --- Main ---

def main() -> int:
    args = parse_args()

    run_dir = Path(args.plan_run_dir).resolve()
    if not run_dir.exists():
        log(f"ERROR: Run directory not found: {run_dir}")
        return 1

    log(f"")
    log(f"============================================================")
    log(f"Engine B — Image-Based Plan Scanner POC")
    log(f"============================================================")
    log(f"Run dir : {run_dir}")
    log(f"Page    : {args.page}")
    log(f"Mode    : {args.mode}")
    if args.mode == "tile":
        log(f"Tile DPI: {args.tile_dpi}")
        log(f"Grid    : {args.tile_grid}")
        log(f"Overlap : {args.tile_overlap}")
        if args.max_tiles:
            log(f"MaxTiles: {args.max_tiles}")
    else:
        log(f"DPI     : {args.dpi}")
    log(f"OCR     : {args.ocr}")
    log(f"")

    # 2. Find source PDF
    log("Step 1: Finding source PDF ...")
    pdf_path = find_source_pdf(run_dir)
    if pdf_path is None:
        log(f"  ERROR: No PDF found in {run_dir}/source/, /uploads/, or /")
        log(f"  Check plan_manifest.json for source_storage_status — PDF may have been deleted.")
        manifest_path = run_dir / "plan_manifest.json"
        if manifest_path.exists():
            with open(manifest_path) as fh:
                manifest = json.load(fh)
            log(f"  plan_manifest.json:")
            log(f"    source_storage_status: {manifest.get('source_storage_status', 'unknown')}")
            log(f"    original_filename: {manifest.get('original_filename', 'unknown')}")
            log(f"    status: {manifest.get('status', 'unknown')}")
        return 1

    log(f"  Found PDF: {pdf_path}")
    log(f"  File size: {pdf_path.stat().st_size / 1024 / 1024:.2f} MB")

    # --- Tile mode dispatch ---
    if args.mode == "tile":
        return run_tile_mode(
            pdf_path=pdf_path,
            page_idx=args.page,
            run_dir=run_dir,
            ocr_choice=args.ocr,
            tile_grid_str=args.tile_grid,
            tile_overlap=args.tile_overlap,
            tile_dpi=args.tile_dpi,
            max_tiles=args.max_tiles,
        )

    output_dir = run_dir / "outputs"
    debug_dir = output_dir / "image_scan_debug"
    run_slug = run_dir.name

    timing: Dict[str, float] = {}

    # 3. Render page
    log(f"\nStep 2: Rendering PDF page {args.page} at {args.dpi} DPI ...")
    try:
        img_bgr, png_path, render_ms, effective_dpi = render_page(pdf_path, args.page, args.dpi, debug_dir)
    except Exception as e:
        log(f"  ERROR during rendering: {e}")
        traceback.print_exc()
        return 1
    timing["render"] = render_ms
    if effective_dpi != args.dpi:
        log(f"  NOTE: Using effective_dpi={effective_dpi} for all downstream processing (requested {args.dpi})")

    # 4. Pole/tick detection
    log(f"\nStep 3: Detecting poles and ticks ...")
    try:
        pole_candidates, pole_ms = detect_poles_and_ticks(img_bgr, effective_dpi)
    except Exception as e:
        log(f"  ERROR during pole detection: {e}")
        traceback.print_exc()
        pole_candidates, pole_ms = [], 0.0
    timing["pole_detection"] = pole_ms

    if len(pole_candidates) == 0:
        log("  WARNING: 0 pole candidates found. This may indicate:")
        log("    - Low contrast plan (try higher DPI or preprocessing)")
        log("    - Plan uses tick/pole style not matching expected blob parameters")
        log("    - Text-first and shape-first fallbacks will still run")

    # 5. Check OCR availability
    log(f"\nStep 4: Checking OCR engine availability ...")
    available_engines = _check_ocr_availability(args.ocr)
    for eng, avail in available_engines.items():
        log(f"  {eng}: {'available' if avail else 'not available'}", indent=1)
    if not any(available_engines.values()):
        log("  WARNING: No OCR engines available. Candidates will have no sign codes.")

    # 6. OCR pass
    log(f"\nStep 5: Running OCR pass ...")
    try:
        ocr_results, ocr_comparison, ocr_ms = run_ocr_pass(
            img_bgr, pole_candidates, effective_dpi, args.ocr, args.mode, available_engines, run_slug,
            pdf_path=pdf_path, page_idx=args.page,
        )
    except Exception as e:
        log(f"  ERROR during OCR: {e}")
        traceback.print_exc()
        ocr_results, ocr_comparison, ocr_ms = [], [], 0.0
    timing["ocr_pass"] = ocr_ms

    # 7. Sign shape detection
    log(f"\nStep 6: Detecting sign shapes ...")
    try:
        shape_candidates, shape_ms = detect_sign_shapes(img_bgr, effective_dpi)
    except Exception as e:
        log(f"  ERROR during shape detection: {e}")
        traceback.print_exc()
        shape_candidates, shape_ms = [], 0.0
    timing["shape_detection"] = shape_ms

    # 8. Spatial association
    log(f"\nStep 7: Running spatial association ...")
    try:
        candidates, assoc_ms = spatial_association(
            pole_candidates, ocr_results, shape_candidates, effective_dpi, run_slug
        )
    except Exception as e:
        log(f"  ERROR during spatial association: {e}")
        traceback.print_exc()
        candidates, assoc_ms = [], 0.0
    timing["spatial_association"] = assoc_ms

    # 9. Evidence crops
    log(f"\nStep 8: Saving evidence crops ...")
    try:
        crops_saved, crops_ms = save_evidence_crops(img_bgr, candidates, output_dir, run_dir)
    except Exception as e:
        log(f"  ERROR during evidence crops: {e}")
        traceback.print_exc()
        crops_saved, crops_ms = 0, 0.0
    timing["evidence_crops"] = crops_ms

    # 10. Write outputs
    log(f"\nStep 9: Writing output files ...")
    try:
        write_outputs(
            run_dir=run_dir,
            candidates=candidates,
            ocr_comparison=ocr_comparison,
            page_idx=args.page,
            dpi=effective_dpi,
            mode=args.mode,
            ocr_choice=args.ocr,
            available_engines=available_engines,
            timing=timing,
            png_path=png_path,
        )
    except Exception as e:
        log(f"  ERROR writing outputs: {e}")
        traceback.print_exc()

    # Final summary
    total_ms = sum(timing.values())
    needs_review = sum(1 for c in candidates if c.get("requires_review"))
    with_code = sum(1 for c in candidates if c.get("sign_code_text"))
    high_conf = sum(1 for c in candidates if c.get("overall_confidence", 0) >= 70)

    log(f"\n============================================================")
    log(f"DONE — Engine B POC complete")
    log(f"============================================================")
    log(f"  PDF rendered      : {pdf_path.name} @ {args.dpi} DPI")
    log(f"  Poles detected    : {len(pole_candidates)}")
    log(f"  OCR regions       : {len(ocr_results)}")
    log(f"  Shapes detected   : {len(shape_candidates)}")
    log(f"  Total candidates  : {len(candidates)}")
    log(f"  With sign code    : {with_code}")
    log(f"  High confidence   : {high_conf}")
    log(f"  Requires review   : {needs_review}")
    log(f"  Evidence crops    : {crops_saved}")
    log(f"  Total elapsed     : {total_ms:.0f}ms ({total_ms/1000:.1f}s)")
    log(f"")
    log(f"  Output files:")
    log(f"    outputs/image_scan_candidates.json")
    log(f"    outputs/image_scan_report.md")
    log(f"    outputs/image_scan_report.html")
    log(f"    outputs/image_scan_ocr_comparison.json")
    log(f"    outputs/image_scan_ocr_comparison.md")
    log(f"    outputs/image_scan_debug/page_{args.page}_{args.dpi}dpi.png")
    log(f"    outputs/image_scan_debug/evidence_crop_*.png  ({crops_saved} files)")
    log(f"")
    return 0


if __name__ == "__main__":
    sys.exit(main())
