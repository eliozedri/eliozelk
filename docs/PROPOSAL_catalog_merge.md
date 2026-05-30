# Catalog source-of-truth — findings + safe merge path (investigation; no code applied)

Audit 2026-05-30. **No catalog code/data changed. No pricing touched** (prices stay `0`
where unconfirmed, by direction).

## How it actually works (proven)
Both catalog pages are **two display components over the SAME data**:
- `/catalog` → `components/Catalog` ("קטלוג מוצרים ופריטים") — **management** view.
- `/catalog-showcase` → `components/CatalogShowcase` ("קטלוג חזותי") — **visual gallery**.
- Both consume `useCatalog()` via `CatalogContext` → the single table **`catalog_items`**.
- Same `tabId: "catalog"` (one permission tab) for both sidebar links.

### Answers to the 10 questions
1. **Tables:** both use **`catalog_items`** (via `useCatalog`). `Catalog` additionally reads `suppliers`.
2. **Same records?** **Yes — identical records.** No duplicate data; only duplicate UI.
3. **Separate components over same data?** **Yes.**
4. **Closer to source-of-truth?** Neither "owns" data — `catalog_items`/`useCatalog` is the source. `Catalog` is the canonical **editor**.
5. **Unique useful UI:** `Catalog` = image upload/edit (`/api/catalog/upload-image`), supplier link, active/inactive, category/stock/price fields, deep-link `?edit=`. `CatalogShowcase` = gallery cards + product modal (read-only, presentation).
6. **Duplicate/dead/legacy:** no dead data; `CatalogShowcase` is a read-only re-presentation of the same items (UI duplication, not logic duplication). (`holographic-catalog/` exists as separate experimental assets, not a route here.)
7. **Routes:** `/catalog`, `/catalog-showcase` (both sidebar). `/sales-site` is a **separate** public-style sales view (out of scope).
8. **Who reads catalog data:** order creation (`OrderForm/MiscSection`), `jarvis/catalog` API, `Warehouse`, `inventory-agent`, `ceoManager` — **all read `catalog_items`** (directly or via context). None depend on the *showcase component* specifically.
9. **Risk of deleting/redirecting one page:** **Low for the data** (shared table). The only couplings to `/catalog-showcase` are the **sidebar link** and possibly bookmarks; redirecting it needs the sidebar updated. No order/bot/inventory flow imports `CatalogShowcase`.
10. **Safest merge path:** consolidate UI, keep data as-is (below).

## Recommended merge path (staged, non-destructive)
1. **Add a view-mode toggle to `/catalog`** (the management page): `list/table` ⇄ `gallery` ⇄ `detail`. Reuse `CatalogShowcase`'s gallery rendering as the "gallery" mode inside `Catalog` (both already read the same context — low risk).
2. **Keep `/catalog-showcase` working but redirect it** to `/catalog?view=gallery` (Next redirect or a thin client redirect) and update the sidebar to a single "קטלוג" entry with the toggle. No deletion of the showcase component yet — it's reused as the gallery renderer.
3. **Verify** the four consumers (orders/bot/inventory/finance) still read `catalog_items` unchanged (they don't import the page components, so they're unaffected).
4. Only after the toggle is proven, **deprecate** the standalone `/catalog-showcase` route.

**Pricing:** unchanged — the catalog keeps `default_price`/`price` fields as-is (may be `0`); the merge must NOT compute or invent prices. Pricing/tariffs remains a future business-calibration task.

## Status
Investigation complete; **no code applied** this pass (merge is a real UI change + a sidebar/route change → implement on your go-ahead). This is the proof you asked for before merging.
