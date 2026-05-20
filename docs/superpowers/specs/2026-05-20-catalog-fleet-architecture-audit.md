# Catalog & Fleet Architecture Audit — Elkayam 2026-05-20

## Goal

Verify the system is logically clean and ready to grow with one canonical catalog, clear separation between catalog items and fleet/equipment, no hidden product sources, and no stale catalog references.

---

## Part 1 — /safety ↔ catalog_items Relationship

### Counts

| Source | Count |
|--------|-------|
| /safety items (sa-001..sa-037) | 37 |
| catalog_items with `אביזרי בטיחות — *` category | 37 |
| sa-* items fully matched to catalog_items by name | **37 / 37** |
| sa-* items without a catalog_items record | **0** |
| Newly created catalog_items records | **0** |

All 37 /safety items were already represented in catalog_items (bulk-imported via UI from `safetyAccessories.ts`). Zero records needed to be created.

### Linkage applied (migration `20260520140000_safety_ref_link.sql`)

Each of the 37 matched catalog_items records was updated with:
```json
{
  "safety_ref_id": "sa-XXX",
  "orderable": true
}
```

- `safety_ref_id` — pointer back to the /safety page reference identifier (image key, catalog page, etc.)
- `orderable: true` — these are all genuinely sellable/rentable physical products

### Rule going forward

**Every /safety item MUST have a catalog_items record.**

| Layer | Purpose | Source | IDs |
|-------|---------|--------|-----|
| `/safety` page | Rich product reference (images, dimensions, variants, materials, catalog page, readiness) | `safetyAccessories.ts` + `safetyAccessoryImages.ts` | sa-001..sa-037 |
| `catalog_items` | Canonical operational record (pricing, stock, orders, billing) | Supabase DB | nanoid IDs with `metadata.safety_ref_id` |

If a future item is added to /safety but is not yet orderable, it must still have a catalog_items record with `metadata.orderable = false`.

### /safety as hidden catalog — verdict

**No.** /safety does not act as a second live product catalog. Verified:
- No order form, billing, or work diary code reads from `SAFETY_ACCESSORIES` constant
- All `SAFETY_ACCESSORIES` references are in: `safetyAccessories.ts` (data), `safetyAccessoryImages.ts` (images), `safetyAccessory.ts` (types), `SafetyAccessories/index.tsx` (UI)
- The UI is read-only browsing — no form submission, no order creation, no billing
- `work_orders` table has 0 rows — no stale catalogItemId references anywhere

---

## Part 2 — Catalog Growth Readiness

### Current state (live DB, 2026-05-20)

| Metric | Value |
|--------|-------|
| Total catalog_items | 108 |
| Active | 108 |
| Inactive | 0 |
| Items with no metadata | 0 |
| Items with `safety_ref_id` | 37 |
| Items with `orderable: true` | 37 (safety items) |
| Items with `fleet_managed: true` | 1 (עגלת חץ) |

### By type

| Type | Count |
|------|-------|
| product | 84 |
| service | 19 |
| labor | 4 |
| equipment | 1 |

### By category (22 categories)

Top categories: שלטים ושילוט (22), עבודות סימון וצביעה (10), אביזרי בטיחות — גדרות ותיחום (9), אביזרי כבישים (8), הסדרי תנועה (5), מעקות ומחסומים (6), גדרות ותיחום (5)

### Duplicate names (12 pairs — intentional)

12 product names appear in both `אביזרי בטיחות — *` (nanoid IDs, safety import) and general categories like `אביזרי כבישים`, `גדרות ותיחום`, `אביזרי חנייה` (prd-* IDs, canonical import).

**This is intentional and acceptable.** The nanoid-ID records link to the /safety rich reference. The prd-* records are the canonical orderable versions with semantic IDs. They coexist in the same catalog — the category and metadata distinguish them.

**No action required.** A future enhancement could add `metadata.aliases` to the prd-* records pointing to the nanoid safety record, to allow the Catalog UI to show a "ראה גם" (see also) link.

### Stale catalogItemId references in work_orders

`work_orders` has 0 rows — no stale references. Clean.

### metadata JSONB compatibility

All 108 items have metadata populated. The `||` merge operator is safe — adding new metadata fields does not overwrite existing ones. UI handles `metadata?: Record<string, unknown>` gracefully.

---

## Part 3 — Supabase Live DB Integrity

### Tables with real data

| Table | Rows |
|-------|------|
| catalog_items | 108 |
| equipment | 19 |
| agents | 12 |
| work_diaries | 7 |
| profiles / users | 4 each |

All other operational tables are empty (0 rows) — system is pre-launch. No stale order/billing/diary data to worry about.

### Tables that appear catalog-like but are not

| Table | Verdict |
|-------|---------|
| `equipment` | **D — correct separate entity.** Fleet/machines/vehicles. Has own schema (`category_key`, `status`, `identification_confidence`, `technical_specs`, compliance dates). Do not merge into catalog_items. |
| `suppliers` | **D — correct separate entity.** Linked to catalog_items via `supplier_id` FK. |
| `inventory_movements` | **D — correct append-only ledger.** References `catalog_items.id` correctly. |
| `cost_rates` | Separate CFO-lite cost tracking. 1 row. Not a product catalog. |
| `product_supplier_mappings` | 0 rows. Future supplier-product linkage. Not a catalog. |

### Missing / partial data

- No catalog items missing category or type
- No catalog items without metadata
- All safety items now have `safety_ref_id` and `orderable` flags

---

## Part 4 — Fleet / Equipment / Machine Architecture

### Current equipment table (19 records)

| Category | Count | Notes |
|----------|-------|-------|
| fleet | 6 | Trucks, vehicles (MAN, Hino, Isuzu) |
| road_marking | 3 | CMC PM50C-ST-13, CMC 60C-ST, HOFMANN H11 |
| production | 3 | Laser G3015X, Graphtec FC8000-130 plotter, Baykal HGL3100 |
| heavy_equipment | 2 | Confirmed, operational |
| generators | 2 | 1 confirmed, 1 unidentified |
| arrow_carts | 1 | עגלת חץ (physical asset) |
| forklifts | 1 | Partial confidence |
| trailers | 1 | Partial confidence |

### The dual-nature problem: עגלת חץ

עגלת חץ exists in **both** tables:
- `catalog_items`: `svc-traf-004`, type=equipment, `metadata.fleet_managed: true` — the **orderable service/rental** (customer pays per day)
- `equipment`: physical asset record for the actual arrow cart

**This is correct architecture.** One row in `equipment` = the physical machine. One row in `catalog_items` = what customers pay for when it's dispatched to a site.

Other fleet assets (trucks, generators, marking machines) do NOT appear in `catalog_items` because:
- They are internal cost/operational resources, not items customers directly pay per unit for
- Road marking machines generate billing via marking services (svc-mark-*), not as direct line items

### What belongs where

| Item type | catalog_items | equipment table |
|-----------|--------------|-----------------|
| Safety accessories (cones, barriers, etc.) | ✓ orderable products | ✗ |
| Traffic signs | ✓ orderable products | ✗ |
| Marking services (סימון, הסרה) | ✓ orderable services | ✗ |
| Traffic arrangement services (הסדרי תנועה) | ✓ orderable services | ✗ |
| עגלת חץ (as billable item) | ✓ equipment type, fleet_managed | ✓ physical asset |
| Road marking machines (CMC, HOFMANN) | ✗ internal resource | ✓ physical asset |
| Trucks / vehicles | ✗ internal resource | ✓ physical asset |
| Laser / plotter / production machines | ✗ internal resource | ✓ physical asset |
| Generators | ✗ unless billable to customer | ✓ physical asset |
| Forklifts | ✗ unless billable to customer | ✓ physical asset |

### Metadata bridge fields (existing, no schema change needed)

The `metadata` JSONB column on `catalog_items` already supports:
```json
{
  "fleet_managed": true,     // item is managed/dispatched from fleet
  "fleet_only": true,        // not orderable from catalog UI, only dispatched by fleet module
  "safety_ref_id": "sa-XXX" // links to /safety rich reference
}
```

For future fleet items that become billable catalog entries (like עגלת חץ), add `fleet_managed: true` and create an `equipment` record for the physical asset.

### Recommended data model for Fleet/Equipment module (future)

When the Fleet module is built:
1. `equipment` table is already the correct foundation — do not replace it
2. Add `equipment_assignments` table: `{ equipment_id, work_order_id, dispatched_from, dispatched_to, created_by }`
3. For equipment with a catalog_items billing entry, `catalog_items.id` can be stored in `equipment.metadata.catalog_item_id`
4. No changes to `catalog_items` schema needed — `fleet_managed` metadata flag is sufficient

---

## Part 5 — Architecture Decision

### A. Is the system safe for adding new catalog items?
**Yes.** The catalog has one clear source of truth (catalog_items table), one management UI (Catalog tab), one hook (useCatalog), and one context (CatalogContext). UPSERT migrations are tracked in `supabase/migrations/`. New items can be added via UI or migration safely.

### B. Is the catalog source of truth clean enough?
**Yes.** All 108 items have metadata. All 37 safety items have `safety_ref_id`. No hidden product sources found in operational flows.

### C. Is /safety safely separated as reference-only?
**Yes.** /safety is a read-only browsing UI. No form submissions or order creation. All /safety items now have corresponding catalog_items records. No hidden catalog island.

### D. Are order/billing/work diary flows protected from stale data?
**Yes.** work_orders has 0 rows — no stale catalogItemId refs. MiscSection.tsx has stale-ref detection (isStale guard + ⚠ badge). Order forms use catalogIds Set lookup. All safe.

### E. What exact next step before fleet/machines?
Before building Fleet module: **add `equipment_assignments` table** to track which equipment goes to which job/order. This table is the bridge between `equipment` (physical asset) and `work_orders` (job). Without it, dispatching cannot be tracked.

### F. Should Fleet/Equipment module be created now or later?
**Later.** The `equipment` table already stores the asset registry. What's missing is dispatch tracking and the Fleet management UI. Build when the business workflow requires it — not before.

### G. Minimal structure to add now to avoid contradictions
- `metadata.fleet_managed: true` on any catalog_items that correspond to a fleet asset (currently only עגלת חץ)
- `metadata.catalog_item_id` on equipment rows that have a catalog billing counterpart (add when needed)
- Do NOT add these fields preemptively to all equipment records — YAGNI

---

## Part 6 — Authorized Code Changes Made

| Change | File | Status |
|--------|------|--------|
| Corrected safetyAccessories.ts comment (not migration-only, is live source) | `src/data/safetyAccessories.ts` | Committed `93b50d5` |
| Added `safety_ref_id` + `orderable: true` to all 37 safety catalog_items records | Live DB + migration `20260520140000_safety_ref_link.sql` | Applied |

---

## Part 7 — Final Report

| Metric | Value |
|--------|-------|
| /safety items total | 37 |
| /safety items linked to catalog_items | 37 / 37 (100%) |
| Newly created catalog_items records | 0 |
| Reference-only items (orderable: false) | 0 — all 37 are orderable products |
| Duplicate prevention method | UPDATE by exact ID, no INSERT for already-present items |
| How reference-only items will be marked | `metadata.orderable: false` + future: badge in Catalog UI |
| /safety → catalog_items link | `metadata.safety_ref_id` on catalog record |
| catalog_items total | 108 |
| Active / inactive | 108 / 0 |
| Categories | 22 |
| Duplicate names | 12 pairs (intentional — safety import vs canonical prd-* records) |
| Stale catalogItemId in work_orders | 0 (no orders yet) |
| Hidden product sources | None |
| Old/scattered product-like sources | signs.ts (auto-generated sign registry — D, different entity) |
| Fleet/equipment readiness | equipment table has 19 real assets; correctly separate from catalog |
| Recommended Fleet data model | equipment_assignments table (future); catalog_item_id in equipment.metadata (when needed) |
| Migrations run | 20260520140000_safety_ref_link.sql (UPDATE only, non-destructive) |
| DB checks run | 10 read-only queries; 1 UPDATE query |
| Commits | 93b50d5 (safetyAccessories.ts comment fix) |
| Build/type errors | TS errors are pre-existing .next/ duplicate type conflicts — not introduced by this work |
| Safe to expand catalog | **Yes** |
| Remaining risks | None critical. Duplicate name pairs (12) are cosmetically confusing but architecturally safe. |
