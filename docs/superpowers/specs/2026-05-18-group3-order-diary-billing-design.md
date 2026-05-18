# Group 3 — Structural Schema Additions: Order Items, Diary Items, Billing Items

**Date:** 2026-05-18
**Status:** Approved for implementation
**Scope:** Elkayam operations system — schema design only. No migrations in this document.
**Author:** Design session with Elio Zedri

---

## 1. Purpose

Groups 1, 2, and 4 added columns, agents, and scan logic to existing tables. Group 3 introduces three new **structured subtables** to replace ad-hoc JSONB arrays that currently serve as line-item storage. These additions are strictly additive: no existing data is migrated automatically, no JSONB columns are removed, and all agents retain dual-source fallback during the transition period.

---

## 2. Current State and Identified Gaps

### 2.1 Order line items (`work_orders.data`)

Work orders store three JSONB arrays inside `work_orders.data`:
- `signRows` — planned sign items (sign number, quantity as string)
- `accessoryRows` — warehouse-tracked items (catalog ID, quantity as string)
- `miscRows` — custom items without catalog mapping (description, optional catalog ID)

**Gaps:**
1. No per-item `unit_price` or `unit_cost` — margin cannot be computed at item level
2. No per-item `billing_status` — no way to know which line items are approved for invoicing
3. `quantity` stored as string — aggregation requires parsing and validation at query time
4. No FK to catalog — `catalogItemId` is a string reference, not a real foreign key
5. Agents cannot query or index individual order items; they must deserialize full JSONB per order

### 2.2 Diary line items (`work_diaries.data`)

Diaries store three typed arrays in `work_diaries.data`:
- `PaintingItem` — color, quantities by area type
- `PoleItem` — action (supply/install/dismantle), pole count
- `SignItem` — classification (urban/basic/regular), count

**Gaps:**
6. No linkage between diary items and order items — "planned vs. actual" is not computable
7. No per-item catalog or cost reference — profitability is approximated at diary level only

### 2.3 Billing candidates

No structured table for billing line items exists. The current flow: a completed order's `billed_amount` (single number) is manually entered; the invoice number (`invoice_number`) is manually entered after SAP issues the invoice. No per-item billing visibility.

**Gap:**
8. No structured billing candidate records — office staff cannot review or approve individual line items before SAP invoicing

---

## 3. Proposed Schema

### 3.1 `work_order_items`

Stores structured planned line items for a work order. Replaces the JSONB `signRows`, `accessoryRows`, and `miscRows` arrays for new orders.

```
work_order_items
├── id                uuid PK
├── order_id          uuid FK → work_orders.id ON DELETE CASCADE
├── item_type         text NOT NULL  -- 'sign' | 'accessory' | 'misc' | 'generic'
├── description       text NOT NULL
├── quantity          numeric NOT NULL DEFAULT 0
├── unit              text           -- 'unit' | 'm²' | 'm' | 'kg' | 'hour' | null
├── catalog_item_id   uuid nullable FK → catalog_items.id
├── unit_price        numeric nullable  -- office-side; not required at order creation
├── unit_cost         numeric nullable  -- office-side
├── billing_status    text nullable     -- null | 'pending' | 'approved' | 'invoiced'
├── notes             text nullable
├── extended_data     jsonb nullable    -- overflow; item-type-specific fields
├── created_at        timestamptz DEFAULT now()
└── updated_at        timestamptz DEFAULT now()
```

**Indexes:**
- `(order_id)` — primary lookup
- `(catalog_item_id) WHERE catalog_item_id IS NOT NULL` — catalog join
- `(billing_status) WHERE billing_status IS NOT NULL` — billing agent queries

### 3.2 `field_work_diary_items`

Stores typed work log entries from field workers for a diary. Two-phase data model: Phase 1 (field entry) is minimal and required; Phase 2 (office enrichment) is optional.

```
field_work_diary_items
├── id                uuid PK
├── diary_id          uuid FK → work_diaries.id ON DELETE CASCADE
├── item_type         text nullable   -- 'painting' | 'pole' | 'sign' | 'generic'
├── description       text NOT NULL   -- Phase 1 required
├── quantity          numeric NOT NULL DEFAULT 0  -- Phase 1 required
├── unit              text nullable   -- 'm²' | 'unit' | 'm' etc.
├── classification    text nullable   -- sign: 'urban'|'basic'|'regular'; pole: 'supply'|'install'|'dismantle'
├── color             text nullable   -- painting items
├── catalog_item_id   uuid nullable FK → catalog_items.id  -- Phase 2 office enrichment
├── unit_price        numeric nullable   -- Phase 2 office enrichment
├── unit_cost         numeric nullable   -- Phase 2 office enrichment
├── notes             text nullable
├── extended_data     jsonb nullable  -- item-type-specific overflow
├── created_at        timestamptz DEFAULT now()
└── updated_at        timestamptz DEFAULT now()
```

**Indexes:**
- `(diary_id)` — primary lookup
- `(catalog_item_id) WHERE catalog_item_id IS NOT NULL`
- `(item_type) WHERE item_type IS NOT NULL`

### 3.3 `billing_items`

Stores office-side billing candidates derived from completed orders and approved diaries. Tracks billing readiness and SAP invoice references per line.

```
billing_items
├── id                  uuid PK
├── order_id            uuid nullable FK → work_orders.id
├── diary_id            uuid nullable FK → work_diaries.id
├── diary_item_id       uuid nullable FK → field_work_diary_items.id
├── order_item_id       uuid nullable FK → work_order_items.id
├── description         text NOT NULL
├── quantity            numeric NOT NULL DEFAULT 0
├── unit_price          numeric nullable
├── line_total          numeric GENERATED ALWAYS AS (quantity * unit_price) STORED nullable
├── billing_status      text NOT NULL DEFAULT 'draft'
    -- 'draft' | 'pending_approval' | 'approved' | 'submitted_to_sap' | 'invoiced' | 'cancelled'
├── sap_invoice_number  text nullable   -- manually entered after SAP issues invoice
├── invoiced_at         timestamptz nullable
├── notes               text nullable
├── created_at          timestamptz DEFAULT now()
└── updated_at          timestamptz DEFAULT now()
```

**Indexes:**
- `(order_id) WHERE order_id IS NOT NULL`
- `(diary_id) WHERE diary_id IS NOT NULL`
- `(billing_status)`
- `(sap_invoice_number) WHERE sap_invoice_number IS NOT NULL`

---

## 4. Field Worker UX Principles (Non-Negotiable)

These principles govern every UI decision, form design, and agent alert that touches field workers.

### 4.1 Field workers own operational facts only

Field workers are responsible for capturing:
- What work was done (`description`, `item_type`)
- How much (`quantity`)
- Who did it (crew, workers, hours)
- What equipment was used
- Completion status and proof (photos)

Field workers are **never** responsible for:
- Catalog mapping or `catalog_item_id`
- Cost, price, margin, or billing data
- SAP invoice numbers or accounting status
- Customer approval status

### 4.2 Minimal required fields — two fields to submit a diary item

A field worker can submit a valid diary item with only:
1. `description` (free text)
2. `quantity` (numeric)

`item_type` defaults to `'generic'` if not selected — it is shown in the form but never required. All other fields are optional enrichment done post-submission by office staff.

### 4.3 Generic-first entry flow

The diary item form opens with a single generic entry row. Classification (painting / pole / sign) is a secondary selection — never a gate at the start. Field workers can submit "2 units — installed road signs" without ever touching a dropdown.

### 4.4 Progressive disclosure

The entry form shows only required fields. An "Add details" toggle reveals classification, color, unit, and notes. This toggle defaults to hidden on mobile.

### 4.5 Smart templates

When a field worker opens a new diary for an order, the system suggests items from the most recent 3 diaries for the same order. The field worker taps "Copy from yesterday" and adjusts quantities. New entry is only required if work differs materially.

### 4.6 Night-work and offline-first considerations

Forms must work in low-light with large tap targets. Optional fields have visible but non-intrusive styling. Auto-save after every field edit. Submission retry on reconnect.

---

## 5. Agent Behavior Split

The structured diary items model enables two distinct categories of agent alerts. These must never be conflated.

### 5.1 Field Ops Agent — "Critical field data missing"

Fires when a submitted diary item is operationally incomplete:
- `quantity IS NULL` or `quantity = 0` on a submitted item
- `description IS NULL` or blank
- Diary submitted with zero items

Resolution: field worker or supervisor adds the missing operational data.

**Field Ops Agent does NOT alert on:**
- Missing `catalog_item_id`
- Missing `unit_price` or `unit_cost`
- Missing classification or color
- Any billing-related field

### 5.2 Billing Collections Agent — "Office enrichment needed"

Fires when an approved diary item is ready for billing but lacks required cost/billing data:
- Item has `quantity` + `description` but no `catalog_item_id` (cannot cost it)
- Item is billable (`isBillable = true`) but has no `unit_price`
- Diary has `billed_amount = 0` and all items are enriched (enrichment done, billing step skipped)

Resolution: office staff or billing team enriches the record.

**Billing Collections Agent does NOT alert field workers.** All enrichment alerts are office-side.

---

## 6. Backward Compatibility Strategy

### 6.1 Existing JSONB arrays are preserved

`work_orders.data.signRows`, `accessoryRows`, `miscRows`, and all `work_diaries.data` arrays remain untouched. No migration deletes or alters them.

### 6.2 Dual-source fallback in agents

Agents reading order items or diary items follow this priority:
1. **Structured rows first:** query `work_order_items` / `field_work_diary_items` for the entity
2. **JSONB fallback:** if no structured rows exist for the entity, read from `data` JSONB

This means old orders and diaries continue to be monitored by agents without any migration.

### 6.3 Write-dual during transition period

For a transition period (target: 3 months after Phase 3B ships), new diary entries write to both the structured `field_work_diary_items` table and the legacy `data` JSONB. After the transition period, legacy JSONB writes are dropped from the diary creation logic.

New order items write to `work_order_items` only. Legacy JSONB order item arrays are read-only after Phase 3A ships.

### 6.4 No automatic backfill for diary data

Diary JSONB data is not automatically migrated to `field_work_diary_items`. The dual-source fallback covers monitoring continuity. Selective backfill (for specific orders or time ranges) may be done manually if needed, but is not part of this design.

### 6.5 Safe JSONB backfill for catalog-linked order items (Phase 3A only)

For `work_order_items`: `accessoryRows` entries that have a valid `catalogItemId` and `quantity > 0` are safe candidates for structured backfill. This is the only category where automated backfill is permitted, and only for orders where `work_order_items` rows do not yet exist. `signRows` and `miscRows` are excluded — they lack the structured data needed for clean migration.

---

## 7. SAP Integration Boundary

SAP remains the authoritative accounting and invoicing system. This system's role:
- Prepare billing candidates (`billing_items`) for office review
- Track when a billing item has been submitted to SAP (`billing_status = 'submitted_to_sap'`)
- Store the manually-entered SAP invoice number (`sap_invoice_number`)
- Track `invoiced_at` date

This system does **not** generate invoices, does not connect to SAP directly, and does not maintain a canonical ledger. The `billed_amount` on `work_orders` remains the single summary figure for profitability calculations; `billing_items` provides per-line visibility for office staff only.

---

## 8. Implementation Phasing

### Phase 3A — `work_order_items`
- New migration: create table + indexes
- Update `useOrders` hook to write new order items to structured table
- Update agent scan routes to use dual-source fallback
- Safe JSONB backfill for catalog-linked accessory rows

### Phase 3B — `field_work_diary_items`
- New migration: create table + indexes
- Update diary creation and diary item form to write to structured table (write-dual mode on)
- Template engine: read last 3 diaries for same order, suggest items
- Update Field Ops Agent with new "critical field data missing" checks
- Update Billing Collections Agent with new "office enrichment needed" checks

### Phase 3C — `billing_items`
- New migration: create table + indexes
- Create billing item generation flow (triggered from completed order billing verification)
- Update Billing Collections Agent to monitor `billing_items.billing_status`
- Link `sap_invoice_number` entry UI in billing management screen

---

## 9. Out of Scope

- Automatic SAP integration or API connection
- Per-item tax or discount logic
- Foreign key CHECK constraints on `item_type` (plain text allows future extension without migrations)
- Automated migration of existing diary JSONB data
- Item-level photos (photos remain at the diary level)
- Multi-currency or multi-VAT support

---

## 10. Related Documents

- `docs/agents/agent-organization-master-spec.md` — agent responsibilities, Track 1/Track 2 approval model
- `docs/superpowers/specs/2026-05-12-work-diary-design.md` — diary creation and submission flow
- `docs/superpowers/specs/2026-05-16-cfo-lite-design.md` — profitability and billing readiness model
- `supabase/migrations/20260527000000_work_orders_group2_columns.sql` — Group 2 columns applied 2026-05-18
