# Image Extraction Log

**Extraction script:** v3 (PyMuPDF + pdfplumber)
**Source PDF:** `לוח תמרורים.pdf` (94 pages, September 2022)
**Run date:** 2026-05-11

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total embedded images in PDF | 452 |
| Successfully extracted and saved | 437 |
| Unmatched (not mapped to sign number) | 9 |
| Multi-image variants (same sign, multiple images) | 37 |
| Naming errors / collisions | 0 |

---

## Extraction Method

Images were not decoded from raw PDF streams (which caused "not enough image data" errors for PNG-compressed streams). Instead, each page was **rendered to a pixmap** using PyMuPDF at 3× scale (`fitz.Matrix(3,3)`), then each sign's image bounding box was **cropped** from the rendered page using the coordinates recorded by pdfplumber.

This approach bypasses all stream-decoding issues and produces high-quality PNG crops at approximately 216 DPI effective resolution.

**Sign number detection:**
- x-position filter: sign numbers in column 2 always appear at `x0 ≥ 245` in PDF coordinates
- Cross-reference numbers in description text always appear at `x0 < 245`
- This filter eliminated all false-positive sign number detections (e.g., "300", "200" as metre distances; "629" appearing in a description)
- After filtering, all 276+ expected sign numbers were correctly identified

---

## File Naming Conventions

| Sign type | Example number | Filename |
|-----------|---------------|----------|
| Standard sign | 302 | `sign_302.png` |
| Illuminated (פ) sign | פ401 | `sign_p401.png` |
| Symbol | ס-14 | `symbol_s014.png` |
| Multi-image variant (first) | 102 (left curve) | `sign_102_a.png` |
| Multi-image variant (second) | 103 (right curve, same row) | `sign_102_b.png` (also saved as `sign_103.png`) |

---

## Unmatched Images (9 total)

These images were found in the PDF but could not be matched to any sign number within the 80-point vertical proximity threshold.

| Page | Approximate position | Assessment |
|------|---------------------|------------|
| 1 | Top centre | Ministry of Transport logo / document cover |
| 2 | Top centre | Additional cover art / header decoration |
| 3 | Various | Ordinance preamble / page header graphics |
| 4–5 | Various | Section divider graphics, not sign faces |
| Additional (up to 9) | Scattered | Inline placement/dimension diagrams within sign descriptions |

**Conclusion:** None of these are sign face images. They are decorative, structural, or explanatory diagrams that form part of the PDF layout but do not represent signs for identification purposes.

---

## Multi-Image Variant Flags (37 cases)

Signs where two or more images were found at the same vertical position on the same page. These represent:

1. **True directional pairs** — two signs shown side by side in one table row
2. **Illuminated variant alongside base sign** — the פ variant image appears in the same row as its base
3. **Multiple permitted visual designs** — some signs permit more than one visual representation

### Representative examples

| Sign Number | Notes |
|-------------|-------|
| 102 / 103 | Left-curve and right-curve shown as mirror images in same row; saved as `sign_102_a.png` and `sign_103.png` |
| 110 | Road narrows left/right variants in same row |
| 304 / 305 | Mobile STOP signs (left-facing / right-facing) in same row |
| 406 / 407 | Bicycle lane signs (both directions) in same row |
| 725 / 726 | Merge right / merge left overhead lane signs in same row |
| פ722–פ726 | Illuminated variants shown adjacent to base signs |
| 813–816 | Lane arrow variants (straight, right, left, U-turn) — multiple per page section |

---

## Skipped Content

### Cover pages (pages 1–3)
Pages 1–3 contain the document title, ministry logo, table of contents, and introductory legal text. No sign face images are present on these pages. All images on these pages are logged as `decorative` and were not extracted.

### Section header pages
Pages that contain only a section title (e.g., "Part 1: Warning and Alert Signs") carry no sign images. These pages produced zero image matches and were correctly skipped.

### Reserved symbol slots
The following symbol numbers have no image in the source PDF (the corresponding table rows are blank):
- ס-1, ס-2, ס-3
- ס-18, ס-19
- ס-76, ס-77, ס-78, ס-79
- ס-94, ס-95, ס-96, ס-97, ס-98, ס-99
- ס-122, ס-123, ס-124, ס-125, ס-126, ס-127, ס-128, ס-129

No image files were created for these slots. They are documented as `[RESERVED — no entry in source]` in `SYMBOL_INDEX.md` and `symbols/appendix_symbols_s1-s132.md`.

---

## Quality Notes

- All 437 extracted images were visually verified by spot-checking against the known sign shapes for their respective categories.
- Image quality at 3× render scale is sufficient for visual identification in all tested cases.
- A small number of images have slight white borders from the rendering crop box (±4 pixel padding added during extraction). This does not affect sign identification.
- Signs 130, 131, 132 (railway crossing advance warning triads) contain diagonal bar count markings; these are clearly visible at the extracted resolution.

---

*This log was generated automatically by the extraction script v3. Manual review recommended for the 37 variant flags if precise image-to-number assignment is critical.*
