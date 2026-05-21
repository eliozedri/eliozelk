# Spec: Visual Catalog Page — "קטלוג חזותי"

**Date:** 2026-05-21  
**Status:** Approved — ready for implementation planning  
**Scope:** New `/catalog-showcase` route only. Does NOT touch the existing `/catalog` management screen.

---

## 1. Problem

The existing `/catalog` page is a management tool: table/card view, edit forms, filters, inventory. It is not suitable for browsing products visually. We need a separate page that presents the catalog as a **visual product catalog website** — like a professional safety-equipment catalog landing page — using Elkayam branding and the existing product data.

---

## 2. Goals

- Build a new internal page at `/catalog-showcase` styled as a visual product catalog.
- Present existing `catalog_items` data via a category grid → product grid browsing flow.
- Support active / inactive / source badge display on every product card.
- Open a product detail modal on card click.
- Add the page to the sidebar under "בנוסף" next to the existing catalog link.
- Foundation for a future public-facing sales catalog.

---

## 3. Reference Inspiration

**Supplier reference:** `https://www.asclean.co.il/catalog-safety-equipment/`  
Structure extracted:
- Main page = grid of category cards (title + icon + CTA)
- Clicking a category → drill-down to product list
- Product cards: image, name, CTA button

**Our adaptation:**
- Single-page SPA (no drill-down routes): category card click filters product grid inline
- Hero above categories
- Product detail opens in modal (no separate page)
- Elkayam dark theme, not supplier branding

---

## 4. Data Source

**Single source of truth:** existing `catalog_items` Supabase table via `useCatalogContext()`.  
No new tables, no new migrations needed for Phase 1.

### Source classification (metadata.sources[0].type → badge)

| `sources[0].type` | Badge label | Badge color |
|---|---|---|
| `website` | אלקיים | blue |
| `company_profile` | אלקיים | blue |
| `seed` | אלקיים | blue |
| `existing_catalog` | אלקיים | blue |
| `manual` | ידני | gray |
| `external_supplier_reference` | מקור חיצוני | amber |
| anything else / missing | — | no badge |

### Status classification (item.isActive → badge)

| `isActive` | Badge | Color |
|---|---|---|
| `true` | ● פעיל | green |
| `false` | ○ לא פעיל | gray |

### Review state (metadata.review_state)

| value | Badge |
|---|---|
| `needs_review` | דורש בדיקה (red) |
| absent | no badge |

### Image resolution order (per card)
1. `metadata.images.product` — if present and non-empty string → use it
2. Category emoji fallback from `CATEGORY_ICONS` map
3. Generic placeholder icon

---

## 5. Category Mapping

The category grid is built by **grouping `catalog_items` by their `category` field** and applying a display label + emoji from a static `SHOWCASE_CATEGORIES` config array. Categories with no matching items are hidden.

**Static config entries** (ordered, with emoji and display label):

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
];
// Catch-all "אביזרי בטיחות — ..." categories not in the list above map to:
// { label: "אביזרי בטיחות נוספים", icon: "🛡️" }
```

**Runtime behavior:**
- Filter `SHOWCASE_CATEGORIES` to those that have at least 1 matching item.
- Append a synthetic "אביזרי בטיחות נוספים" entry collecting all `אביזרי בטיחות —` subcategories not explicitly listed.
- Append a "הכל" entry at position 0.
- Display count badge per category (total items, regardless of active state).

---

## 6. Page Structure

### Route & file
- Route: `/catalog-showcase`
- File: `src/app/catalog-showcase/page.tsx` (thin shell, imports `<CatalogShowcasePage />`)
- Component: `src/components/CatalogShowcase/index.tsx`

### Sidebar
- Add to `NAV_SECTIONS` in `src/components/Sidebar.tsx` under "בנוסף":
  ```ts
  { tabId: "catalog", href: "/catalog-showcase", label: "קטלוג חזותי", icon: <LayoutGrid />, matchFn: (p) => p.startsWith("/catalog-showcase"), noBadge: true }
  ```
- **Also fix the existing `/catalog` entry's `matchFn`** to `(p) => p === "/catalog" || (p.startsWith("/catalog") && !p.startsWith("/catalog-showcase"))` so it doesn't highlight when on `/catalog-showcase`.
- Reuses existing `tabId: "catalog"` — no new auth changes needed.

### Sections (top to bottom)

#### A. Hero
- Background: `linear-gradient(135deg, #1a2d4a, #0d1b2e)`
- Badge: `🚧 ELKAYAM CATALOG` in blue pill
- H1: `קטלוג מוצרי בטיחות ותנועה` with `בטיחות ותנועה` in `#f59e0b`
- Subtitle: `פתרונות הסדרי תנועה, סימון כבישים, שילוט, אביזרי בטיחות ואביזרי דרך`
- Search input (dark glass style)
- Filter pills: `הכל | ● פעיל | ○ לא פעיל | אלקיים | מקור חיצוני`
- Stats bar: total items, total categories, items with images

#### B. Category grid
- Section label: `קטגוריות מוצרים`
- Grid: `grid-cols-6` desktop → `grid-cols-4` tablet → `grid-cols-3` mobile → `grid-cols-2` small
- Each card: emoji icon + label + count
- Selected state: blue border + blue text
- "הכל" is default selected

#### C. Product grid
- Section header: selected category name + item count badge
- Grid: `grid-cols-4` desktop → `grid-cols-3` tablet → `grid-cols-2` small → `grid-cols-1` mobile
- Each card: **Style C** (image top, badges row, description, footer with unit + "פרטים ←" button)
- Inactive cards: `opacity-55`
- Images: lazy-loaded, `object-cover`, fallback to emoji placeholder
- Empty state: "לא נמצאו מוצרים בקטגוריה זו"

#### D. Product detail modal
- Triggered: clicking anywhere on a product card (including "פרטים ←" button)
- Contains: large image (or emoji), name, category, badges, description, specs grid, source, actions
- Actions: `סגור` + `✏ ערוך מוצר` (navigates to `/catalog` — the management page — using Next.js `router.push("/catalog")`. The existing `/catalog` management page does not accept a deep-link to a specific item in Phase 1; the user manually finds and edits the item there.)
- Closes on: backdrop click, Escape key, close button
- Accessible: `role="dialog"`, `aria-modal="true"`, focus trap

---

## 7. Component Architecture

```
src/components/CatalogShowcase/
  index.tsx          — CatalogShowcasePage (hero + category grid + product grid + modal)
  CategoryCard.tsx   — single category card (icon, label, count, selected state)
  ProductCard.tsx    — single product card (image, name, badges, description, footer)
  ProductModal.tsx   — detail modal (image, specs, badges, actions)
  constants.ts       — SHOWCASE_CATEGORIES array, badge helpers, CATEGORY_ICONS fallback map
```

All components are client components (`"use client"`).  
Data comes from `useCatalogContext()` — same hook as the management catalog.

---

## 8. Filter Logic

```ts
// Active filter chain (applied in useMemo):
items
  .filter(byCategorySelection)   // "הכל" = no filter; else exact category match + catch-all group
  .filter(byStatusPill)          // "הכל" | "active" | "inactive"
  .filter(bySourcePill)          // "הכל" | "elkayam" | "external"
  .filter(bySearchText)          // case-insensitive match on name + category + description
```

Category selection takes precedence; pills narrow within the selection.

---

## 9. Image Handling

- **Existing images**: 37 safety accessories have `metadata.images.product` set to `/catalog/safety/products/pXX-YY.jpg`. These load immediately.
- **Other products**: no images yet → emoji fallback.
- All `<img>` elements include `onError` fallback to hide and show emoji placeholder.
- `loading="lazy"` on all product images.
- Alt text: Hebrew `item.name`.
- **No external URLs hotlinked** — all served from `/public/`.

---

## 10. Responsive Breakpoints

| Viewport | Category cols | Product cols |
|---|---|---|
| `≥1280px` (desktop) | 6 | 4 |
| `≥1024px` (laptop) | 4 | 3 |
| `≥768px` (tablet) | 3 | 2 |
| `<768px` (mobile) | 2 | 1 |

Modal: full-screen on mobile (`max-w-full`, bottom-sheet style), centered on tablet+.

---

## 11. RTL / Hebrew Requirements

- `dir="rtl"` on the page root.
- All text is Hebrew.
- Category grid wraps naturally RTL.
- Badges flow RTL.
- Modal closes button (×) on left side (logical start in RTL = right visually… no, use `start` not `left` for padding/margin).
- Filter pills use `flex-wrap`.

---

## 12. Navigation Integration

No new `TabId` is needed. The new page shares `tabId: "catalog"` which is already permitted for relevant roles. Both `/catalog` and `/catalog-showcase` will show as active when navigating between them (fine — they are sibling tools in the same section).

If needed in future, split into a dedicated `TabId: "catalog-showcase"` — but out of scope for Phase 1.

---

## 13. What Is NOT in Scope for This Phase

- Supplier catalog scraping / import (Phase 2)
- Downloading / cropping new product images (Phase 2)
- External `source_type: "external_supplier_reference"` products (Phase 2 adds them)
- Upgrade to existing `/catalog` management card view (parallel task)
- Click-to-edit behavior on `/catalog` card view (parallel task)
- E-commerce / checkout
- Public-facing deployment of this page

---

## 14. Files to Create / Change

| File | Action |
|---|---|
| `src/app/catalog-showcase/page.tsx` | Create |
| `src/components/CatalogShowcase/index.tsx` | Create |
| `src/components/CatalogShowcase/CategoryCard.tsx` | Create |
| `src/components/CatalogShowcase/ProductCard.tsx` | Create |
| `src/components/CatalogShowcase/ProductModal.tsx` | Create |
| `src/components/CatalogShowcase/constants.ts` | Create |
| `src/components/Sidebar.tsx` | Edit — add nav item |

No database changes. No migration files. No new API routes. No changes to `/catalog` or `CatalogPage`.

---

## 15. Acceptance Criteria

- [ ] `/catalog-showcase` route loads without error
- [ ] "קטלוג חזותי" appears in sidebar under "בנוסף"
- [ ] Hero section renders with correct Elkayam styling
- [ ] Category grid shows only categories that have items
- [ ] Clicking a category filters the product grid
- [ ] "הכל" shows all products
- [ ] Status/source filter pills work
- [ ] Search text filters across name + category + description
- [ ] Product cards show image where `metadata.images.product` exists
- [ ] Broken image falls back to emoji placeholder
- [ ] Inactive products show at opacity-55 with correct badges
- [ ] Clicking a product card opens detail modal
- [ ] Modal shows name, category, badges, description, specs, source, edit button
- [ ] Modal closes on backdrop click and Escape key
- [ ] Desktop grid: 6 category cols, 4 product cols
- [ ] Mobile: 2 category cols, 1 product col
- [ ] TypeScript compiles without errors
- [ ] No console errors or hydration warnings
- [ ] Existing `/catalog` page unchanged
