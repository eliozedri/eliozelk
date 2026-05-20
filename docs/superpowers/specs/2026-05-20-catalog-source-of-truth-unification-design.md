# Catalog Source-of-Truth Unification & Rebuild
**Date:** 2026-05-20  
**Status:** Approved — ready for implementation  
**Branch:** main

---

## Problem Statement

A symptom surfaced: "עגלת חץ" appears in an existing order with a "מהקטלוג" badge, but cannot be found in the Catalog tab.

**Root cause confirmed (3-layer problem):**

1. **Deleted seed data.** The Supabase seed migrations (`20260519100000`, `20260519110000`, `20260519120000`) inserted 70+ real Elkayam business items. The go-live DB cleanup deleted them. Supabase tracks which migrations already ran — they will not re-run. The items are gone from the DB.

2. **Stale order snapshot.** `MiscRow.catalogItemId` is a JSONB snapshot field persisted in orders. An order that references `svc-traf-004` (עגלת חץ) still shows "מהקטלוג" because `isLinked = Boolean(row.catalogItemId)` — no live DB check.

3. **Scattered secondary source.** `/safety` page reads from `SAFETY_ACCESSORIES`, a hardcoded TypeScript constant of 800+ lines, not from `catalog_items`. Users browsing it see products invisible to the Catalog tab and order form.

---

## Architecture: One Source of Truth

```
catalog_items (Supabase)          ← canonical, sole source
        │
        ▼
  useCatalog.ts                   ← only DB reader; realtime subscribed
        │
        ▼
CatalogContext (app-wide)         ← shared React state
    ┌───┴──────────────────┬──────────────────────┐
    ▼                      ▼                      ▼
CatalogPage            MiscSection            /safety page
(management)          (order autocomplete)   (filtered live view)
```

**Rules:**
- No component reads catalog-like data from a TypeScript constant, JSON file, or local array that is not Supabase `catalog_items`.
- The `/safety` page becomes a **filtered view** of `catalogItems` from context. The static `SAFETY_ACCESSORIES` TS file becomes import-source-only: consumed once by a migration, then ignored in UI.
- The Catalog tab (`/catalog`) is the single management destination for all products, services, work types, safety accessories, traffic arrangement items, and billable/operational equipment.

---

## Migration Plan (4 files, sequential)

### M1 — `20260520100000_catalog_metadata_schema.sql`
```sql
ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
```
`metadata` stores:
- `metadata.images` — array of `{url, caption, source}` objects
- `metadata.specs` — technical specification key/value pairs
- `metadata.sources` — array of `{type: "website"|"company_profile"|"seed"|"manual", url, note}`
- `metadata.aliases` — Hebrew/English search aliases
- `metadata.fleet_only` — boolean; true = internal resource, not a sellable product
- `metadata.fleet_managed` — boolean; true = should eventually move to Fleet module but currently tracked in catalog

### M2 — `20260520110000_catalog_core_upsert.sql`
UPSERT all core business items deleted by the go-live cleanup. Uses:
```sql
INSERT INTO catalog_items (...) VALUES (...)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  category = EXCLUDED.category,
  ...
  updated_at = now();
```
Covers 3 previous seed categories:
- **עבודות סימון וצביעה** (10 items, type: `service`)
- **הסרת סימון** (2 items, type: `service`)
- **הסדרי תנועה** (5 items incl. עגלת חץ, types: `service`/`labor`/`equipment`)
- **עבודות שטח ולוגיסטיקה** (5 items, type: `service`/`labor`)
- **מעקות ומחסומים** (6 items, type: `product`)
- **גדרות ותיחום** (4 items, type: `product`)
- **אביזרי חנייה** (4 items, type: `product`)
- **אביזרי כבישים** (7 items, type: `product`)
- **גובים ותעלות** (2 items, type: `product`)
- **דיגלונים** (1 item, type: `product`)
- **שלטים ושילוט** (17 items, type: `product`)

### M3 — `20260520120000_catalog_safety_accessories.sql`
UPSERT all safety accessories from `src/data/safetyAccessories.ts`. These items (cones, barriers, blinkers, etc.) are real Elkayam products and must live in `catalog_items` under category `אביזרי בטיחות — [subcategory]`. After this migration the static TS file is UI-dormant.

### M4 — `20260520130000_catalog_expanded_extraction.sql`
UPSERT items extracted from the official website and company profile that are NOT covered by M2 or M3. Based on `מקורות מידע/website-extracted/service-product-catalog.md`. Includes:
- Items from the website that were missed in original seeds
- Equipment/resource items that are billable (e.g., generators billed per day)
- Items with `metadata.fleet_only: true` for internal resources

---

## Catalog / Equipment Boundary

| Classification | Stored in catalog_items | type field | metadata flags | Visible in order autocomplete |
|---|---|---|---|---|
| Sellable product (sign, mirror, cone) | ✓ | `product` | — | ✓ |
| Quotable service (road marking, traffic arrangement) | ✓ | `service` | — | ✓ |
| Billable labor (traffic inspector, safety crew) | ✓ | `labor` | — | ✓ |
| Billable equipment (עגלת חץ, generator/day) | ✓ | `equipment` | `fleet_managed: true` | ✓ |
| Internal resource (road marking machine — not billed) | ✓ temporarily | `equipment` | `fleet_only: true`, `is_active: false` | ✗ (inactive) |
| Future fleet-only vehicle | NOT in catalog | — | — | — |

---

## Stale Reference Fix (code change, no migration)

**File:** `src/components/OrderForm/MiscSection.tsx`

Current behavior:
```tsx
const isLinked = Boolean(row.catalogItemId); // no DB check
```

New behavior:
```tsx
const catalogIds = useMemo(() => new Set(catalogItems.map(c => c.id)), [catalogItems]);
const isLinked = Boolean(row.catalogItemId) && catalogIds.has(row.catalogItemId!);
const isStale  = Boolean(row.catalogItemId) && !catalogIds.has(row.catalogItemId!);
```

- `isLinked = true` → show blue "מהקטלוג" badge (valid, item exists)
- `isStale = true` → show amber "⚠ קישור פג תוקף" badge (item deleted from catalog)
- Both badges include the existing unlink `×` button
- No DB write required; this is purely a display/UX fix

---

## /safety Page Refactor

**Phased approach:**

**Phase 1 (this task):** Data source decoupled. The `/safety` page continues to render from `SAFETY_ACCESSORIES` temporarily, BUT the TS file now reflects what is in `catalog_items` (because M3 UPSERTs all items). A header comment is added to `safetyAccessories.ts` marking it as "migration-source-only — do not add UI consumers". The page renders correctly; no visual regression.

**Phase 2 (next task, out of scope here):** `/safety` page is refactored to use `useCatalogContext()`:
```tsx
const { items: catalogItems } = useCatalogContext();
const safetyItems = useMemo(() =>
  catalogItems.filter(i =>
    i.isActive &&
    (i.category.startsWith("אביזרי בטיחות") ||
     i.category === "אביזרי חנייה" ||
     i.category === "אביזרי כבישים")
  ), [catalogItems]);
```
Visual layout preserved using `metadata.specs` and `metadata.images[0]?.url`. Phase 2 is explicitly logged in the final report as "remaining step."

**Why phased:** The `/safety` page has complex subcategory card rendering, image mapping, and variant display. Decoupling the data source cleanly is the priority; the UI refactor is a separate, low-risk next step.

---

## Catalog UI Enhancements (Catalog/index.tsx)

- Show `metadata.images[0]` thumbnail (16×16px) next to item name if present — non-breaking, skip if empty
- Show source badge (`מאתר` / `פרופיל חברה` / `ידני`) from `metadata.sources[0]?.type`
- No structural changes to the table or add/edit flows

---

## Reverse Audit Target (20 items)

After migrations, verify these items exist in the correct location:

| Item | Expected category | Expected type |
|------|------------------|--------------|
| עגלת חץ | הסדרי תנועה | equipment |
| הסדר תנועה זמני | הסדרי תנועה | service |
| פקח תנועה | הסדרי תנועה | labor |
| סימון וצביעת כבישים | עבודות סימון וצביעה | service |
| סימון וצביעת חניונים | עבודות סימון וצביעה | service |
| סימון וצביעת שבילי אופניים | עבודות סימון וצביעה | service |
| סימון תרמו פלסטי | עבודות סימון וצביעה | service |
| ציפוי נגד החלקה (אנטי סליפ) | עבודות סימון וצביעה | service |
| הסרת סימון בלחץ מים | הסרת סימון | service |
| הסרת סימון כדוריות פלדה | הסרת סימון | service |
| תמרור סטנדרטי | שלטים ושילוט | product |
| שלט פולט אור / מואר | שלטים ושילוט | product |
| שלט LED סולארי | שלטים ושילוט | product |
| מעקה בטון (ניו ג׳רזי) | מעקות ומחסומים | product |
| מעקה בטיחות להולכי רגל | מעקות ומחסומים | product |
| סופג אנרגיה / יחידת קצה | מעקות ומחסומים | product |
| גדר בטיחות SAFEGATE | גדרות ותיחום | product |
| עיני חתול | אביזרי כבישים | product |
| פנס מהבהב סולארי | אביזרי כבישים | product |
| פס האטה — גומי / PVC | אביזרי כבישים | product |
| מעצור חנייה | אביזרי חנייה | product |
| מראה פנורמית | אביזרי חנייה | product |
| גוב / תא בקרה נייד HDPE | גובים ותעלות | product |

---

## Validation Safeguards

1. **Order form invariant**: `catalogItemId` set → item must exist in `catalogItems` set → else show stale badge. No silent deception.
2. **No duplicate IDs**: All migration IDs are prefixed by domain (`svc-`, `prd-`, `sgn-`, `sa-`) and are deterministic. `ON CONFLICT (id) DO UPDATE` prevents duplication.
3. **Inactive fleet-only items**: `is_active: false` + `metadata.fleet_only: true` → not shown in order autocomplete (filter: `item.isActive`).
4. **No cleanup-proof data loss**: Future DB cleanups must check `metadata.sources` for production-seeded items and not delete them.

---

## Files Changed (expected)

| File | Change type |
|------|------------|
| `supabase/migrations/20260520100000_catalog_metadata_schema.sql` | New |
| `supabase/migrations/20260520110000_catalog_core_upsert.sql` | New |
| `supabase/migrations/20260520120000_catalog_safety_accessories.sql` | New |
| `supabase/migrations/20260520130000_catalog_expanded_extraction.sql` | New |
| `src/components/OrderForm/MiscSection.tsx` | Stale ref fix |
| `src/components/SafetyAccessories/index.tsx` | Read from catalogContext |
| `src/components/Catalog/index.tsx` | Thumbnail + source badge |
| `src/data/safetyAccessories.ts` | No UI change; add header comment marking it migration-source-only |

---

## Risks

- **Migration M3 (safety accessories)**: The SAFETY_ACCESSORIES TS file has ~100 items with rich fields (variants, dimensions, materials). The SQL mapping must preserve description, unitOfMeasure, and subcategory; images and specs go into `metadata`. Risk: low if done carefully; medium if field mapping is lossy.
- **No destructive DB operation required**: All migrations are additive (UPSERT + ADD COLUMN IF NOT EXISTS). No DROP, no DELETE, no data loss.
- **Order form stale badge**: existing orders with deleted catalog refs will now show amber "⚠ קישור פג תוקף" badge. This is accurate and non-breaking. Users can unlink and relink.
