# Israeli Traffic Sign Board — Knowledge System

**Source:** לוח תמרורים (Traffic Sign Board), Traffic Ordinance Notification 2010, updated September 2022  
**Publication:** K.T. 4048, p. 4048, publication no. 10328, dated 13.09.2022  
**This system built:** May 2026

---

## Purpose

This knowledge system enables accurate identification, classification, and lookup of all official Israeli traffic signs without re-reading the original PDF. It supports cataloging, sign selection, order entry, production workflows, and automated lookup.

---

## File Structure

```
Sign/
├── לוח תמרורים.pdf                 ← original source (do not modify)
├── images/                          ← extracted sign images (PNG)
│   ├── sign_101.png … sign_935.png
│   ├── sign_p401.png …              (פ = illuminated/flashing variants; p prefix)
│   ├── symbol_s004.png …            (ס symbols; s + 3-digit number)
│   └── extraction_log.md            (image mapping notes, uncertain matches)
└── knowledge-base/
    ├── README.md                    ← this file
    ├── SIGN_INDEX.md                ← master lookup table: all signs
    ├── SYMBOL_INDEX.md              ← master lookup table: all symbols
    ├── categories/
    │   ├── 01_warning_alert_101-152.md
    │   ├── 02_instructions_201-231.md
    │   ├── 03_right_of_way_301-310.md
    │   ├── 04_prohibitions_restrictions_401-441.md
    │   ├── 05_public_transport_501-516.md
    │   ├── 06_information_guidance_601-640.md
    │   ├── 07_traffic_lights_lane_control_701-729.md
    │   ├── 08_road_markings_801-821.md
    │   └── 09_work_zone_901-935.md
    ├── symbols/
    │   └── appendix_symbols_s1-s132.md
    ├── meta/
    │   ├── cross_references.md
    │   ├── sign_families.md
    │   └── legal_framework.md
    └── validation/
        └── completeness_report.md
```

---

## Sign Number Conventions

| Format | Example | Meaning |
|--------|---------|---------|
| `NNN` | `302` | Standard sign number |
| `פNNN` | `פ401` | Illuminated/self-luminous variant (same meaning as base sign) |
| `ס-N` | `ס-44` | Symbol (appendix entry), used inside other signs |

In filenames: `פ` → `p` (e.g., `sign_p401.png`); `ס-N` → `s` + zero-padded 3 digits (e.g., `symbol_s044.png`).

---

## Table Structure (4 Columns per Sign Entry)

The original PDF is an RTL Hebrew document. Each sign entry has:

| Column | PDF Position | Content |
|--------|-------------|---------|
| 1 (rightmost) | Image area | Sign visual — extracted to `images/` |
| 2 | Sign number | Official number (e.g., `302`, `פ426`) |
| 3 | Meaning | Official interpretation of the sign |
| 4 (leftmost) | Applicability | Legal force: who it applies to, when, where |

For traffic light signs (Part 7), Column 4 says "intended for" (vehicle driver, rail driver, pedestrian, etc.).

---

## Category Overview

| # | Category | Sign Range | Shape | Primary Color |
|---|----------|-----------|-------|---------------|
| 1 | Warning & Alert | 101–152 | Equilateral triangle (point up) | Red border, yellow fill |
| 2 | Instruction | 201–231 | Rectangle / custom shape | Blue background, white/yellow arrows |
| 3 | Right-of-Way | 301–310 | Various (inverted triangle, octagon, arrow) | White/red/green |
| 4 | Prohibitions & Restrictions | 401–441 | Circle | Red border, white background |
| 5 | Public Transport | 501–516 | Rectangle | Blue/white, yellow lane markings |
| 6 | Information & Guidance | 601–640 | Rectangle | Blue (motorway), green (other roads), brown (tourism) |
| 7 | Traffic Lights & Lane Control | 701–729 | Signal housing | Red/yellow/green/white |
| 8 | Road Surface Markings | 801–821 | Lines on road surface | White / yellow / blue |
| 9 | Work Zone | 901–935 | Same shapes as standard signs | Orange/amber |
| 10 | Symbols (Appendix) | ס-1 – ס-132 | Pictogram | Varies by context |

---

## How to Look Up a Sign

**By number:** Search `SIGN_INDEX.md` or open the relevant category file.  
**By topic:** Browse the category files or check `meta/sign_families.md` for grouped families.  
**By image:** Images are named `sign_{number}.png` — open directly from `images/`.  
**Cross-references:** If a sign mentions another sign number, see `meta/cross_references.md`.

---

## Known Gaps & Limitations

- Symbols ס-1, ס-2, ס-3, ס-18, ס-19 have no image in the source PDF (blank rows).
- Reserved symbol slots (ס-76–79, ס-94–99, ס-122–129): no entry in source; listed as `[RESERVED]`.
- Some signs with multiple visual variants on the same page row have images saved as `sign_NNN_a.png`, `sign_NNN_b.png`, etc.
- 9 images across pages 22–49 could not be matched to a sign number (distance >80pt from any number) — these are inline schematic diagrams, not standalone signs. Logged in `images/extraction_log.md`.
