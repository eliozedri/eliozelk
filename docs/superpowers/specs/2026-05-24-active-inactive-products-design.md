# Active / Inactive Product Status — Design Spec

**Date:** 2026-05-24
**Status:** Approved (design phase)
**Area:** Product catalog (`catalog_items`), order creation, Telegram, Jarvis/agents, new "אתר מכירה" tab

---

## 1. Problem

~137 products were imported/scraped into the catalog and entered the system **inactive** and marked
`metadata.review_state = "needs_review"`. The Catalog Manager needs a fast, reliable, controlled way to
**review the imported batch and activate selected products in bulk**, and to manage any product's
active/inactive state going forward.

A reverse-audit (see §2) shows the underlying field and most filtering already exist. This spec closes the
real gaps rather than rebuilding existing behavior.

## 2. Audit findings (what already exists)

**Single canonical field — no duplication.** `catalog_items.is_active` (boolean) → `CatalogItem.isActive`
is the one operational active/inactive flag. None of `status`, `product_status`, `enabled`, `disabled`,
`archived`, `deleted`, `visible`, `visibility`, `availability`, `available_for_order` exist on the catalog.
**We reuse `is_active`. We do not add a new field.**

**Stock is already separate.** `current_quantity` / `minimum_quantity` / `reserved_quantity` track inventory.
"Out of stock" is therefore already a distinct concept from "inactive" and must stay that way.

**Import marker exists.** `metadata.review_state = "needs_review"` marks the imported batch. Live DB state at
spec time: 245 items total — 108 active (no review_state), 137 inactive (all `needs_review`),
12 active with `image_needs_replacement` (unrelated to this feature).

**Already wired and working:**
- `useCatalog.toggleActive(id)` — optimistic + persist + rollback.
- `/catalog` (`src/components/Catalog/index.tsx`) — per-row toggle (השבת/הפעל), status badge, edit-modal
  activate/deactivate, dimmed inactive rows, `filterActive` dropdown (all/active/inactive).
- Order creation — `OrderForm/MiscSection.tsx` filters `if (!item.isActive) return false`. This one
  component backs the misc / signage / accessory / service selectors. (Signs in `SignTable`/`SignRow` are
  free-text sign-code rows, not catalog products.)
- Telegram — `lib/teamBot/catalog.ts` enforces `eq('is_active', true)` on every read; `intake.ts`
  re-validates `is_active` at submit.
- Jarvis/agents/showcase/holographic — all filter `is_active = true` / `isActive`.

**Genuine gaps (this spec):** (1) no bulk multi-select activation; (2) no `ממתין לבדיקה` display state or
filter; (3) discoverability of status management; (4) no `אתר מכירה` tab; (5) confirm filtering is airtight
end-to-end and the future sales site reads the same pool.

## 3. Leading principles (must remain true)

- Inactive products **must not** appear in order creation.
- Inactive products **must not** appear in Telegram order/catalog flows.
- Inactive products **must not** appear in Jarvis/agent orderable product pools.
- The new `אתר מכירה` tab **must** use the same sellable/active product pool.
- **Out of stock ≠ inactive.** Inactive = not operationally used. Out of stock = active product with no
  current inventory. Never conflate them.
- Historical orders **must remain readable and must not break** when a referenced product is inactive.
- Bulk actions **only** change `is_active` and the `needs_review` review metadata — never names, images,
  prices, units, or any unrelated field.
- **No product is ever deleted** by this feature.

## 4. Data model — three derived display states (no new column)

Display state is derived from `is_active` + `metadata.review_state`:

| Display state | Hebrew label | Rule |
|---|---|---|
| Active | `פעיל` | `is_active = true` |
| Awaiting review | `ממתין לבדיקה` | `is_active = false` AND `review_state = 'needs_review'` |
| Inactive | `לא פעיל` | `is_active = false` AND `review_state ≠ 'needs_review'` |

Buckets are mutually exclusive. An **active** item always shows `פעיל` regardless of any residual
`review_state`.

Filter values (segmented chips, see §7):

| Filter | Hebrew | Predicate |
|---|---|---|
| All | `כל המוצרים` | (no filter) |
| Active | `פעילים` | `isActive` |
| Awaiting review | `ממתינים לבדיקה` | `!isActive && review_state === 'needs_review'` |
| Inactive | `לא פעילים` | `!isActive && review_state !== 'needs_review'` |

## 5. Activation semantics

**Activating** a product (single or bulk) means a human reviewed and approved it:
- set `is_active = true`
- clear `metadata.review_state` (drop the `needs_review` key)

**Deactivating** a product:
- set `is_active = false`
- **do not** re-add `needs_review`. A manually deactivated product is `לא פעיל`, never `ממתין לבדיקה`.

This guarantees a reviewed-then-activated product never returns to the awaiting-review bucket.

## 6. Database — bulk RPC

New idempotent Postgres function, added through the existing `setup-db` endpoint
(`src/app/api/setup-db/route.ts`). `SECURITY DEFINER`, granted to `authenticated`:

```sql
create or replace function set_catalog_active(p_ids text[], p_active boolean)
returns void
language sql
security definer
as $$
  update catalog_items
  set is_active  = p_active,
      updated_at = now(),
      metadata   = case when p_active then metadata - 'review_state' else metadata end
  where id = any(p_ids);
$$;

grant execute on function set_catalog_active(text[], boolean) to authenticated;
```

Notes:
- `catalog_items.id` is text (nanoid) → `p_ids text[]`.
- Single round-trip handles all 137 rows atomically and does the JSONB key removal cleanly.
- `metadata - 'review_state'` removes only that key; all other metadata (sources, images, specs) untouched.

## 7. `useCatalog` hook changes

- Add `setActiveBulk(ids: string[], active: boolean)`:
  - Optimistically update all matching rows in state (set `isActive`; when activating, also strip
    `review_state` from local `metadata`).
  - Call `db.rpc('set_catalog_active', { p_ids: ids, p_active: active })`.
  - Roll back all rows on error (snapshot originals before the optimistic write).
- Rewire single `toggleActive(id)` to call the same RPC with a one-element array, so single and bulk paths
  have identical semantics (including `needs_review` clearing on activate). Realtime UPDATE handler already
  reconciles the broadcasted rows.

## 8. `/catalog` UI changes (`src/components/Catalog/index.tsx`)

1. **Segmented status chips** (replace the plain active/inactive `<select>`), always visible with live counts:
   `כל המוצרים (245) · פעילים (108) · ממתינים לבדיקה (137) · לא פעילים (0)`. Clicking sets `filterActive`.
   `filterActive` type widens from `"all" | "active" | "inactive"` to
   `"all" | "active" | "needs_review" | "inactive"`; filter predicate updated per §4.
2. **`מצב בחירה` (selection mode) toggle.** When on, each visible row shows a checkbox, plus a
   **`בחר הכל`** control that selects all rows **currently passing the filter** (so select-all under the
   `ממתינים לבדיקה` filter selects exactly the 137). Selection is held in a `Set<string>` of ids.
3. **Sticky bulk action bar** when ≥1 selected: `הפעל נבחרים (N)` and `השבת נבחרים (N)`, each behind a
   confirm step; calls `setActiveBulk`. Clears selection on success.
4. **Status pill** gains the amber `ממתין לבדיקה` variant (distinct from gray `לא פעיל` and green `פעיל`),
   driven by the §4 derivation. Applied in the row pill and the edit modal.

No change to add/edit/delete/stock/price flows.

## 9. `אתר מכירה` tab + placeholder

- **Route:** `src/app/sales-site/page.tsx` (thin `Suspense` wrapper) → `src/components/SalesSite/index.tsx`.
- **Nav:** add a `NavItem` to the **בנוסף** section in `src/components/Sidebar.tsx`, label exactly
  `אתר מכירה`, an appropriate lucide icon (e.g. `Store`), `tabId: "catalog"` (reuse — no permission
  migration), `matchFn: (p) => p.startsWith("/sales-site")`. Existing catalog tabs are not renamed.
- **Placeholder content:** reads catalog context, shows the **sellable pool** count
  (`X מוצרים פעילים זמינים להצגה באתר המכירה`) using `isSellable` (§10), plus a `בקרוב` panel describing the
  future sales-website product-management module. Purpose: establish the *active = sellable* linkage and a
  clean seam for future e-commerce work. No product editing here yet.

## 10. Airtight filtering + shared selector

- Add `src/lib/catalog/sellable.ts` exporting `isSellable(item: CatalogItem): boolean` (currently
  `=> item.isActive`; documented as the single place to extend if visibility rules grow — but **not**
  stock, which stays separate).
- Use `isSellable` in the **operational** client selector `OrderForm/MiscSection.tsx` and in the new
  `SalesSite` page, so the future site provably reads the same pool as order creation.
- Display-only galleries (`CatalogShowcase`, `HolographicCatalog`) already filter `isActive` and are left
  as-is to avoid scope creep.

**Verification matrix (executed during implementation):**

| Surface | Mechanism | Expected |
|---|---|---|
| Order creation (misc/signage/accessory/service) | `MiscSection` → `isSellable` | inactive absent |
| Telegram catalog + submit | `teamBot/catalog.ts` `eq('is_active',true)` + intake re-validate | inactive absent |
| Jarvis catalog API / agents | `eq('is_active',true)` | inactive absent |
| Sales-site pool | `isSellable` | active only |
| Historical orders | row stores `catalogItemName`/`catalogItemUnit` snapshot in JSONB; `MiscSection` stale-link guard | renders even if product now inactive/removed |
| Activate 137 → reappear | post-activation | now selectable everywhere |

## 11. Out of scope / non-goals

- No new status column; no rename of existing fields/tabs.
- No deletion or detachment of products (including scraped ones).
- No change to names, images, prices, units, stock, or suppliers via this feature.
- No stock/inventory logic changes; out-of-stock remains separate.
- No full sales-website implementation — placeholder only.
- Role-restricting bulk actions (e.g. manager/master only) is a possible follow-up; for now bulk inherits
  existing catalog-tab access.

## 12. Risks & follow-ups

- **Large file:** `src/components/Catalog/index.tsx` is already ~1500 lines; adding selection mode grows it.
  Mitigation: keep the bulk action bar + chips as small local components within the file; extract later if
  needed.
- **Optimistic bulk rollback:** must snapshot all affected rows before the write and restore exactly on RPC
  error; partial UI/DB divergence otherwise. Realtime UPDATE events will also re-sync.
- **Permissions:** bulk activate/deactivate currently open to anyone with catalog access — acceptable now,
  flagged for follow-up.
- **`setup-db` idempotency:** function uses `create or replace`, safe to re-run.

## 13. Acceptance criteria

1. `/catalog` shows four status filters with live counts; `ממתין לבדיקה` shows the 137.
2. Selection mode + `בחר הכל` selects all filtered rows; `הפעל נבחרים` activates them in one action.
3. Activating clears `needs_review`; the item shows `פעיל` and appears in order creation, Telegram, Jarvis,
   and the sales-site pool.
4. Deactivating sets `לא פעיל` and does **not** set `needs_review`.
5. Inactive products are absent from every selector in the §10 matrix; historical orders still render.
6. No product deleted; no name/image/price/unit/stock changed by bulk actions.
7. `אתר מכירה` tab is present in בנוסף and renders the placeholder reading the active pool.
8. TypeScript + build pass.
