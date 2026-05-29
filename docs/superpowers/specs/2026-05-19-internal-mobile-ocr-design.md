# Internal Mobile OCR — Supplier Document Intake
**Date:** 2026-05-19
**Status:** ⚠️ SUPERSEDED (historical). Describes the original tesseract.js-only
design. Current OCR is a pluggable provider chain (httpOcrProvider → crash-safe
tesseract.js → raw-text) with a native-Tesseract/PaddleOCR sidecar. For current
behavior see **`docs/SYSTEM_STATE.md`** and **`ocr-service/README.md`**.
**Connects to:** Supplier Document Intake Engine (Phase 5.0, commit 28ece2c)

---

## 1. Goal

Build an internal, local OCR pipeline for supplier documents. No paid external APIs. No third-party document services. All processing server-side.

**Primary use case:** User holds or receives a supplier invoice / delivery note / goods receipt → takes a photo with a phone → uploads the photo → system preprocesses the image → tesseract.js extracts text → parser extracts structured fields → existing DocumentReview screen opens pre-filled → user corrects manually if needed → user approves/posts using the existing unchanged posting workflow.

**Secondary use cases:** PDF file upload (digital text extraction), regular image file upload from desktop or gallery.

---

## 2. What This Connects To (Unchanged)

- `/supplier-documents` list page — unchanged
- `UploadOrManualModal` — gains camera button and processing state
- `DocumentReview` — gains extraction warning banner and raw text panel; pre-fill is automatic from DB
- `/api/supplier-documents/upload` — gains OCR pipeline call after file storage
- `supplier_documents` DB table — existing `raw_text`, `parsed_json`, `extraction_confidence`, `extraction_notes` fields used; no new migration
- `ocrAdapter.ts` — gains `tesseractProvider`, replaces `manualProvider` when OCR is available
- Manual intake, manual entry, posting, expenses, inventory — all unchanged

---

## 3. OCR Engine Decision

**Choice: tesseract.js WASM (Approach A)**

Rationale:
- Pure JavaScript/WebAssembly — no native binary dependencies
- Works identically on: local macOS dev, self-hosted Linux server, Vercel serverless
- Hebrew + English support via downloadable language model files (`heb.traineddata`, `eng.traineddata`)
- Apache-2.0 license, 34k GitHub stars, actively maintained
- Avoids the local/production gap that system Tesseract CLI creates

Rejected alternatives:
- **System Tesseract CLI**: Better quality but does not work on Vercel. Creates a deployment gap for a financial document system.
- **PaddleOCR / EasyOCR / OCRmyPDF**: Python/GPU dependencies. Too heavy for a Node.js server route MVP.
- **OpenAI / Google Vision / Azure**: Paid external APIs. Documents sent to third parties. Against requirements.

---

## 4. Dependencies

| Package | Version | License | Role |
|---|---|---|---|
| `tesseract.js` | ^7.0.0 | Apache-2.0 | WASM OCR engine (Hebrew + English) |
| `pdf-parse` | ^2.4.5 | Apache-2.0 | Digital PDF text extraction |
| `heic-convert` | ^2.1.0 | ISC | iPhone HEIC/HEIF photo conversion |
| `sharp` | ^0.34.5 (existing) | Apache-2.0 | Image preprocessing pipeline |

**Install:**
```bash
npm install tesseract.js pdf-parse heic-convert
npm install --save-dev @types/pdf-parse
```

No system-level binaries required. Language data files (~12MB each for `heb` and `eng`) are downloaded by `tesseract.js` at runtime on first use and cached in the Node.js process.

---

## 5. Supported Input Types

| Type | MIME | Handling |
|---|---|---|
| JPEG | `image/jpeg`, `image/jpg` | Sharp preprocessing → Tesseract OCR |
| PNG | `image/png` | Sharp preprocessing → Tesseract OCR |
| WebP | `image/webp` | Sharp preprocessing → Tesseract OCR |
| HEIC/HEIF | `image/heic`, `image/heif` | heic-convert → JPEG → Sharp → Tesseract |
| TIFF | `image/tiff` | Sharp preprocessing → Tesseract OCR |
| PDF (digital) | `application/pdf` | pdf-parse text extraction → Parser |
| PDF (scanned) | `application/pdf` | pdf-parse returns empty → warning + manual fallback |
| Camera capture | (any of the image types above) | Same pipeline as image upload |

HEIC is added to `ALLOWED_TYPES` in the upload route.

---

## 6. Architecture

### 6.1 File Structure Changes

**New files:**
```
src/lib/supplierDocuments/imagePreprocessor.ts   — sharp + heic-convert pipeline
src/lib/supplierDocuments/pdfExtractor.ts        — pdf-parse digital text extraction
src/lib/supplierDocuments/parser.ts              — Hebrew/English field parser
```

**Modified files:**
```
src/lib/supplierDocuments/ocrAdapter.ts                           — add tesseractProvider
src/app/api/supplier-documents/upload/route.ts                    — call OCR pipeline after file storage
src/components/SupplierDocuments/UploadOrManualModal.tsx          — camera button + loading state
src/components/SupplierDocuments/DocumentReview.tsx               — warnings + raw text panel
```

### 6.2 Full Data Flow

```
User (mobile or desktop)
  → UploadOrManualModal (UI)
      [📷 צלם מסמך]  — <input accept="image/*" capture="environment">
      [📄 העלה קובץ] — <input accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.tiff">
      [✏️ הזנה ידנית] — no file, existing manual form
  
  → POST /api/supplier-documents/upload
      1. Auth check
      2. Read file buffer
      3. SHA-256 hash → duplicate check (unchanged)
      4. Validate MIME + size (HEIC added)
      5. Store original in private bucket (unchanged)
      6. Create DB record: status = "extracting"
      7. OCR pipeline:
           a. imagePreprocessor.ts  (image) or pdfExtractor.ts (PDF)
           b. ocrAdapter.ts         → tesseract.js heb+eng → rawText + confidence
           c. parser.ts             → structuredFields + lines + warnings
      8. PATCH DB record:
           status              → "draft_ready"
           raw_text            → OCR text
           parsed_json         → { meta, warnings, lines }
           extraction_confidence → 0–1
           extraction_notes    → "tesseract.js heb+eng" or error description
           supplier_name_raw   → extracted supplier name
           supplier_vat_raw    → extracted VAT number
           document_number     → extracted document number
           document_date       → extracted date
           subtotal_before_vat → extracted amount
           vat_amount          → extracted VAT
           total_after_vat     → extracted total
      9. Return { id, fileUrl }

  → UploadOrManualModal closes
  → DocumentReview opens (existing component, reads from DB)
      • Pre-fill is automatic — editedDocType etc. read from document record
      • Warning banner if extraction_confidence < 0.5
      • Raw text panel (expandable, hidden by default)
      • All fields fully editable
  
  → User reviews, corrects, approves
  → Existing posting flow (unchanged)
```

### 6.3 OCR Failure Handling

If any step in the OCR pipeline throws or times out:
- Document status is set to `"draft_ready"` (not left as `"extracting"`)
- `extraction_notes` records the error
- `extraction_confidence` = 0
- Partial results (if any) are saved
- Upload route still returns `{ id, fileUrl }` — no error surface to the user
- Review screen opens in fully-editable manual mode
- A warning banner explains: `"לא הצלחנו לזהות את המסמך — ניתן להזין ידנית"`

---

## 7. Image Preprocessing (`imagePreprocessor.ts`)

Input: raw file `Buffer` + MIME type string
Output: `{ buffer: Buffer, operations: string[], originalSize: number, processedSize: number }`

**Pipeline (in order):**

1. **HEIC conversion** (if `image/heic` or `image/heif`): `heic-convert` → JPEG buffer. If conversion fails: continue with original, add `heic_conversion_failed` warning.
2. **EXIF orientation** (`sharp().rotate()`): Auto-corrects phone photos taken at non-standard angles using EXIF metadata. Critical for mobile capture.
3. **Resize** (`sharp().resize(2480, null, { withoutEnlargement: true })`): Caps the longest edge at 2480px (≈A4 at 300 DPI). Downscales oversized phone photos. Never upscales.
4. **Grayscale** (`sharp().grayscale()`): Reduces to single intensity channel. Improves Tesseract accuracy, reduces processing memory.
5. **Normalize** (`sharp().normalize()`): Auto-stretches contrast. Handles dim, shadowed, or low-contrast phone photos.
6. **Sharpen** (`sharp().sharpen({ sigma: 1 })`): Mild unsharp mask. Helps thin Hebrew letterforms without introducing noise.
7. **Convert to PNG** (`sharp().png()`): Lossless output for OCR.

**Intentionally excluded:**
- Binarization/threshold: Tesseract's internal Otsu thresholding outperforms a fixed threshold on variable phone photos.
- Deskew: Requires native binary dependencies not available on Vercel. Tesseract handles mild skew natively.
- Perspective correction: Out of scope for MVP.

---

## 8. PDF Secondary Path (`pdfExtractor.ts`)

Input: PDF `Buffer`
Output: `{ text: string, pageCount: number, isEmpty: boolean }`

1. Run `pdf-parse(buffer)` → extract embedded text
2. If `text.trim().length > 50`: return text → pass to parser (no OCR needed)
3. If text is empty or very short: `isEmpty = true`, add `pdf_text_empty` warning → parser receives empty string → manual fallback

Scanned PDF support (PDF → image → OCR) is not in scope for MVP. The fallback is manual entry with an informative Hebrew message: `"מסמך PDF סרוק — ניתן להזין ידנית"`.

---

## 9. OCR Engine (`ocrAdapter.ts` — updated)

The `resolveProvider()` function is updated to return `tesseractProvider` when `tesseract.js` is available (always, since it's a bundled dependency).

```typescript
// In resolveProvider():
return tesseractProvider;   // replaces rawTextProvider as default
```

**`tesseractProvider` implementation:**

```
input.fileBuffer + input.fileType
  → imagePreprocessor.ts  (images)  or  pdfExtractor.ts  (PDF)
  → rawText

rawText → tesseract.js.recognize(processedBuffer, "heb+eng")
  → { data.text, data.confidence }

rawText + confidence → parser.ts
  → ExtractionResult { header, lines, rawText, warnings }
```

**tesseract.js configuration:**
- `logger`: disabled in production, enabled in development (for debugging)
- Language: `"heb+eng"` — Hebrew primary, English secondary
- Language data source: tesseract.js CDN (downloaded to process memory on first call)
- Timeout: 60 seconds. On timeout: save `tesseract_timeout` warning, return partial result.
- Worker: created per-request (stateless function context). No persistent worker pool in serverless.

**`isOcrAvailable()`** returns `true` (always — `tesseract.js` is bundled).
**`getOcrStatusMessage()`** returns `"OCR פנימי פעיל — tesseract.js heb+eng"`.

---

## 10. Parser (`parser.ts`)

Input: `rawText: string`
Output: `ParsedDocument { header: ExtractedHeader, lines: ExtractedLine[], warnings: string[] }`

### 10.1 Document Header

Regex-based extraction against the raw OCR text. All extractions are best-effort with field-level confidence.

**Document type:** Reuses `classifyDocumentType()` from existing `classification.ts`.

**Document number:** Pattern — `(מספר חשבונית|מספר תעודה|מס[׳']|מס\.)\s*:?\s*([A-Za-z0-9\-/]+)`.

**Document date:** ISO-style (`DD/MM/YYYY`, `DD.MM.YYYY`, `YYYY-MM-DD`) plus Hebrew month names. Normalized to `YYYY-MM-DD`.

**Supplier name:** Heuristic — first non-label, non-number line in the upper third of the document (first 30% of lines). If a line follows `לכבוד:` it is the customer name (skip). Confidence: 0.5 (always uncertain without context).

**Supplier VAT:** Pattern — `(ח\.?פ\.?|ע\.?מ\.?|עוסק מורשה)\s*:?\s*(\d[\d\-]+)`.

**Amounts — Israeli number normalization:**
- Swap commas/dots per locale: `1.234,56` → `1234.56`; `1,234.56` → `1234.56`
- Strip `₪`, `ש"ח`, `NIS`, `ILS`
- OCR character corrections before parsing: `O→0`, `l→1`, `I→1`, `B→8`

**VAT rate:** Pattern — `מע"מ\s*(\d+)\s*%` → `vatRate`. Default assumed 17 if not found.

**Total validation:** If `subtotal + vatAmount ≈ total` (within 1%), confidence raised. If mismatch, `total_mismatch` warning added.

### 10.2 Line Items (best-effort)

Scan lines for table-row patterns: at least two numbers (quantity + price or line total) with a description text. Each candidate line becomes an `ExtractedLine`. RTL text ordering is handled by scanning from right to left for numeric columns.

If fewer than 1 confident line item is found: `no_line_items_detected` or `line_items_uncertain` warning added. Header fields are still returned. Lines array is empty or contains low-confidence entries marked `requires_review`.

### 10.3 Confidence Scoring

| Condition | Confidence adjustment |
|---|---|
| Tesseract overall confidence < 60 | `low_ocr_confidence` warning; document confidence × 0.7 |
| Document type uncertain | `document_type_uncertain`; field confidence 0.3 |
| Supplier name not found | `supplier_uncertain`; field confidence 0 |
| Total/VAT mismatch | `total_mismatch` warning |
| No line items | `no_line_items_detected` warning |
| Preprocessing failed | `preprocessing_failed` warning; document confidence × 0.8 |

Overall `extraction_confidence` = weighted average of field confidences.

---

## 11. UI Changes

### 11.1 UploadOrManualModal

Mode selector replaces current upload/manual toggle with three clear options:

```
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│   📄 העלה קובץ       │  │   📷 צלם מסמך         │  │   ✏️ הזנה ידנית       │
│   PDF / תמונה        │  │   ממצלמת הטלפון       │  │   ללא קובץ           │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

- **"העלה קובץ"**: `<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.tiff">`
- **"צלם מסמך"**: `<input type="file" accept="image/*" capture="environment">` — opens phone camera on mobile; fallback to gallery picker on desktop
- **"הזנה ידנית"**: existing manual form, unchanged

Both file-input paths → same upload pipeline → same OCR pipeline.

**Processing state** (shown while upload + OCR runs):
```
[spinner]  מעבד מסמך...
           מזהה טקסט ומכין טיוטה לבדיקה
```
All buttons disabled during processing. No cancel button for MVP.

**On OCR failure:**
```
[warning icon]  לא הצלחנו לזהות את המסמך באופן מלא
                [פתח להזנה ידנית]   ← opens DocumentReview with partial data
```

### 11.2 DocumentReview

Two additions only. No existing logic changed.

**Extraction warning banner** (yellow, above the form, conditional):
Shown if `extractionNotes` contains a warning code or `extractionConfidence < 0.5`:
```
⚠️  חולץ אוטומטית — יש לאמת ולתקן את הנתונים לפני אישור
```

**Raw text panel** (collapsible, bottom of right column):
```
[▶ טקסט גולמי שזוהה על ידי OCR]  ← click to expand
  [raw_text content, monospace, RTL, scrollable, max 300px height]
```
Hidden by default. Label in Hebrew. Useful for manual verification when OCR partially misread.

---

## 12. Manual Fallback

Manual entry remains a first-class path at every step:

| Failure point | What happens |
|---|---|
| User clicks "הזנה ידנית" | No file upload, no OCR, blank form as today |
| OCR throws | Document created, review opens with blank/partial fields, warning shown |
| Tesseract times out | Partial result saved, review opens, user corrects |
| HEIC conversion fails | Original file used for OCR, warning added |
| Scanned PDF | `pdf_text_empty` warning, no OCR attempted, manual form |
| `tesseract.js` fails to load | Error caught, `available: false` result, manual mode |

Posting is never automatic. OCR only fills in form fields that the user must confirm before posting.

---

## 13. Security and Privacy

- All OCR processing is server-side within the Next.js API route.
- No document content is sent to any external service.
- `tesseract.js` downloads language model files from its CDN (github releases / CDN) — only binary language data, not document content.
- Original files stored in private Supabase Storage bucket (unchanged).
- Service role key used for all storage and DB operations (unchanged).
- Raw OCR text is stored in `raw_text` column — this is supplier document data, treated as confidential. Do not log in production.
- `parsed_json.meta` stores preprocessing metadata (sizes, operations). Does not contain document content.

---

## 14. Deployment Constraints

**Local development (macOS):** Full pipeline works. Install packages with `npm install tesseract.js pdf-parse heic-convert`. No `brew install` required.

**Vercel (serverless):**
- `tesseract.js` WASM: fits within 250MB bundle limit (~30MB WASM core)
- Language data: downloaded from CDN on cold start (~24MB total, 8-15s one-time overhead)
- Function timeout: 300s on Vercel Pro — sufficient for 30-40s OCR on a phone image
- Hobby plan (60s timeout): tight for large Hebrew images. Recommend Pro for production OCR use.
- No native binaries required → no Vercel deployment gap.

**Future upgrade path:** When the `resolveProvider()` function detects `which tesseract` → system binary present (self-hosted VM), it can return a CLI provider with better quality. The WASM provider remains the Vercel-compatible fallback. This requires one function change.

---

## 15. Out of Scope (MVP)

- Scanned PDF → image → OCR conversion (needs native `pdftoppm`/`pdfimages`)
- Multi-page document stitching
- Perspective correction / advanced deskew
- Supplier name fuzzy-match against DB during extraction
- Direct camera preview in the browser (MediaDevices API)
- Async/polling extraction job model
- Confidence-gated auto-fill (all fields shown regardless of confidence, user corrects)
- Training a custom Tesseract model for Israeli invoices

---

## 16. Testing Plan (without a real document)

1. Install dependencies, verify build and TypeScript pass
2. Create a synthetic test image: Hebrew text invoice rendered as PNG via Node.js canvas or simple HTML-to-image — for OCR smoke test
3. Test upload route with a small JPEG → verify `raw_text` appears in DB record
4. Test manual entry still creates a document correctly (no regression)
5. Test PDF upload with a digital PDF → verify text extracted, no OCR run
6. Test HEIC conversion with a `.heic` file (can generate one with `sips` on macOS)
7. Verify `DocumentReview` shows pre-filled fields when `supplier_name_raw` / `document_number` are set
8. Verify warning banner shows when `extraction_confidence < 0.5`
9. Verify manual entry path unchanged end-to-end
10. Run `npm run build` and `npx tsc --noEmit`

Real-document testing: user takes a photo of an actual supplier invoice with a phone → uploads → verifies pre-fill accuracy → corrects → posts.
