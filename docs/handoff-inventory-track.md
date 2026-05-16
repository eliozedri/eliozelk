# Handoff: Inventory / Operations Track — Phases 3.0–3.6

**Commit:** `d850ec5` | Branch: `main` | Date: 2026-05-16

---

## 1. Phases Completed

| Phase | Title | Commits |
|-------|-------|---------|
| 3.0 | Inventory Foundation & Warehouse Agent MVP | `d1bd00f` |
| 3.1 | Reservation sync + Warehouse availability badges | `aabbd70`, `7d1f7d1` |
| 3.2 | Consumption & field diary reconciliation | `f9ee3c9`, `dbc54cd` |
| 3.3 | Returns, delivery notes foundation, partial consumption | `40a1b5c` |
| 3.3 QA | Bug fixes from QA audit | `8dc53b1` |
| 3.4 | Purchase recommendation engine | `fe96ba2` |
| 3.5 | Inventory system QA hardening (4 bugs fixed) | `9e98b3f` |
| 3.6 | Billing readiness gate for inventory orders | `d850ec5` |

---

## 2. Tables Added / Changed

### New tables (5 migrations: `20260518`–`20260522`)

| Table | Purpose | Key constraint |
|-------|---------|----------------|
| `suppliers` | Supplier directory | — |
| `inventory_movements` | Immutable append-only stock ledger | No UPDATE/DELETE RLS |
| `inventory_reservations` | Per-order stock holds | `uq_active_inventory_reservation (item_id, order_id, order_item_key) WHERE status='active'` |
| `inventory_consumptions` | Field reconciliation records | `uq_active_inventory_consumption (order_id, order_item_key) WHERE status IN ('pending_review','consumed')` |
| `delivery_notes` | Incoming goods headers | — |
| `delivery_note_items` | Line items per delivery note | `uq_delivery_note_item_approved (delivery_note_id, item_id) WHERE status='approved' AND item_id IS NOT NULL` |
| `purchase_recommendations` | Internal procurement planning | `uq_purchase_recommendation_active (item_id, recommendation_type) WHERE status NOT IN ('dismissed','converted_to_order_later','resolved')` |

### Existing tables changed

| Table | Columns added |
|-------|--------------|
| `catalog_items` | `current_quantity`, `minimum_quantity`, `reserved_quantity`, `supplier_id` |
| `work_orders` | `warehouse_required` (bool), `warehouse_status` (text) |

### RLS pattern
All inventory tables use `authenticated` = SELECT only; `service_role` = full access. `inventory_movements` has **no** UPDATE/DELETE policy by design — it is the immutable ledger.

---

## 3. Main APIs Added

All routes under `/api/inventory/`:

| Route | Methods | Purpose |
|-------|---------|---------|
| `/sync-reservations` | POST | Upsert active reservations for an order from its row data |
| `/consume-order` | POST | Reconcile field consumption against an approved work diary |
| `/return-from-field` | POST | Partial return of consumed items back to stock |
| `/delivery-notes` | GET, POST | List / create delivery note headers |
| `/delivery-notes/[id]` | GET, PATCH | Get / update a delivery note (add items, update counts) |
| `/delivery-notes/[id]/approve` | POST | Approve a delivery note → writes `inventory_movements`, updates `catalog_items.current_quantity` |
| `/purchase-recommendations` | GET, POST | List active recommendations / create manual recommendation |
| `/purchase-recommendations/[id]` | PATCH | Update status (`dismissed`, `approved_internal`, `resolved`, etc.) |

Also added: `/api/agents/inventory-agent/scan` — full inventory scan (stock levels, reservations, consumptions, purchase recommendations).

---

## 4. Main UI Areas Changed

### Warehouse (`/warehouse`) — 5-tab layout

| Tab | Content |
|-----|---------|
| הזמנות | Orders requiring warehouse prep; per-order reconciliation status + "בצע התאמה" button |
| מלאי | Catalog item cards with live quantities (current / reserved / available / minimum); low-stock badges |
| תעודות משלוח | Delivery notes CRUD; item-level count entry; approve → receive flow |
| החזרות | Consumed-items list per order; partial return form |
| המלצות רכש | Auto-generated and manual purchase recommendations; dismiss / approve-internal actions |

### Accounting (`/accounting`) — billing tab

- New **מלאי** column in the pending-billing table: `✓ מלאי` (reconciled) / `! מלאי` (pending) / `? מלאי` (unmapped)
- `getBillingBlockers()` now returns inventory blockers:
  - `"נדרשת התאמת מלאי לפני העברה לחיוב"` — mapped items, no consumption
  - `"נדרש מיפוי פריטי מלאי לפני חיוב"` — warehouse_required but no catalogItemId set
- `ApproveToBillingModal` was already blocker-aware; no modal changes needed

---

## 5. Agent Scans Updated

| Agent | What was added |
|-------|---------------|
| `inventory-agent` | Full scan: negative/low/out-of-stock, over-reserved, consumption mismatches, unmapped delivery note items; upserts purchase recommendations; resolves stale exceptions |
| `billing-collections-agent` | Loads `inventory_consumptions`; flags `inventory_reconciliation_missing` exceptions+tasks for warehouse orders with approved diary but no consumption |
| `ops-orchestrator` | Loads `inventory_consumptions`; flags `missing_inventory_reconciliation` exceptions for completed warehouse orders without reconciliation |

---

## 6. Chat Intents Added

The `inventory` intent (pre-existing in Phase 3.0) was extended across phases with keywords and sub-query branches:

- **Reservations** — active stock holds, per-item breakdown
- **Consumptions** — reconciliation status, mismatches, pending reviews
- **Returns** — movement records filtered by `movement_type='return_from_field'`
- **Delivery notes** — recent notes and their status
- **Purchase recommendations** — active/dismissed/critical recommendations
- **General stock** — per-item quantities and low-stock list

The `billing` intent was extended in Phase 3.6:
- New keywords: `"חסום"`, `"חסומות"`, `"חסומות.*מלאי"`, `"התאמת.*מלאי.*חיוב"`
- When query matches, returns list of orders blocked by `inventory_reconciliation_missing` exceptions

---

## 7. Safety Rules Still in Place

These constraints are enforced by code and must not be removed:

1. **No external messages** — no WhatsApp, email, or Telegram is sent anywhere in this track
2. **No supplier purchase orders** — recommendations reach `approved_internal` status only; no PO generation
3. **No invoice generation** — billing status transitions stop at `approved`; invoicing is manual
4. **No automatic billing override** — inventory blockers cannot be bypassed without manual action
5. **Immutable movements ledger** — `inventory_movements` has no UPDATE/DELETE RLS; no code path deletes or edits movement rows
6. **No CFO/full finance** — `cfo-agent` scan is separate and unchanged by this track
7. **No PDF plan analysis** — not implemented
8. **Idempotent upserts** — all reservation/consumption/recommendation writes use SELECT-then-INSERT (partial unique indexes make Supabase `.upsert()` unsafe here)

---

## 8. Known Limitations

| Area | Limitation | Deferral |
|------|-----------|----------|
| Billing override | No manual "skip inventory check" for master/office_manager role | Phase 3.7 |
| Supplier messaging | Recommendations have no "send to supplier" action | Future |
| Stock history | No UI to browse `inventory_movements` ledger | Future |
| Multi-unit conversions | Quantities assumed same unit throughout; no UOM conversion | Not planned |
| Delivery note supplier linkage | Supplier field is free-text on delivery notes; not FK-linked to `suppliers` table | Minor |
| Consumption after diary unapproval | If a diary is un-approved after reconciliation, the consumption record remains; no auto-reversal | By design — requires manual reversal |
| Purchase recommendation auto-conversion | `approved_internal` status does not auto-create a PO or supplier contact | By design |

---

## 9. Recommended Next Track

**Track 4 — Supplier & Procurement Operations**

Building on the purchase recommendation layer already in place:

1. Supplier management UI (extend existing `suppliers` table)
2. Purchase order generation from `approved_internal` recommendations
3. Delivery note ↔ purchase order linkage (close the receive loop)
4. Supplier contact drafts via WhatsApp (currently forbidden — enable with explicit guard)
5. Reorder-point automation (inventory-agent scan already generates the trigger data)

Alternatively, if billing is the priority: **Track 4 — Billing Hardening**:
1. Phase 3.7 — manual inventory reconciliation override (master role + reason + activity log)
2. Invoice PDF generation
3. Billing export improvements

---

## 10. Current Commit Hash

```
d850ec5
```

Full log range for this track:
```
git log d1bd00f^..d850ec5 --oneline
```
