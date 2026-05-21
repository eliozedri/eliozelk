# Tile-Based Image Scan Report — Engine B v0.2

**Run dir:** `/Users/eliozedri/Desktop/eliozelk/research/cad-pdf-intelligence/runs/poc_plan_50_448_02_400_20260520_223259`  
**Page:** 0  
**Grid:** 4x4  
**Tile DPI:** 150  
**Overlap:** 10%  
**OCR engines requested:** all  
**OCR engines available:** tesseract=True, easyocr=True, paddleocr=True  

## Summary

| Metric | Value |
|---|---|
| Grid | 4x4 |
| Tile DPI | 150 |
| Total tiles processed | 16/16 |
| Raw candidates (before dedup) | 634 |
| Merged candidates (after dedup) | 416 |
| False positive estimate vs full-page (2224) | 81.3% |
| Candidates with sign code | 15 |
| High confidence (≥70) | 373 |
| Requires review | 412 |
| Total runtime | 1103.5s |
| OCR engines used | tesseract, easyocr, paddleocr |
| OCR codes found (all tiles) | 12 |

## Per-Tile Timing

| Tile | Render(ms) | Poles | OCR codes | Shapes | Total(ms) |
|---|---|---|---|---|---|
| 0,0 | 475 | 0 | 1 | 105 | 81308 |
| 0,1 | 906 | 9 | 0 | 45 | 92914 |
| 0,2 | 1087 | 8 | 0 | 127 | 84778 |
| 0,3 | 1370 | 10 | 1 | 189 | 73418 |
| 1,0 | 752 | 36 | 1 | 739 | 61806 |
| 1,1 | 1398 | 27 | 1 | 282 | 60957 |
| 1,2 | 1523 | 83 | 1 | 389 | 64822 |
| 1,3 | 861 | 161 | 1 | 575 | 60043 |
| 2,0 | 628 | 22 | 1 | 382 | 46999 |
| 2,1 | 751 | 64 | 1 | 587 | 54631 |
| 2,2 | 2524 | 71 | 1 | 268 | 94416 |
| 2,3 | 2410 | 42 | 1 | 380 | 91910 |
| 3,0 | 865 | 25 | 0 | 30 | 65747 |
| 3,1 | 687 | 25 | 0 | 21 | 55741 |
| 3,2 | 1018 | 12 | 1 | 100 | 49868 |
| 3,3 | 575 | 26 | 1 | 100 | 43928 |
| **Avg** | **1114** | **38.8** | **0.8** | **269.9** | **67705** |

## Assessment

**Accuracy:** MODERATE — tile mode reduces candidates vs full-page (2224) but still has significant candidates.  

**Speed:** Tile mode is SLOWER than a quick full-page scan (total 1103.5s). Use only when accuracy matters more than speed.  

**Recommendation:** Too many candidates; further blob parameter tuning required before production use.  

## Top Candidates

| Tile | Anchor | Code | Conf | Shape | Overall | Review |
|---|---|---|---|---|---|---|
| tile_01_03 | pole | 402 | 1.00 | octagon | 100 | no |
| tile_01_03 | pole | 402 | 1.00 | octagon | 100 | no |
| tile_01_03 | pole | 402 | 1.00 | octagon | 100 | no |
| tile_02_03 | pole | 402 | 0.65 | square | 100 | no |
| tile_00_01 | pole | None | 0.00 | octagon | 70 | YES |
| tile_00_01 | pole | None | 0.00 | polygon | 70 | YES |
| tile_00_01 | pole | None | 0.00 | polygon | 70 | YES |
| tile_00_01 | pole | None | 0.00 | octagon | 70 | YES |
| tile_00_01 | pole | None | 0.00 | octagon | 70 | YES |
| tile_00_01 | pole | None | 0.00 | circle | 70 | YES |
| tile_00_01 | pole | None | 0.00 | circle | 70 | YES |
| tile_00_02 | pole | None | 0.00 | polygon | 70 | YES |
| tile_00_02 | pole | None | 0.00 | circle | 70 | YES |
| tile_00_02 | pole | None | 0.00 | octagon | 70 | YES |
| tile_00_02 | pole | None | 0.00 | octagon | 70 | YES |
| tile_00_02 | pole | None | 0.00 | octagon | 70 | YES |
| tile_00_02 | pole | None | 0.00 | octagon | 70 | YES |
| tile_00_02 | pole | None | 0.00 | polygon | 70 | YES |
| tile_00_03 | pole | None | 0.00 | circle | 70 | YES |
| tile_00_03 | pole | None | 0.00 | circle | 70 | YES |
