# SAP Business One Integration Foundation — Design Spec

**Date:** 2026-05-19  
**Status:** Approved for implementation  
**Phase:** 1 — Safe Read-Only Foundation

---

## 1. Business Goal

Connect the Elkayam operational management platform to SAP Business One Service Layer so that:

- SAP accounting/ERP records (customers, items, orders, invoices, payments) can be read and normalized
- Internal Elkayam operational data (work logs, field execution, profitability, workflow) can be correlated with SAP financial records
- A controlled, safe synchronization path exists for Phase 2

Phase 1 is strictly **read-only and disabled by default**. No SAP write operations of any kind.

---

## 2. Source-of-Truth Principle

| Domain | Source of Truth |
|---|---|
| Accounting records, invoices, payments, VAT, DocNum/DocEntry | **SAP Business One** |
| Operational execution, work logs, installation records, field status | **Elkayam system** |
| Profitability analysis, workflow intelligence, dashboards | **Elkayam system** |
| Customer identity (CardCode as primary key for linkage) | **SAP** (Elkayam links to it) |
| Product catalog (SAP ItemCode as anchor) | **SAP** (Elkayam adds operational metadata) |

The integration connects these two worlds. It does not replace either.

---

## 3. Architecture

```
SAP Business One Service Layer (external HTTPS API)
        ↓
src/lib/sap/config.ts      — env var validation, mode enforcement
src/lib/sap/client.ts      — HTTP client: login(), safeGet(), logout()
src/lib/sap/services.ts    — read service methods, withSapSession() wrapper
src/lib/sap/types.ts       — raw SAP OData response shapes
src/lib/sap/mapping.ts     — normalized Elkayam types + SAP→internal mappers
        ↓
src/app/api/sap/health/route.ts     — server-only health check endpoint
src/app/api/sap/dry-run/route.ts    — preview mapped data, zero DB writes
        ↓
src/app/integrations/page.tsx       — Integration hub UI (server-rendered)
```

---

## 4. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SAP_B1_MODE` | Yes | `disabled` \| `readonly` \| `write_test` \| `write_prod` |
| `SAP_B1_SERVICE_LAYER_URL` | Yes (if not disabled) | Base URL: `https://your-sap-server:50000/b1s/v1` |
| `SAP_B1_COMPANY_DB` | Yes (if not disabled) | SAP company database name |
| `SAP_B1_USERNAME` | Yes (if not disabled) | SAP Service Layer user |
| `SAP_B1_PASSWORD` | Yes (if not disabled) | SAP Service Layer password |

**Default:** `SAP_B1_MODE=disabled` — no SAP calls are made without explicit opt-in.

All vars are server-side only. None are prefixed `NEXT_PUBLIC_`. None are ever sent to the browser.

---

## 5. Mode Protection

`config.ts` is the single enforcement point. Any SAP call flows through `loadSapConfig()`.

| Mode | Allowed | Blocked |
|---|---|---|
| `disabled` | nothing | all SAP calls — throws immediately |
| `readonly` | GET requests only | any non-GET HTTP method |
| `write_test` | reserved | blocked at code level, explicit error |
| `write_prod` | reserved | blocked at code level, must be manually unlocked in a future phase |

The client enforces the method restriction: `safeGet()` only issues `GET` requests, and no `safePost()` / `safePatch()` / `safeDelete()` exists in Phase 1.

---

## 6. Session Design (Stateless, Per-Request)

Every service call follows this exact lifecycle. Nothing is persisted between calls.

```
login(config) → { b1Session: string, routeId: string }
  ↓
safeGet(path, session) — with 10s timeout, structured error
  ↓
logout(session) — always runs in finally block
```

`withSapSession(fn)` in `services.ts` owns the try/finally wrapper so individual service methods stay clean.

SAP `B1SESSION` and `ROUTEID` cookies exist only in-memory during a single server-side request. They are never logged, never persisted, never returned to the browser.

---

## 7. Service Methods

All methods call `withSapSession()` internally. All are read-only.

| Method | SAP Endpoint | Description |
|---|---|---|
| `getBusinessPartners()` | `GET /BusinessPartners` | All BP records |
| `getCustomers()` | `GET /BusinessPartners?$filter=CardType eq 'cCustomer'` | Customers only |
| `getSuppliers()` | `GET /BusinessPartners?$filter=CardType eq 'cSupplier'` | Suppliers only |
| `getItems()` | `GET /Items` | Full product/SKU catalog |
| `getWarehouses()` | `GET /Warehouses` | Warehouse definitions |
| `getInventorySnapshot()` | `GET /Items` (stock fields) | Stock levels per item/warehouse |
| `getOpenSalesOrders()` | `GET /Orders?$filter=DocumentStatus eq 'bost_Open'` | Open sales orders |
| `getInvoices(params?)` | `GET /Invoices` | AR invoices, filterable by date |
| `getCreditNotes()` | `GET /CreditNotes` | Credit notes |
| `getDeliveryNotes()` | `GET /DeliveryNotes` | Delivery documents |
| `getIncomingPayments()` | `GET /IncomingPayments` | Payments received |

Pagination: SAP Service Layer uses OData `$skip`/`$top`. Phase 1 uses a safe default page size of 50. Larger pulls use explicit parameters.

---

## 8. Type System

### 8a. Raw SAP Types (`types.ts`)

Matches SAP OData response shapes exactly. Named with SAP's original casing (`CardCode`, `DocEntry`, etc.) to make the mapping explicit.

Key types:
- `SapBusinessPartner` — CardCode, CardName, CardType, Phone1, EmailAddress, Balance, etc.
- `SapItem` — ItemCode, ItemName, QuantityOnStock, WarehouseCode, Price, etc.
- `SapWarehouse` — WarehouseCode, WarehouseName, Location, etc.
- `SapSalesOrder` — DocEntry, DocNum, CardCode, CardName, DocDate, DocumentLines[], etc.
- `SapInvoice` — DocEntry, DocNum, CardCode, DocTotal, VatSum, PaidToDate, DocumentLines[], etc.
- `SapCreditNote` — mirrors SapInvoice shape
- `SapDeliveryNote` — DocEntry, DocNum, CardCode, DocumentLines[], etc.
- `SapIncomingPayment` — DocEntry, CardCode, DocTotal, TransferDate, etc.
- `SapODataResponse<T>` — wrapper with `value: T[]` and `@odata.count`

### 8b. Normalized Elkayam Types (`mapping.ts`)

Internal shapes stripped of SAP naming conventions. Each carries a `_sap` block preserving original IDs for traceability.

- `NormalizedBusinessPartner` — id (CardCode), name, type, phone, email, balance, `_sap: { CardCode, CardType }`
- `NormalizedItem` — id (ItemCode), name, sku, stockQty, price, `_sap: { ItemCode }`
- `NormalizedWarehouse` — id (WarehouseCode), name, location, `_sap: { WarehouseCode }`
- `NormalizedSalesOrder` — id (DocNum), docEntry, customerId, customerName, date, lines[], status, `_sap: { DocEntry, DocNum }`
- `NormalizedInvoice` — id (DocNum), docEntry, customerId, total, vatSum, paid, balance, lines[], `_sap: { DocEntry, DocNum }`
- `NormalizedCreditNote` — mirrors NormalizedInvoice
- `NormalizedDeliveryNote` — id (DocNum), customerId, lines[], `_sap: { DocEntry, DocNum }`
- `NormalizedPayment` — id (DocEntry), customerId, total, date, `_sap: { DocEntry }`

---

## 9. Health Check Endpoint

`GET /api/sap/health` — server-side only, protected by existing auth middleware.

Response shape:
```json
{
  "mode": "readonly",
  "env_vars_present": true,
  "url_reachable": true,
  "login_success": true,
  "sample_read_success": true,
  "sample_entity": "BusinessPartners",
  "sample_count": 1,
  "checked_at": "2026-05-19T12:00:00Z",
  "error": null
}
```

Never returns: credentials, session tokens, company DB name, password, raw error stack traces.

If mode is `disabled`, returns `{ mode: "disabled", env_vars_present: false }` immediately without any SAP calls.

---

## 10. Dry-Run Preview Endpoint

`GET /api/sap/dry-run?entity=business_partners` — server-side only.

Supported entity values: `business_partners`, `customers`, `suppliers`, `items`, `warehouses`, `orders`, `invoices`, `credit_notes`, `delivery_notes`, `payments`.

Response shape:
```json
{
  "entity": "business_partners",
  "total_fetched": 42,
  "sample": [
    {
      "sap_raw": { "CardCode": "C001", "CardName": "Acme Ltd", ... },
      "normalized": { "id": "C001", "name": "Acme Ltd", "type": "customer", ... }
    }
  ],
  "unmapped_fields": ["FaxNumber", "Cellular"],
  "future_sync": {
    "target_table": "customers",
    "conflict_key": "sap_card_code",
    "source_of_truth": "sap",
    "phase": 2
  }
}
```

Zero writes to Supabase. This is purely a mapping preview.

---

## 11. Phase 2 Sync Preparation (documented, not implemented)

The following defines what Phase 2 sync would look like. No tables are created in Phase 1.

| SAP Entity | SAP Key | Phase 2 Target | Conflict Key | SOT |
|---|---|---|---|---|
| Business Partner (Customer) | `CardCode` | `customers.sap_card_code` | `sap_card_code` | SAP |
| Business Partner (Supplier) | `CardCode` | new `suppliers` table | `sap_card_code` | SAP |
| Item / SKU | `ItemCode` | `catalog_items.sap_item_code` | `sap_item_code` | SAP |
| Warehouse | `WarehouseCode` | new `sap_warehouses` mirror | `warehouse_code` | SAP |
| Sales Order | `DocNum` | new `sap_orders_mirror` | `sap_doc_num` | SAP (financial) / Elkayam (operational) |
| Invoice | `DocEntry` | new `sap_invoices_mirror` | `sap_doc_entry` | SAP |
| Credit Note | `DocEntry` | new `sap_credit_notes_mirror` | `sap_doc_entry` | SAP |
| Delivery Note | `DocEntry` | new `sap_delivery_notes_mirror` | `sap_doc_entry` | SAP |
| Incoming Payment | `DocEntry` | new `sap_payments_mirror` | `sap_doc_entry` | SAP |

Duplicate detection in Phase 2: upsert on conflict key. Existing Elkayam records linked via `sap_card_code` / `sap_doc_num` foreign fields (nullable).

---

## 12. Integrations Page (`/integrations`)

Server-rendered. Shows:
- **SAP section:** mode badge, health status card, last-checked timestamp
- **Run Health Check** button → calls `/api/sap/health` via client fetch
- **Entity cards** (one per supported entity): "Preview Sync" → `/api/sap/dry-run?entity=X`
- **Phase 2 section:** greyed-out table showing what would sync, no action buttons yet

Authentication: inherits app middleware (Supabase session required). The page is accessible to authenticated users; it performs no SAP calls on load — only on button click.

---

## 13. Security Rules

1. No SAP credentials or session tokens in any HTTP response
2. No SAP credentials in any client component or browser bundle
3. All SAP API routes are server-only (`use server` or `route.ts`)
4. `SAP_B1_MODE=disabled` is the default — opt-in required
5. No write methods implemented in Phase 1
6. All SAP errors are normalized before returning to caller — raw SAP stack traces are never forwarded
7. Timeout: 10s on all SAP HTTP calls
8. Retry: none in Phase 1 (retry on reads is safe but adds complexity — deferred)

---

## 14. Developer Setup

### `.env.local` (development)
```
SAP_B1_MODE=disabled
# SAP_B1_SERVICE_LAYER_URL=https://your-sap-server:50000/b1s/v1
# SAP_B1_COMPANY_DB=SBODemo_IL
# SAP_B1_USERNAME=manager
# SAP_B1_PASSWORD=your-password
```

### Vercel / Production secrets
Add via `vercel env add` or Vercel dashboard. All vars are server-only (no NEXT_PUBLIC_ prefix).

### What to request from SAP provider
- Service Layer base URL + port
- Company database name
- Read-only service user credentials
- SSL certificate details if self-signed
- Confirmation that OData v1 endpoints are available: `/BusinessPartners`, `/Items`, `/Orders`, `/Invoices`

---

## 15. What Is Not Implemented in Phase 1

- No SAP write operations (create, update, delete)
- No automatic Supabase sync (no data written from SAP)
- No persistent session cache
- No retry logic
- No webhook/event-based push from SAP
- No attachment/document binary download
- No journal entry write access
- No payment creation or order creation
- `write_test` and `write_prod` modes exist as stubs only — they throw immediately

---

## 16. Files Changed

| File | Status |
|---|---|
| `src/lib/sap/config.ts` | New |
| `src/lib/sap/client.ts` | New |
| `src/lib/sap/services.ts` | New |
| `src/lib/sap/types.ts` | New |
| `src/lib/sap/mapping.ts` | New |
| `src/app/api/sap/health/route.ts` | New |
| `src/app/api/sap/dry-run/route.ts` | New |
| `src/app/integrations/page.tsx` | New |
| `src/components/Sidebar.tsx` | Update — add Integrations nav link |
