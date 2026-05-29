"""
Elkayam OCR sidecar — a small, single-purpose HTTP service that runs the heavy
OCR engines that cannot live inside a Vercel Function.

Engines (provider-style, never locked to one):
  • tesseract  — native Tesseract `heb+eng` (the stable Hebrew/English baseline).
  • paddle     — PaddleOCR, OPTIONAL and isolated. Loaded lazily; if it is not
                 installed or fails, the request transparently falls back to
                 tesseract and says so. PaddleOCR never breaks the OCR flow.

JARVIS (the Next.js app on Vercel) calls POST /ocr through `httpOcrProvider`
behind `ocrAdapter`. This service only extracts text + confidence; all field
parsing, classification and persistence stay in JARVIS.

Auth: a shared bearer secret (OCR_SERVICE_TOKEN). If unset the service refuses
to start handling auth'd routes in production-like mode (still serves /health).
"""

from __future__ import annotations

import io
import os
import logging
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, Header, HTTPException
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ocr-service")

app = FastAPI(title="Elkayam OCR sidecar", version="1.0.0")

OCR_SERVICE_TOKEN = os.environ.get("OCR_SERVICE_TOKEN", "")
PADDLE_ENABLED = os.environ.get("PADDLE_ENABLED", "false").lower() in ("1", "true", "yes")
# Below this many non-whitespace chars from a PDF text layer we treat the PDF as
# scanned and rasterize + OCR it (mirrors the JS pdfExtractor threshold).
MIN_DIGITAL_CHARS = 40
MAX_OCR_PAGES = 5
RENDER_DPI = 200

_paddle_singleton = None  # lazily created PaddleOCR instance (heavy)


# ── Auth ──────────────────────────────────────────────────────────────────────

def _check_auth(authorization: Optional[str]) -> None:
    # If no token configured, the service is "open" only for local dev. We log a
    # loud warning so this is never silently shipped to production.
    if not OCR_SERVICE_TOKEN:
        log.warning("OCR_SERVICE_TOKEN not set — auth is DISABLED (dev only).")
        return
    provided = (authorization or "").removeprefix("Bearer ").strip()
    if provided != OCR_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")


# ── Tesseract (baseline) ────────────────────────────────────────────────────────

def _ocr_image_tesseract(img, lang: str) -> dict:
    import pytesseract
    from pytesseract import Output

    data = pytesseract.image_to_data(img, lang=lang, config="--psm 3", output_type=Output.DICT)
    words, confs, low = [], [], []
    n = len(data["text"])
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        words.append(txt)
        try:
            c = float(data["conf"][i])
        except (TypeError, ValueError):
            c = -1.0
        if c >= 0:
            confs.append(c)
            if c < 55 and len(txt) >= 2 and any(ch.isalpha() for ch in txt):
                low.append(txt)
    text = pytesseract.image_to_string(img, lang=lang, config="--psm 3")
    page_conf = (sum(confs) / len(confs) / 100.0) if confs else 0.0
    low_terms = list(dict.fromkeys(low))[:40]
    return {"text": text, "pageConfidence": round(page_conf, 4), "lowConfidenceTerms": low_terms}


# ── PaddleOCR (optional, isolated) ───────────────────────────────────────────────

def _get_paddle():
    global _paddle_singleton
    if _paddle_singleton is None:
        from paddleocr import PaddleOCR  # heavy import — only when actually used
        # Latin model covers en; Hebrew has no official model, so Paddle is used for
        # detection / non-Hebrew. Hebrew recognition should stay on tesseract.
        _paddle_singleton = PaddleOCR(use_angle_cls=True, lang="latin", show_log=False)
    return _paddle_singleton


def _ocr_image_paddle(img) -> dict:
    import numpy as np

    arr = np.array(img.convert("RGB"))
    result = _get_paddle().ocr(arr, cls=True)
    lines, confs = [], []
    for block in result or []:
        for _box, (txt, conf) in block or []:
            if txt:
                lines.append(txt)
                confs.append(float(conf))
    text = "\n".join(lines)
    page_conf = (sum(confs) / len(confs)) if confs else 0.0
    low = [t for t, c in zip(lines, confs) if c < 0.55]
    return {"text": text, "pageConfidence": round(page_conf, 4), "lowConfidenceTerms": low[:40]}


# ── Input handling: images and PDFs ──────────────────────────────────────────────

def _load_images(content: bytes, content_type: str, filename: str):
    """Return (list_of_PIL_images, scanned_bool, digital_text_or_None)."""
    from PIL import Image

    is_pdf = content_type == "application/pdf" or filename.lower().endswith(".pdf")
    if not is_pdf:
        img = Image.open(io.BytesIO(content))
        return [img], False, None

    # 1) Try the embedded text layer (digital PDF) — fast, lossless, no OCR.
    digital_text = ""
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(content)) as pdf:
            digital_text = "\n".join((p.extract_text() or "") for p in pdf.pages)
    except Exception as e:  # noqa: BLE001
        log.info("pdfplumber text extraction failed: %s", e)

    if len(digital_text.replace(" ", "").replace("\n", "")) >= MIN_DIGITAL_CHARS:
        return [], False, digital_text

    # 2) Scanned PDF → rasterize pages (needs poppler) and OCR them.
    from pdf2image import convert_from_bytes

    images = convert_from_bytes(content, dpi=RENDER_DPI, first_page=1, last_page=MAX_OCR_PAGES)
    return images, True, None


def _preprocess(img):
    """Light, OCR-friendly normalization for phone photos / faded scans."""
    from PIL import ImageOps

    g = ImageOps.exif_transpose(img).convert("L")
    g = ImageOps.autocontrast(g)
    w, h = g.size
    if w and w < 1500:  # upscale small captures
        g = g.resize((1500, int(h * 1500 / w)))
    return g


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "ok": True,
        "engines": {"tesseract": True, "paddle": PADDLE_ENABLED},
        "authRequired": bool(OCR_SERVICE_TOKEN),
    }


@app.post("/ocr")
async def ocr(
    file: UploadFile = File(...),
    lang: str = Form("heb+eng"),
    engine: str = Form("auto"),
    authorization: Optional[str] = Header(default=None),
):
    _check_auth(authorization)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty file")

    try:
        images, scanned, digital_text = _load_images(content, file.content_type or "", file.filename or "")
    except Exception as e:  # noqa: BLE001
        log.exception("input load failed")
        raise HTTPException(status_code=422, detail=f"could not read document: {e}")

    # Digital PDF text layer — no OCR needed.
    if digital_text is not None:
        return JSONResponse({
            "text": digital_text,
            "pageConfidence": 0.95,
            "lowConfidenceTerms": [],
            "scanned": False,
            "engine": "pdf-text (embedded)",
        })

    # Choose engine. "auto" → tesseract baseline. "paddle" → paddle if available,
    # else transparent fallback to tesseract (Paddle never breaks the flow).
    use_paddle = engine == "paddle" and PADDLE_ENABLED
    used_engine = "tesseract heb+eng"
    fallback_note = None

    texts, confs, low_all = [], [], []
    for img in images:
        proc = _preprocess(img)
        if use_paddle:
            try:
                r = _ocr_image_paddle(proc)
                used_engine = "paddleocr (latin) + tesseract fallback available"
            except Exception as e:  # noqa: BLE001
                log.warning("paddle failed, falling back to tesseract: %s", e)
                fallback_note = "paddle_unavailable"
                use_paddle = False
                r = _ocr_image_tesseract(proc, lang)
                used_engine = "tesseract heb+eng (paddle fallback)"
        else:
            r = _ocr_image_tesseract(proc, lang)
        if r["text"].strip():
            texts.append(r["text"])
            confs.append(r["pageConfidence"])
            low_all.extend(r["lowConfidenceTerms"])

    page_conf = (sum(confs) / len(confs)) if confs else 0.0
    payload = {
        "text": "\n\n".join(texts),
        "pageConfidence": round(page_conf, 4),
        "lowConfidenceTerms": list(dict.fromkeys(low_all))[:40],
        "scanned": scanned,
        "engine": used_engine,
    }
    if fallback_note:
        payload["note"] = fallback_note
    return JSONResponse(payload)
