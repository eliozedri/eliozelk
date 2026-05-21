# Spec: Catalog Assets, Product Import & Visual Catalog Upgrade

**Date:** 2026-05-21  
**Revision:** v2 — expanded scope per correction 2026-05-21  
**Status:** Pending implementation planning  

---

## 0. Scope Summary

This spec covers **four sequential phases** that together deliver a complete catalog upgrade:

| Phase | Deliverable | Touches |
|---|---|---|
| A | Image pipeline — rescan, download, crop, store | `public/catalog/`, migration scripts |
| B | Product data enrichment + supplier import as INACTIVE | Supabase `catalog_items`, migration SQL |
| C | `/catalog` management UI upgrade | `CatalogPage`, `ItemCard`, `CatalogItemDetailPanel` |
| D | `/catalog-showcase` visual catalog page | New route + new components |

**Critical rule:** Phases A and B must complete before C and D, because C and D both depend on the new image paths and enriched product records.

---

## 1. Problem

**1a.** The existing 37 safety-item images (`/catalog/safety/products/pXX-YY.jpg`) were extracted from a low-resolution PDF and are **not approved for use** as the final product images. They may be low quality, poorly cropped, or show full catalog pages rather than individual products. They must not be treated as final. All product images must be rebuilt from fresh source scans.

**1b.** The `/catalog` management page currently shows product cards with no images, no source badges, and no click-to-edit card behavior. This must be upgraded.

**1c.** There is no visual catalog page for browsing products. A new `/catalog-showcase` page is needed.

**1d.** External supplier products relevant to our industry exist at `https://www.asclean.co.il/catalog-safety-equipment/` but are not in our catalog. They should be imported as INACTIVE reference items so they are available for future activation without being confused with active Elkayam stock.

---

## 2. What Is NOT Changing

- The `/catalog` route, page shell, and overall management UX structure remain — no removal of existing filters, table view, add-item form, or edit modal.
- No e-commerce, checkout, or pricing flows.
- No public-facing deployment.
- No Supabase auth changes.
- No new TabId needed.

---

## 3. Source Classification Model

All `catalog_items` carry `metadata.sources[0].type`. The badge system reads this field.

### Source types and badge mapping

| `sources[0].type` | Means | Badge | Color |
|---|---|---|---|
| `website` | Elkayam website | אלקיים | blue |
| `company_profile` | Elkayam company profile doc | אלקיים | blue |
| `seed` | Prior internal seed/catalog | אלקיים | blue |
| `existing_catalog` | Confirmed existing Elkayam item | אלקיים | blue |
| `manual` | Manually entered by staff | ידני | gray |
| `external_supplier_reference` | Imported from external supplier | מקור חיצוני | amber |

### Status (item.isActive)

| `isActive` | Badge |
|---|---|
| `true` | ● פעיל (green) |
| `false` | ○ לא פעיל (gray) |

### Review state (metadata.review_state)

| value | Badge |
|---|---|
| `needs_review` | דורש בדיקה (red) |
| `missing_image` | חסרת תמונה (orange) |
| absent | no badge |

### Active vs inactive rule (non-negotiable)
- Items from Elkayam sources (website, profile, existing catalog, manual) → `is_active = true`
- Items from external supplier → `is_active = false`
- Supplier items must **never** be automatically activated
- If a supplier item matches an existing Elkayam item → enrich the Elkayam item, do not duplicate or downgrade

---

## Phase A: Image Pipeline

### A1. Existing images — deprecation

The 37 images at `/public/catalog/safety/products/pXX-YY.jpg` and `/public/catalog/safety/pages/page-XX.jpg` are treated as **deprecated candidates**. During Phase A:

1. Do not delete them immediately — keep as fallback during transition.
2. Mark them with `review_state: "image_needs_replacement"` in the relevant `metadata` fields via a migration script.
3. After new images are confirmed good, clear the old references and optionally delete the old files.
4. The `src/data/safetyAccessoryImages.ts` constant is frozen (migration-source-only, already noted in the migration SQL). It must not be used to drive production image rendering after Phase A completes.

### A2. Rescan Elkayam sources

Scan the following for product images:

1. **Elkayam website**: `https://elkayam.co.il/` — crawl all product/service pages, download images for products that match items in our catalog. Save to `public/catalog/elkayam/`.
2. **Company profile / source folder**: `מקורות מידע/` — inspect any PDFs or images already present. Extract product images where useful.
3. **Existing internal catalog data** — no rescan needed, already known.

For each image found:
- Match to an existing `catalog_items` record by normalized Hebrew name.
- If matched: add to `metadata.images` as the candidate product image.
- If unmatched: create a new INACTIVE item or note as unmatched for manual review.

### A3. Rescan external supplier catalog

Scan `https://www.asclean.co.il/catalog-safety-equipment/`:

1. Open the main catalog page and identify all category links.
2. For each category page: collect all product names and image URLs.
3. For each product: collect name, image URL, description, specs, and the product/category page URL.
4. Download all product images. Save to `public/catalog/supplier/asclean/<category-slug>/`.

**What to collect per product (supplier):**
```
name_he          — product name as displayed
category         — category from the supplier page
source_url       — exact URL of the product or category page
image_url_remote — original image URL (keep as metadata reference)
image_path_local — local /public path after download
description      — short description if visible
specs            — any dimension/material data visible
source_name      — "Asclean / ארבל שטראוס"
source_type      — "external_supplier_reference"
is_active        — false (always)
review_state     — "needs_review"
imported_at      — timestamp
```

**Scraping limitations — what to report if blocked:**
- If the page requires JavaScript rendering and the fetch returns HTML-only shell: report which categories were accessible vs blocked.
- If images return 403/redirect when hotlinked: note those products as `image_status: "download_failed"`.
- If PDFs are linked on category pages: note them for manual download and extraction.
- Do not invent product data for pages that could not be accessed.

### A4. Image crop pipeline

For every downloaded image (Elkayam and supplier):

1. **Inspect dimensions** — detect if image is a full page scan vs isolated product.
2. **Background detection** — detect solid white/gray background vs complex background.
3. **Object-aware crop** — attempt to detect product bounds:
   - Remove empty white/solid-color margins.
   - Detect the largest non-background bounding box.
   - Add 5–10% padding around detected object.
   - Center the object in the output frame.
4. **Output two files per product:**
   - `_thumb.webp` — 400×400 px, for product cards
   - `_full.webp` — 800×800 px, for product detail modal
5. **Quality thresholds:**
   - If detected object fills <20% of original frame → apply aggressive crop.
   - If crop confidence is low → store conservative crop + set `crop_status: "needs_review"`.
   - Never destroy the original — keep `_original.jpg/png` alongside processed files.
6. **Alt text** — attach Hebrew product name as `alt` metadata field.

**Tooling options (choose based on what is available on this system):**
- Python + Pillow (basic margin-trim crop)
- Python + rembg (AI background removal if available)
- Python + OpenCV (contour detection)
- Sharp (Node.js) for format conversion + basic resize

**Crop script location:** `scripts/crop-catalog-images.py` (or `.ts` if using Sharp).

### A5. File naming convention

```
public/catalog/
  elkayam/
    <category-slug>/
      <product-slug>_original.jpg
      <product-slug>_thumb.webp
      <product-slug>_full.webp
  supplier/
    asclean/
      <category-slug>/
        <product-slug>_original.jpg
        <product-slug>_thumb.webp
        <product-slug>_full.webp
  safety/         ← deprecated — do not write new files here
    products/     ← frozen, will be cleared post-Phase A
    pages/        ← frozen, will be cleared post-Phase A
```

Slug rules:
- Hebrew → romanized slug using transliteration (or kebab-case based on item ID)
- Example: `קונוסים` → `sa-001` ID-based → `sa-001_thumb.webp`
- Prefer ID-based naming for stability.

### A6. Image metadata attachment

After cropping, update each matching `catalog_items` record via upsert:

```sql
UPDATE catalog_items
SET metadata = jsonb_set(
  metadata,
  '{images}',
  '{
    "thumb": "/catalog/<source>/<cat>/<id>_thumb.webp",
    "full":  "/catalog/<source>/<cat>/<id>_full.webp",
    "original_url": "<remote url or local original path>",
    "source_page": "<url of page where image was found>",
    "crop_status": "ok | needs_review | download_failed",
    "imported_at": "<ISO timestamp>"
  }'::jsonb,
  true
),
updated_at = now()
WHERE id = '<item-id>';
```

New image shape in `metadata.images`:
- `thumb` — used in product cards
- `full` — used in detail modal
- `original_url` — source URL for audit trail
- `source_page` — page where it was found
- `crop_status` — `ok | needs_review | download_failed`
- `imported_at`

**Migration script location:** `scripts/attach-catalog-images.ts` (or SQL file in `supabase/migrations/`).

---

## Phase B: Product Data Enrichment + Supplier Import

### B1. Elkayam product enrichment

For each active Elkayam item, enrich `metadata` with:
- `sources[0].type` set correctly if missing or wrong
- `images.thumb` and `images.full` from Phase A
- `specs` sub-object: material, dimensions, use case (only from confirmed source data — do not invent)
- `aliases` array if the product has alternate names used in orders

Matching rule: match by `id` (primary), then by normalized Hebrew name if `id` is unknown.

**Do not modify `is_active`, `default_price`, or `name` of existing confirmed items without explicit review.**

### B2. Supplier product import

**Source:** `https://www.asclean.co.il/catalog-safety-equipment/`  
**Target table:** `catalog_items`  
**Status:** `is_active = false` (hard rule, never override automatically)

Import script: `scripts/import-supplier-catalog.ts`

Import rules:
1. Generate a stable `id` from source name + category slug: `ext-asc-<category-slug>-<index>` (e.g., `ext-asc-speed-bump-001`).
2. Before inserting, check if a catalog item with the same normalized Hebrew name already exists as an active Elkayam item. If yes → skip insert, log as "skipped — Elkayam item already covers this product", optionally enrich the existing item's `metadata.images` if the supplier image is better.
3. If no match → insert as new INACTIVE item with `source_type: "external_supplier_reference"`.
4. All supplier imports use `ON CONFLICT (id) DO UPDATE` to be idempotent.

**New item shape for supplier imports:**

```ts
{
  id: "ext-asc-<slug>-<n>",
  name: "<Hebrew product name>",
  type: "product",
  category: "<mapped category>",
  unit_of_measure: "יחידה",
  default_price: null,
  cost_price: null,
  description: "<short factual description — not copied marketing copy>",
  is_active: false,
  current_quantity: 0,
  minimum_quantity: 0,
  reserved_quantity: 0,
  metadata: {
    sources: [{
      type: "external_supplier_reference",
      note: "Asclean / ארבל שטראוס",
      url: "<source page url>"
    }],
    images: {
      thumb: "/catalog/supplier/asclean/<cat>/<id>_thumb.webp",
      full:  "/catalog/supplier/asclean/<cat>/<id>_full.webp",
      original_url: "<remote image url>",
      source_page: "<category page url>",
      crop_status: "ok | needs_review | download_failed",
      imported_at: "<ISO timestamp>"
    },
    review_state: "needs_review",
    specs: { /* material, dimensions from supplier page if available */ }
  }
}
```

**Categories to import** (from the supplier catalog — use these as the mapped category values):

| Supplier category | Our catalog category |
|---|---|
| פסי האטה | אביזרי כבישים |
| מראות פנורמיות | אביזרי חנייה |
| מעצורי חניה | אביזרי חנייה |
| עמודים גמישים | אביזרי בטיחות — מפרדים ועמודים גמישים |
| עמודי חסימה | אביזרי בטיחות — עמודי מחסום ועמודי חסימה |
| מחסומים ניידים | מעקות ומחסומים |
| קונוסים לסימון | אביזרי בטיחות — קונוסים ואביזריהם |
| מפרידי נתיבים | אביזרי בטיחות — מפרדים ועמודים גמישים |
| נצנץ סולארי | אביזרי כבישים |
| מניעת החלקה | אביזרי כבישים |
| שילוט ותמרור | שלטים ושילוט |
| מעברי כבל | גובים ותעלות |
| הגנות ומיגונים | אביזרי בטיחות — מתקני שילוט ואבזור תמרורים |
| נגישות לעיוורים | אביזרי בטיחות — נגישות |
| Others not mapped | אביזרי בטיחות — כללי |

### B3. Deduplication rules

| Situation | Action |
|---|---|
| Supplier product matches active Elkayam item (same name) | Skip insert. Optionally add supplier image to existing item's metadata as secondary reference. |
| Supplier product is similar but different size/variant | Insert as separate INACTIVE item with variant info in name/description. |
| Two supplier products look identical | Insert only once, keep both source URLs in `sources[]`. |
| Uncertain match | Insert as INACTIVE with `review_state: "needs_review"`. Never silently merge. |

---

## Phase C: Existing `/catalog` Management UI Upgrade

The existing `src/components/Catalog/index.tsx` must be upgraded. **Do not change the overall page structure, filters, table view, add-item form, or edit modal.** Only enhance the card view and detail panel.

### C1. Card view — `ItemCard` component

**Add to each card:**
- Product image thumbnail (top of card, before the name row):
  - Source: `item.metadata?.images?.thumb` (new field from Phase A)
  - Fallback: emoji from `CATEGORY_ICONS` map (same map used in Showcase)
  - Final fallback: a gray placeholder box with the item's initials
  - Height: fixed `h-32` (`128px`), `object-cover`, rounded top
  - `loading="lazy"`, `onError` → show placeholder
- Status badge: already exists (active/inactive toggle button at bottom) — keep as-is, no change needed
- Source badge: read `metadata.sources[0].type`, show as a small pill (same badge helper as Showcase)
- Review state badge: if `metadata.review_state === "needs_review"` show small amber pill

**Card click-to-edit behavior:**
- The entire card `<div>` gains `cursor-pointer` and `onClick={() => onEdit(item.id)}`
- Internal buttons (PencilIcon, TrashIcon, toggle button) must `e.stopPropagation()` to prevent double-triggering
- Keyboard: card `div` gets `role="button"`, `tabIndex={0}`, `onKeyDown` → Enter/Space → `onEdit(item.id)`
- Visual cue: existing `hover:shadow-sm` is sufficient; optionally add `hover:border-blue-300 transition-colors`

**Do not add a second edit modal** — `onEdit(item.id)` calls the existing `startEdit` function which switches to table view and opens the inline edit form. This is the existing behavior, unchanged.

### C2. Detail panel — `CatalogItemDetailPanel` (table view expand)

The detail panel already shows `images.product` (old field). Update to check `images.thumb` first, then `images.full`, then `images.product` (legacy), then hide:

```ts
const imageUrl = images?.thumb ?? images?.full ?? images?.product ?? null;
```

Add to the detail panel:
- Source badge if not already shown
- Review state badge if present
- `crop_status` note if `"needs_review"` (small italic note: "תמונה דורשת בדיקת חיתוך")

### C3. No changes to

- Table view row rendering
- Filter bar
- Add-item form
- Edit inline form (FormFields)
- Delete behavior
- Inventory/stock fields
- LinkedProducts panel

---

## Phase D: New `/catalog-showcase` Visual Catalog Page

*This phase is unchanged from the v1 spec sections 5–15, except as noted below.*

### Changes from v1

**Section 9 (Image Handling) — replaced:**

> ~~Existing images: 37 safety accessories have `metadata.images.product` set to `/catalog/safety/products/pXX-YY.jpg`. These load immediately.~~

**Corrected:**
- All product images come from Phase A — `metadata.images.thumb` (new field).
- The `images.product` legacy field (old path) is **not used** in Phase D components.
- If `metadata.images.thumb` is absent → emoji fallback from `CATEGORY_ICONS`.
- If `metadata.images.thumb` is present but fails to load → `onError` → emoji fallback.
- No image references in Phase D code hardcode the old `/catalog/safety/products/` path.

### Supplier products in the showcase

- Supplier-imported INACTIVE items (from Phase B) are visible in the showcase.
- Default view: filter pills default to **"הכל"** which shows both active and inactive.
- Inactive supplier cards render at `opacity-55` with `○ לא פעיל` + `מקור חיצוני` + `דורש בדיקה` badges.
- The "● פעיל" filter pill hides supplier items.
- No supplier product is ever shown without its status badges.

---

## 4. Data Source (unchanged from v1)

**Single source of truth:** `catalog_items` Supabase table via `useCatalogContext()`.

After Phase B, `useCatalogContext()` returns both Elkayam active items and supplier INACTIVE items. The UI components use `is_active` and `metadata.sources[0].type` to render badges and visual differentiation.

---

## 5. Category Mapping (unchanged from v1)

```ts
const SHOWCASE_CATEGORIES = [
  { key: "אביזרי בטיחות — קונוסים ואביזריהם", label: "קונוסים ואביזריהם", icon: "🦺" },
  { key: "אביזרי בטיחות — מפרדים ועמודים גמישים", label: "עמודים גמישים", icon: "🪧" },
  { key: "אביזרי בטיחות — עמודי מחסום ועמודי חסימה", label: "עמודי מחסום", icon: "🛑" },
  { key: "אביזרי כבישים", label: "אביזרי כבישים", icon: "🚧" },
  { key: "אביזרי חנייה", label: "אביזרי חנייה", icon: "🛞" },
  { key: "מעקות ומחסומים", label: "מעקות ומחסומים", icon: "🚧" },
  { key: "גדרות ותיחום", label: "גדרות ותיחום", icon: "⛽" },
  { key: "שלטים ושילוט", label: "שלטים ושילוט", icon: "🚦" },
  { key: "הסדרי תנועה", label: "הסדרי תנועה", icon: "🚐" },
  { key: "עבודות סימון וצביעה", label: "סימון וצביעה", icon: "🖌️" },
  { key: "הסרת סימון", label: "הסרת סימון", icon: "💧" },
  { key: "גובים ותעלות", label: "גובים ותעלות", icon: "🔌" },
  { key: "אביזרי בטיחות — נגישות", label: "נגישות", icon: "♿" },
  { key: "אביזרי בטיחות — כללי", label: "אביזרי בטיחות כלליים", icon: "🛡️" },
];
// All unmatched "אביזרי בטיחות — X" categories collapse into { label: "אביזרי בטיחות נוספים", icon: "🛡️" }
```

---

## 6. Page Structure (unchanged from v1 — see sections 6–12)

Route, sidebar, hero, category grid, product grid, product detail modal, component architecture, filter logic, responsive breakpoints, RTL, navigation integration — all as specified in v1.

One addition: **filter pills on the showcase page include a "הסתר לא פעיל" (hide inactive) toggle** as a convenience, since supplier imports will add a significant number of INACTIVE items.

---

## 7. Files to Create / Change

| File | Action | Phase |
|---|---|---|
| `scripts/scrape-catalog-sources.py` | Create — scraper for Elkayam website + asclean | A |
| `scripts/crop-catalog-images.py` | Create — crop + convert images | A |
| `scripts/attach-catalog-images.ts` | Create — upsert image metadata to DB | A |
| `scripts/import-supplier-catalog.ts` | Create — import INACTIVE supplier items | B |
| `supabase/migrations/20260521100000_supplier_catalog_import.sql` | Create — upsert supplier items | B |
| `src/components/Catalog/index.tsx` | Edit — image in card, source badge, click-to-edit | C |
| `src/app/catalog-showcase/page.tsx` | Create | D |
| `src/components/CatalogShowcase/index.tsx` | Create | D |
| `src/components/CatalogShowcase/CategoryCard.tsx` | Create | D |
| `src/components/CatalogShowcase/ProductCard.tsx` | Create | D |
| `src/components/CatalogShowcase/ProductModal.tsx` | Create | D |
| `src/components/CatalogShowcase/constants.ts` | Create | D |
| `src/components/Sidebar.tsx` | Edit — add nav item | D |

---

## 8. Acceptance Criteria

### Phase A — Image pipeline
- [ ] `scripts/scrape-catalog-sources.py` runs and downloads images from Elkayam + asclean
- [ ] Images saved to `public/catalog/elkayam/` and `public/catalog/supplier/asclean/`
- [ ] Crop script produces `_thumb.webp` and `_full.webp` per product
- [ ] Crop status logged per item (`ok | needs_review | download_failed`)
- [ ] `metadata.images.thumb` and `metadata.images.full` populated on matched items
- [ ] Old `/catalog/safety/products/` references marked as `image_needs_replacement`
- [ ] Original files preserved alongside cropped files

### Phase B — Supplier import
- [ ] All accessible supplier categories scraped and products extracted
- [ ] Each supplier product inserted as `is_active = false` with `source_type: "external_supplier_reference"`
- [ ] No supplier product overwrites or downgrades an existing active Elkayam item
- [ ] Duplicates detected and logged rather than silently merged
- [ ] `review_state: "needs_review"` on all supplier imports
- [ ] Upsert is idempotent — safe to re-run

### Phase C — `/catalog` UI upgrade
- [ ] ItemCard shows product image thumbnail where `metadata.images.thumb` exists
- [ ] ItemCard shows source badge (אלקיים / מקור חיצוני / ידני)
- [ ] Clicking a product card opens the existing edit flow (switches to table view + inline edit)
- [ ] Internal buttons (edit, delete, toggle) do not bubble click to card
- [ ] Card keyboard accessible (Enter/Space triggers edit)
- [ ] Detail panel uses `images.thumb` before legacy `images.product`
- [ ] Table view unchanged
- [ ] Filters unchanged
- [ ] No new edit modal created

### Phase D — `/catalog-showcase`
- [ ] Route `/catalog-showcase` loads without error
- [ ] "קטלוג חזותי" in sidebar under "בנוסף"
- [ ] Hero renders with Elkayam dark theme
- [ ] Category grid shows only categories with items
- [ ] Clicking category filters product grid
- [ ] "הכל" shows all items
- [ ] Status/source filter pills work
- [ ] "הסתר לא פעיל" toggle works
- [ ] Search filters name + category + description
- [ ] Images use `metadata.images.thumb` — no hardcoded old paths
- [ ] Broken image falls back to emoji
- [ ] Inactive supplier cards show at opacity-55 with all three badges
- [ ] Product detail modal opens on card click
- [ ] Modal shows image (thumb → full fallback), name, category, badges, description, specs, source, edit button
- [ ] Edit button navigates to `/catalog`
- [ ] Modal closes on backdrop click and Escape
- [ ] Desktop: 6 cat cols, 4 prod cols; mobile: 2 cat cols, 1 prod col
- [ ] TypeScript clean
- [ ] No console errors or hydration warnings
- [ ] Existing `/catalog` unchanged in structure/function

---

## 9. Risks and Limitations

| Risk | Mitigation |
|---|---|
| asclean.co.il blocks scraping | Report which pages were inaccessible; store what was reachable; note remainder for manual download |
| Supplier images return 403 when downloaded | Mark as `crop_status: "download_failed"`; use placeholder; do not hotlink |
| Hebrew product name matching is fuzzy | Use normalized comparison (strip diacritics, extra spaces); when uncertain, insert as `needs_review` rather than silently merging |
| Image crop quality is low for complex backgrounds | Keep `_original`, set `crop_status: "needs_review"`, present conservative crop; do not delete originals |
| Existing `/catalog` edit behavior change breaks workflows | Card click only triggers edit in card view; table view row click behavior is unchanged |
| Large number of INACTIVE supplier items clutters catalog | Default filter in management catalog can default to `filterActive: "active"` (currently defaults to "all"); add "הסתר לא פעיל" toggle if needed |
