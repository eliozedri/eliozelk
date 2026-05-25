# Product Catalog — Active / Inactive Status (Business Logic)

**Status:** Live (shipped 2026-05-24). This is a core catalog business rule, not a UI detail.
**Implementation spec:** `docs/superpowers/specs/2026-05-24-active-inactive-products-design.md`

## Principle

Every catalog product carries an **activity status**. The status — not deletion — controls what is
exposed to customers and operational selection flows.

- **Active (`פעיל`)** — the product may appear in the sales site / sales catalog and any
  customer- or order-facing selection (order creation, Telegram ordering, agent orderable pools).
- **Inactive (`לא פעיל`)** — the product must **not** appear to the customer on the sales site or in
  active selling/selection views. It is hidden from operational exposure **by default**.
- **Awaiting review (`ממתין לבדיקה`)** — a sub-state of inactive used for imported/scraped products
  (`metadata.review_state = "needs_review"`) that have not yet been reviewed and approved.

## Rules

1. An inactive product **stays in the system** — for internal management, history, data, future editing,
   and re-activation. Changing status is how we control customer-facing visibility **without deleting data**.
2. **Default-out exposure:** any external/customer channel — sales site, sales catalog, order bot,
   future customer catalog or additional sales channels — shows **active products only** by default.
   New channels must preserve this rule.
3. **No data loss:** status changes never delete products, never drop history, and never cascade.
   Historical orders keep displaying products that later became inactive (orders store a name/unit snapshot).
4. **Activation = human approval.** Activating a product (single or bulk) clears the `needs_review` flag.
   Deactivating later does **not** re-flag it as awaiting-review.
5. **Out of stock ≠ inactive.** Out of stock is an *active* product with no current inventory; it stays in
   the product world (may show a stock badge). Inactive means "not part of the active operational catalog."
   These two concepts must never be conflated.

## Where this is enforced (single source of truth)

- Field: `catalog_items.is_active` (boolean) → `CatalogItem.isActive`. No duplicate status fields exist.
- Shared selector: `src/lib/catalog/sellable.ts` — `isSellable(item)` (operational/sellable pool) and
  `statusBucket(item)` (`active` / `needs_review` / `inactive`). Reuse these; do not re-implement filtering.
- Bulk status change: Postgres RPC `set_catalog_active(p_ids, p_active)` (clears `needs_review` on activate).
- Consumers that already filter to active only: order creation (`OrderForm/MiscSection` via `isSellable`),
  Telegram (`lib/teamBot/catalog.ts` + intake re-validation), Jarvis catalog API, agent orderable pools,
  and the sales site (`/sales-site`).
- Management UI: `/catalog` (status chips: כל המוצרים / פעילים / ממתינים לבדיקה / לא פעילים, bulk
  activate/deactivate, status pill).
