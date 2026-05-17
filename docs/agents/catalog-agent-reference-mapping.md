# Catalog Agent Reference Mapping
**Elkayam Road Marking LTD — Digital Operations Command Center**
**Date:** 2026-05-17 | **Status:** Reference document — read-only, non-destructive
**Source:** catalog/catalog.pdf (9.7 MB, 34 content pages) + src/data/safetyAccessories.ts + src/data/signs.ts

---

## 1. Purpose and Scope

This document maps the official Elkayam printed product catalog (PDF) to the current system data sources and identifies alignment gaps. It is a **non-destructive reference only** — no data was mutated, no prices were invented, no products were imported, no DB schema was changed.

This document serves three purposes:
1. Orient the Catalog Agent's detection logic against the actual product taxonomy
2. Identify which product data is present in the system, which is missing, and which requires owner clarification
3. Assess whether the 5 MVP scan rules can fire meaningfully on current data

---

## 2. PDF Catalog Overview

**File:** `catalog/catalog.pdf` — 9.7 MB, 34 content pages (2 unnumbered cover pages + 34 numbered pages)

**Company:** Elkayam Road Marking Ltd. (אלקיים סימון כבישים בע"מ), Ashkelon, founded 1993, ISO 9001:2015

**Table of Contents as printed:**

| Section | Hebrew title | Pages (printed) | PDF physical pages |
|---|---|---|---|
| Company profile | פרופיל החברה | 1–2 | 3–4 |
| Manufacturing machines | סוגי מכונות הדפוס | 3–4 | 5–6 |
| Road & parking safety | אביזרי בטיחות לכבישים וחניונים | 5–18 | 7–20 |
| Traffic arrangements | הסדרי תנועה | 19–20 | 21–22 |
| Signs | שלטים | 21–28 | 23–30 |
| Marking and painting | סימון וצביעה | 29–30 | 31–32 |
| Projects | פרויקטים | 31–34 | 33–34 |

**Note:** The ToC lists Projects as pages 31–36 but the PDF contains only 34 content pages. Pages 35–36 do not exist in the file.

---

## 3. Section A — Manufacturing Machines (Internal Capability)

Pages 3–4 (printed). These are production machines used by Elkayam to manufacture its own products. They are **not products for sale** and should **not** appear in `catalog_items`.

| Machine | Capability |
|---|---|
| מכונת CNC | Engraving and cutting, max 1200×1200mm, materials: steel, aluminum, wood, plastic |
| מכונת לייזר | Laser engraving/cutting, max 1200×1200mm, materials: wood, rubber, glass, magnets, cardboard, ceramic |
| שילוט חריטה | Engraving signage at any size |
| מכונת הדפסה משי | Screen printing on fabric, wood, plastic, max 1200×1200mm |
| מדפסת UV | UV printing on paper, PVC, glass, aluminum, iron, ceramic, plastic, formica |
| מדפסת מחזירי אור | Retroreflective printing |
| מכונת הדבקה | Laminating |

**Mapping status:** No entry needed in any system table. Internal asset.

---

## 4. Section B — Road & Parking Safety Products

Pages 5–18 (printed), PDF physical pages 7–20. This is the largest section (14 pages, 36+ distinct product types). It maps directly to `src/data/safetyAccessories.ts`.

### 4.1 Sub-category mapping

| Sub-category | PDF products | safetyAccessories.ts IDs | Coverage |
|---|---|---|---|
| קונוסים ואביזריהם | קונוסים (5 types), שרוול קונוס | sa-001, sa-002 | ✅ Full |
| מפרדים ועמודים גמישים | מפרדת נתיבים גמישה, עמוד מחזיר אור 11cm, עמוד גמיש (4 types), עמוד חסימה | sa-003, sa-004, sa-005 | ✅ Full (11cm post embedded in sa-003 notes) |
| עמודי מחסום ועמודי חסימה | עמודי מחסום (3 types), עמודי מחסום מוארים | sa-006, sa-007 | ✅ Full |
| מתקני שילוט ואבזור תמרורים | מתקנים מודולאריים (2 diameters), סטנד לשילוט, אנטי גרפיטי לעמודים (2 sizes), חבקים לתמרורים | sa-008, sa-009, sa-022, sa-023 | ✅ Full |
| תאורת בטיחות ועיני חתול | פנס מהבהב סולארי, פנסי LED סולאריים שקועים, עיני חתול, עיני חתול סולאריים | sa-010, sa-011, sa-012, sa-013 | ✅ Full |
| פסי האטה ומגן כבלים | פסי האטה PVC, פסי האטה לד/סולאריים, מגן כבלים | sa-014, sa-015 | ⚠️ Partial (see §9) |
| אביזרי חניה | מעצור חנייה, שומר חנייה מתקפל, מחסום דוקרנים, מגן פינות לחניה | sa-016, sa-017, sa-018, sa-019 | ✅ Full |
| מד מהירות ומראות בטיחות | מד מהירות סולארי, מראה פנורמית (3 diameters) | sa-020, sa-021 | ✅ Full |
| אביזרים ושילוט נוסף | סרטי סימון אדום-לבן, מדבקות כביש מאלומיניום | sa-024, sa-025 | ✅ Full |
| גדרות ותיחום | גדר מתקפלת, גדר קל, גידור זמני, SAFEGATE, גדר רשת פלדה, גדר פלדה, חיזוק פלדה, בסיסי כובד, בסיס גומי (3 types) | sa-026 to sa-034 | ✅ Full |
| נגישות ומניעת הצפות | משטח גבשושיות להכוונה, מדבקות למניעת החלקה, מתקן למניעת הצפות | sa-035, sa-036, sa-037 | ✅ Full |

### 4.2 safetyAccessories.ts summary

| Metric | Count |
|---|---|
| Total items | 37 |
| Status: ready | 24 |
| Status: missing_data | 8 |
| Status: needs_review | 2 (sa-007, sa-028) |
| Confidence: high | 34 |
| Confidence: medium | 3 |
| Items missing price (missingFields includes "מחיר") | 37 (all) |
| Items missing dimensions | ~18 |
| Units populated | 37 (all have unitOfMeasure) |

**Critical gap:** All 37 items are missing `defaultPrice`. The `missingFields` array in every entry explicitly lists "מחיר". This is a documented known gap in the data file itself, not a surprise.

**Important architectural note:** `safetyAccessories.ts` is **client-side order form reference data** — it powers the accessories picker in the order creation UI. It is a separate TypeScript file, not a Supabase table. Whether these items are represented in the `catalog_items` Supabase table (which the catalog agent actually scans) is **not established** from the code. Owner clarification required.

---

## 5. Section C — Traffic Arrangements (Services)

Pages 19–20 (printed). These are project-level services and equipment, not individual products with per-unit prices.

| Item | Hebrew | System status |
|---|---|---|
| Temporary concrete barrier | מעקה בטון זמני | Not in safetyAccessories.ts or catalog |
| LED arrow trailer | עגלות חץ | Not in system (owned equipment) |
| Delineator posts | עמודי תיחום (75cm×25cm) | Not in system |
| Temporary site delineation | תיחום אתר זמני | Not in system (service) |
| Traffic supervisors | פקחי תנועה | Not in system (human service) |
| Road safety guardrail | מעקה בטיחות | Not in system (installation service) |

**Assessment:** These are project-scope services. They belong in `catalog_items` as `type = "service"` with project-based pricing if Elkayam invoices for them separately. Requires owner clarification on billing model.

---

## 6. Section D — Signs

Pages 21–28 (printed). This section covers 8 distinct sign sub-categories. The system has two separate sign-related data sources with fundamentally different taxonomies.

### 6.1 Regulatory traffic signs (signs.ts)

`src/data/signs.ts` is auto-generated from `scripts/generateSignsData.ts`. Contains **327 sign records** covering official Israeli traffic sign standards.

| Series | Shape | Count (approx.) | Meaning |
|---|---|---|---|
| 1xx | משולש (triangle) | ~55 | Warning signs |
| 2xx | עיגול (circle) | ~31 | Prohibition/regulation |
| 3xx | מלבן (rectangle) | ~10 | Information |
| 4xx | עיגול (circle) | ~33 | Right of way / direction |
| 5xx–8xx | Various | ~133 | Additional regulatory series |
| 9xx | מיוחד (special) | ~35 | Special/combination |
| provisional (p-prefix) | לא ידוע | ~18 | Provisional signs |

These correspond to signs manufactured by Elkayam for official Netivei Israel (national roads authority) and municipal projects. They appear in the catalog pages 25 (שילוט נתיבי ישראל). **signs.ts is not catalog_items** — it is order-form reference data for selecting which regulatory signs to include in an order.

### 6.2 Non-regulatory sign categories (PDF only — not in system)

The catalog shows additional sign categories with their own SKU numbering systems that are **absent from the system**:

| Sub-category | Example SKUs from PDF | System status |
|---|---|---|
| שלטי רחובות (street signs) | Custom design per municipality | Not in catalog_items |
| שילוט גנים (park signs) | Custom design | Not in catalog_items |
| שלטי תדמית (image/billboard signs) | Custom design | Not in catalog_items |
| שילוט חנייה (parking signs) | Custom | Not in catalog_items |
| שלטי אביפה (airport/port signs) | Custom | Not in catalog_items |
| שלטי בטיחות (safety signs — blue) | Custom | Not in catalog_items |
| שלטי נגישות (accessibility signs — blue) | Custom | Not in catalog_items |
| **שילוט חשמל (electrical hazard signs)** | **1275, 1274, 1273, 1116, 1276, 1214, 1365, 1318, 1194, 1286, 1302, 1304, 1293, 1195, 1285, 1241, 1264, 3888, 1102, 1108, 1100, 1263, 1122, 1196, 1260, 1125, 1156, 1296...** | **Not in system — has catalog item numbers** |
| **שילוט למרחב מוגן (shelter/evacuation)** | **1190, 1189, 1283, 1199, 1193, 1191, 1222, 1158, 1161, 1226, 1225, 1171, 1254, 1167, 1105, 1224, 1223, 1220** | **Not in system — has catalog item numbers** |
| **שילוט קומות (floor/story signs)** | **1336, 1140, 1139, 1138, 1136, 1137, 1134, 1258, 1337, 1338** | **Not in system — has catalog item numbers** |

**Critical finding:** Electrical signs, shelter signs, and floor signs have explicit SKU catalog numbers in the PDF (4-digit codes). These are **stocked products with fixed sizes** (e.g., 20×10cm, 15×20cm). They should be candidates for `catalog_items` entry. This is the largest unrepresented product group in the system.

---

## 7. Section E — Marking and Painting (Services)

Pages 29–30 (printed). All items are **services**, not physical products.

| Service type | Hebrew | Notes |
|---|---|---|
| Road marking and painting | סימון וצביעת כבישים | Core service, likely already in catalog_items as service |
| Skatepark marking | סימון וצביעת סקייטפארק | Specialty variant of road marking |
| Cycling path coating | ציפוי וסימון שבילי אופניים | Thermoplastic material service |
| Parking lot marking with epoxy | סימון וצביעת חניונים — אפוקסי | Epoxy coating + marking |

**Assessment:** These are project services billed by area (per m²) or per project. If represented in `catalog_items`, they should have `type = "service"` and pricing in ₪/m² or per project unit.

---

## 8. System Data Inventory Summary

| Source | Type | Records | Purpose | Feeds catalog_items? |
|---|---|---|---|---|
| `src/data/safetyAccessories.ts` | Static TS | 37 items | Order form accessories picker | Unknown — not confirmed |
| `src/data/signs.ts` | Auto-generated TS | 327 records | Order form sign picker | Unknown — not confirmed |
| `catalog_items` (Supabase) | Live DB table | Unknown | Catalog agent scan target | This IS catalog_items |

**Architecture gap:** `safetyAccessories.ts` and `signs.ts` were built as front-end reference data for the order creation UI. Whether their items have a corresponding row in `catalog_items` with pricing, cost, and unit fields is **not determinable from code alone**. The catalog agent scans `catalog_items` — if these items are not in that table, the scan will not detect their missing prices.

---

## 9. Items in PDF Not Represented in System

### Physical products — specific gaps

| Product | PDF page (printed) | Gap type | Action |
|---|---|---|---|
| פסי האטה LED/סולאריים שקועים | 13 | Missing item — only PVC type (sa-014) exists | Owner: is this a separate SKU from the PVC version? |
| עמוד מחזיר אור למפרדת נתיבים (11cm) | 8 | Embedded in sa-003 notes but no own catalog_items row | Owner: sold standalone or only with separator? |
| Electrical hazard signs (1275, 1274, ...) | 28 | Entirely absent — ~25+ SKUs | Owner must confirm whether these are stocked |
| Shelter/evacuation signs (1190, 1189, ...) | 28 | Entirely absent — ~18 SKUs | Owner must confirm whether these are stocked |
| Floor/story signs (1136–1338 range) | 28 | Entirely absent — ~10 SKUs | Owner must confirm whether these are stocked |
| עמודי תיחום (delineator posts, 75×25cm) | 19 | Not in any system data source | Owner: sold as product or service item only? |
| מעקה בטיחות (guardrail) | 20 | Not in system | Service or supply? |

### Services — confirmed absent

| Service | PDF pages | Likely catalog_items type |
|---|---|---|
| הסדרי תנועה (traffic arrangement) | 19–20 | service |
| גידור זמני לאתרי בנייה (construction fencing) | 17 | service (sa-028 flagged as needs_review) |
| סימון וצביעת כבישים (road marking) | 29 | service |
| סימון וצביעת חניונים (parking marking) | 30 | service |
| ציפוי שבילי אופניים (cycling path coating) | 29 | service |

---

## 10. Data Quality Observations per Item Group

### safetyAccessories.ts — quality summary

| Issue | Count | Items |
|---|---|---|
| Missing defaultPrice (all) | 37/37 | All sa-001 to sa-037 |
| Missing dimensions | ~18 | sa-005, sa-010, sa-011, sa-012, sa-013, sa-014, sa-017, sa-018, sa-019, sa-020, sa-023, sa-024, sa-025, sa-026, sa-028, sa-032, sa-035, sa-036 |
| Missing material | ~12 | sa-005, sa-008, sa-009, sa-011, sa-012, sa-013, sa-017, sa-018, sa-019, sa-026, sa-027, sa-028 |
| Medium confidence | 3 | sa-007 (illuminated bollard specs inferred), sa-028 (construction fencing: service vs product), sa-033 (bases: material unknown) |
| needs_review status | 2 | sa-007, sa-028 |
| Confidence: high, status: missing_data | 8 | sa-005, sa-014, sa-017, sa-018, sa-019, sa-023, sa-032, sa-033 |

### signs.ts — quality observations

- 327 records auto-generated from standardized script
- `available: true` for all records — no item has been explicitly marked unavailable
- No pricing data exists in this file (by design — signs are priced per order)
- Field `shape` = "לא ידוע" for all provisional (p-prefix) signs — 18 records

---

## 11. PDF ↔ System Alignment Matrix

| PDF section | System data source | Alignment | Key gap |
|---|---|---|---|
| מכונות ייצור | None (correct) | N/A — internal | N/A |
| אביזרי בטיחות | safetyAccessories.ts | ✅ Good coverage | Prices missing everywhere; catalog_items link unconfirmed |
| הסדרי תנועה | Not in system | ❌ Not mapped | Needs owner decision: service vs. catalog items |
| שלטים — regulatory | signs.ts | ✅ Full (1xx–9xx series) | Not catalog_items; pricing is per-order |
| שלטים — custom/image | Not in system | ✅ By design | These are bespoke manufacturing services |
| שלטים — electrical/shelter/floor | Not in system | ❌ Missing SKUs | These are stocked products with catalog numbers |
| סימון וצביעה | Not in system | ⚠️ Needs service entries | Services, but should be billable catalog lines |
| פרויקטים | Not in system | N/A — portfolio only | N/A |

---

## 12. Catalog Agent Rule Readiness Assessment

The catalog agent MVP has 5 scan rules. Here is the assessment of whether each rule can fire meaningfully on current system data:

### Rule 1 — price_cost_inversion
**Condition:** active item with `defaultPrice > 0 AND costPrice > 0 AND defaultPrice < costPrice`

**Readiness:** ⚠️ Low. Will fire only if `catalog_items` has rows with both `defaultPrice` and `costPrice` set. Based on safetyAccessories.ts evidence (all items missing price), these are likely absent. May fire on older sign or service items in the DB if they have cost data entered.

**Expected first-scan output:** 0–few exceptions unless prices were entered manually by owner.

### Rule 2 — exact_duplicate_name
**Condition:** two active items with identical normalized names

**Readiness:** ✅ High. Will fire reliably on any naming collision. Catalog entry quality varies — duplicates are plausible if items were added in batches without deduplication.

**Expected first-scan output:** 0–5 exceptions depending on historical data entry.

### Rule 3 — missing_price
**Condition:** active commercial item (or inactive item in open order) with `defaultPrice IS NULL`

**Readiness:** ✅ High. Will fire for all safety accessories if they exist in `catalog_items` without prices. Given that safetyAccessories.ts documents "מחיר" as a missing field for all 37 items, the corresponding catalog_items rows almost certainly have null prices.

**Expected first-scan output:** Potentially 20–50+ exceptions on first scan if safety accessories are in catalog_items. This is expected and correct behavior — it surfaces a real data gap.

**Recommendation:** Owner should review first scan output and treat Rule 3 exceptions as a price-population task list, not noise.

### Rule 4 — missing_unit_catalog
**Condition:** active item (or inactive in open order) with null/empty `unit_of_measure`

**Readiness:** ✅ High for well-populated items; Medium overall. safetyAccessories.ts has unitOfMeasure set for all items (יחידה, מטר, גליל, שירות), but whether this was migrated to catalog_items is unknown.

**Expected first-scan output:** Will fire if units were not populated during catalog_items entry. Likely 5–20 exceptions depending on historical data entry.

### Rule 5 — inactive_in_open_order
**Condition:** `is_active = false` item referenced in an open accessory or misc order row

**Readiness:** ✅ High. Will fire on any discontinued item still appearing in open work orders. Logic is sound and independent of price/unit gaps.

**Expected first-scan output:** 0–10 exceptions depending on whether any items have been deactivated in catalog_items.

---

## 13. Owner Clarification Items

The following questions require owner decision before the catalog agent can produce accurate, low-noise output:

| # | Question | Impact | Suggested resolution |
|---|---|---|---|
| 1 | Are the 37 safety accessories from safetyAccessories.ts also represented as rows in `catalog_items`? | High — Rule 3/4 coverage | Run a DB query to compare. If not, decide whether to add them. |
| 2 | Do the electrical signs (1275, 1274... ~25 SKUs), shelter signs (1190... ~18 SKUs), and floor signs (1136... ~10 SKUs) exist in `catalog_items`? | High — these are stocked products | Owner to confirm which are stocked vs. print-on-demand |
| 3 | Are traffic arrangement items (delineator posts, guardrail, concrete barriers) billed as catalog line items or embedded in project costs? | Medium — affects service entries | Owner to clarify billing model |
| 4 | Are road marking and parking marking services in `catalog_items` as service-type rows? | Medium — Rule 3 may flag these as missing price | Owner to confirm |
| 5 | Is there a company price list document that maps product SKUs to prices? | High — Rule 1 training gate | Needed before Rule 1 can produce useful output |
| 6 | Are there any items in catalog_items with `defaultPrice = 0` that are intentionally free (not a data error)? | Medium — affects Rule 3 | If yes, add to owner exception whitelist |
| 7 | What is the distinction between `safetyAccessories.ts` items with `status: "needs_review"` (sa-007, sa-028) and their catalog_items counterparts? | Low-medium | Owner to review or confirm these items are intentional |

---

## 14. Recommended Next Steps (Documentation Only)

These are **informational recommendations** for the owner — no code changes are implied:

1. **Run the catalog agent scan** from the Command Center. The first scan will reveal the actual state of `catalog_items` — which rules fire, how many exceptions are created, and what the real data gaps are. The current safetyAccessories.ts analysis is a proxy; the scan against live data is authoritative.

2. **Resolve Owner Clarification Item #1** (are safety accessories in catalog_items?) before interpreting scan results. If they are not, Rule 3 exceptions will only cover a fraction of the real missing-price problem.

3. **Catalog the electrical/shelter/floor signs** as a future catalog data entry task. These are the largest unrepresented stocked product group identified in the PDF.

4. **Classify traffic arrangement services** as either `service`-type catalog items or project-scope line items (not individually scanned by the agent).

5. **Do not create a price list from the PDF alone** — the catalog contains no prices. Prices must come from owner-confirmed documentation.

---

*Last updated: 2026-05-17*
*PDF source: catalog/catalog.pdf (May 12 2026 version)*
*System sources: src/data/safetyAccessories.ts (37 items), src/data/signs.ts (327 records), catalog_items (Supabase — not directly queried)*
*Companion documents: catalog-agent-pilot.md, agent-training-model.md, agent-capability-audit.md*
