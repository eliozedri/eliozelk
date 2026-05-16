# Phase 4.0 — CFO Lite / Job Profitability Foundation

**Date:** 2026-05-16  
**Status:** Approved for implementation  
**Builds on:** Phases 3.0–3.6 (inventory track, handoff at `d850ec5`)

---

## 1. Scope

Build a read-first, analytical profitability layer. Displays job/order-level profitability with confidence levels and missing-data warnings. Does not modify billing amounts, invoices, accounting records, or customer financial data.

**In scope:**
- Add `cost_price` to `catalog_items` (financial attribute, not inventory logic)
- Add `profitability_snapshots` table (analytical, not official accounting)
- Server-side snapshot generation API
- Extend CFO agent scan (orders + diary gaps + inventory vs material cost)
- Add profitability intent to CFO chat
- New "CFO ליי" tab inside `/profitability` (6th tab)

**Out of scope:**
- Invoice generation
- Billing amount changes
- External messages
- PDF plan analysis
- Payment collection
- Any change to inventory reservation/consumption/movement logic

---

## 2. Audit Results

### Revenue data (exists)
- `work_diaries.data.billedAmount` — per-diary billed amount (optional field)
- `work_orders.billed_amount` — order-level (nullable; rarely populated)
- Revenue is captured at diary granularity; order-level billing is sparse

### Labor cost data (exists)
- `work_diaries.data.crewLeaderName` + `crewMembers[]`
- `cost_rates` table: `workerDailyCost`, `teamLeaderDailyCost`
- `calculateProfitability()` in `src/lib/profitability.ts` already handles this per diary

### Vehicle / equipment cost (exists)
- `work_diaries.data.vehicleNumber`, `vehicleCostOverride`, `equipmentCost`
- `cost_rates.vehicleDailyCost`, `fuelCostPerDay`

### Material / inventory cost (CRITICAL GAP)
- `work_diaries.data.materialCost` — manual float field (exists, optional)
- `inventory_consumptions` — records item + quantity consumed per order ✓
- `catalog_items.defaultPrice` — **sale price only; no `cost_price` column**
- Therefore: inventory consumption cannot be valued at cost today
- Fix: add nullable `cost_price` to `catalog_items` via migration (additive only)

### Missing entirely
- Subcontractor cost — no table or field
- Other direct cost — not tracked

### Existing profitability layer
- `src/lib/profitability.ts` — solid per-diary calculation
- `src/lib/operationalKPIs.ts` — per-crew / per-order / per-week / per-customer rollups
- `src/components/Profitability/index.tsx` — 5-tab operational intelligence dashboard
- CFO agent scan — scans only `submitted` diaries; no order-level analysis; no inventory
- No `profitability_snapshots` table; all calculations are client-side and ephemeral

---

## 3. Database Schema Changes

### Migration 1: `catalog_items.cost_price`

```sql
ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT NULL;
```

- Nullable — absence means "cost price unknown"
- Distinct from `default_price` (sale price)
- Not referenced by any inventory code path (read-only for CFO)

### Migration 2: `profitability_snapshots`

```sql
CREATE TABLE IF NOT EXISTS public.profitability_snapshots (
  id                    text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id              text        NOT NULL,
  work_diary_id         text        DEFAULT NULL,
  customer_id           text        DEFAULT NULL,
  revenue               numeric     NOT NULL DEFAULT 0,
  labor_cost            numeric     NOT NULL DEFAULT 0,
  material_cost         numeric     NOT NULL DEFAULT 0,
  vehicle_cost          numeric     NOT NULL DEFAULT 0,
  equipment_cost        numeric     NOT NULL DEFAULT 0,
  subcontractor_cost    numeric     NOT NULL DEFAULT 0,
  other_cost            numeric     NOT NULL DEFAULT 0,
  overhead_cost         numeric     NOT NULL DEFAULT 0,
  total_cost            numeric     NOT NULL DEFAULT 0,
  gross_profit          numeric     NOT NULL DEFAULT 0,
  gross_margin_percent  numeric     NOT NULL DEFAULT 0,
  confidence_level      text        NOT NULL DEFAULT 'missing_data'
                        CHECK (confidence_level IN ('high', 'medium', 'low', 'missing_data')),
  missing_data          jsonb       NOT NULL DEFAULT '[]',
  source_data           jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profitability_snapshot_order
  ON public.profitability_snapshots (order_id)
  WHERE work_diary_id IS NULL;

ALTER TABLE public.profitability_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read snapshots" ON public.profitability_snapshots
  FOR SELECT TO anon USING (true);
```

- One row per order (order-level snapshot)
- `missing_data` is a JSON array of string tags, e.g. `["no_revenue", "missing_cost_price"]`
- `source_data` is a JSON blob for auditability (diary ids, consumption ids used)
- Recalculate freely — it is analytical, not official

---

## 4. Profitability Calculation Model (Order Level)

New function: `calculateOrderProfitability()` in `src/lib/profitability.ts`

**Inputs:**
- `WorkOrder` row
- Array of linked `WorkDiary` entries
- `CostRates`
- Array of `InventoryConsumption` rows (with `quantity` and `catalogItem.cost_price`)

**Revenue:**
```
revenue = order.billedAmount
       ?? sum(diary.billedAmount for linked diaries)
       ?? 0
```

**Costs:**
```
labor_cost    = sum(calculateProfitability(diary, rates).laborCost)
vehicle_cost  = sum(calculateProfitability(diary, rates).vehicleCost)
equipment_cost = sum(diary.equipmentCost ?? 0)
material_cost = sum(diary.materialCost ?? 0)
             + sum(consumption.quantity × item.cost_price WHERE cost_price IS NOT NULL)
overhead_cost = sum(calculateProfitability(diary, rates).overheadCost)
total_cost    = labor + vehicle + equipment + material + overhead
```

**Profit:**
```
gross_profit       = revenue - total_cost
gross_margin_pct   = revenue > 0 ? (gross_profit / revenue × 100) : (total_cost > 0 ? -100 : 0)
```

**Missing data detection:**
| Tag | Condition |
|-----|-----------|
| `no_revenue` | revenue === 0 |
| `no_linked_diaries` | no diaries with this orderId |
| `no_crew_data` | sum(totalWorkers) === 0 across all diaries |
| `missing_cost_price` | any consumption exists with no cost_price on catalog item |
| `no_material_cost` | consumptions exist but material_cost === 0 and all cost_prices null |
| `no_vehicle_data` | all diaries have no vehicleNumber |
| `no_approved_diary` | no diary with approvalStatus === 'approved' |

**Confidence level:**
```
if no_revenue                            → "missing_data"
else if missing.length === 0             → "high"
else if missing includes no_crew_data    → "low"
else if missing.length <= 2              → "medium"
else                                     → "low"
```

---

## 5. Snapshot Generation API

**Route:** `POST /api/profitability/snapshots/generate`  
**Auth:** master token (same as agent scans)

**Logic:**
1. Load orders with status `completed` OR accounting_status in `(verified, approved, invoiced)`
2. Load all linked diaries (orderId match)
3. Load cost_rates
4. Load inventory_consumptions for each order + catalog_items (read-only)
5. For each order: run `calculateOrderProfitability()`
6. Upsert into `profitability_snapshots` (ON CONFLICT order_id DO UPDATE)
7. Return summary: `{ generated, updated, missingData, errors }`

**Does not:**
- Modify any work_order, work_diary, billing, or inventory record
- Send messages
- Make financial decisions

---

## 6. CFO Agent Scan Extensions

Extend `/api/agents/cfo-agent/scan` to detect at **order level** in addition to diary level.

**New detections (order-level):**

| Exception category | Severity | Trigger |
|---|---|---|
| `order_missing_revenue` | warn | completed/verified order, revenue = 0 |
| `order_missing_labor` | warn | completed order, no linked diaries with crew data |
| `order_missing_material_cost` | info | consumptions exist, all cost_prices null |
| `order_negative_profit` | critical | gross_profit < 0 AND revenue > 0 |
| `order_low_margin` | warn | margin < warningMarginPercentage AND revenue > 0 |
| `order_no_snapshot` | info | approved diary exists but no snapshot row |
| `customer_repeated_low_margin` | warn | customer has ≥3 orders all below warning margin |

**Existing diary-level detections** (unchanged):
- `profitability_loss`, `profitability_marginal`, `profitability_missing_billing`, `profitability_missing_crew`

**Scan also generates snapshots** for any order that gets scanned and has no snapshot yet.

**Dedupe / auto-resolve:** same pattern as all other agents.

---

## 7. CFO Chat Extension

Add `profitability` intent to `detectIntent()` in `src/lib/agents/chat-engine.ts`.

**Keywords (Hebrew):**
`"רווחיות"`, `"רווחי"`, `"הפסד"`, `"מרווח"`, `"נמוך"`, `"עלות עבודה"`, `"חסרים נתוני"`, `"עלות חומרים"`, `"עלות עובד"`, `"אחוז רווח"`, `"ממוצע רווח"`, `"שולי"`, `"לא רווחי"`

**Queries:** `profitability_snapshots` table.

**Answers:**
- Loss jobs → snapshots where gross_profit < 0, sorted ascending by margin
- Low margin → margin between 0 and warningMarginPercentage
- Missing cost data → missing_data array contains relevant tags
- Per-customer → group by customer_id, average margin
- Missing snapshots → from agent_exceptions category `order_no_snapshot`

**Agent filter:** when CFO agent thread is active, filter query to CFO-relevant exceptions only.

---

## 8. UI — New "CFO ליי" Tab

**File:** `src/components/Profitability/index.tsx`

**Tab ID:** `"cfo"`  
**Tab label:** `"CFO ליי"` (or `"מנהל כספים"`)  
**Position:** 6th tab (after existing: diaries, orders, crews, trends, management)

**Content sections:**

### 8.1 KPI strip (top)
- Total orders with snapshots
- # profitable orders (margin ≥ target)
- # loss orders (gross_profit < 0)
- # missing-data orders
- Total revenue (sum)
- Total gross profit (sum)

### 8.2 Confidence filter bar
- All | High | Medium | Low | Missing Data

### 8.3 Snapshot table (worst first by margin %)
Columns:
- הזמנה (order number + link)
- לקוח
- הכנסה
- עלות עובדים
- עלות חומרים
- עלות רכב
- תקורה
- סה״כ עלות
- רווח גולמי
- אחוז רווחיות (colored: red < 0, amber < target, green ≥ target)
- רמת ודאות (confidence badge: high=green, medium=amber, low=orange, missing_data=gray)
- חסרים נתונים (pill badges per tag)

### 8.4 "Regenerate snapshots" button
- Calls `POST /api/profitability/snapshots/generate`
- Shows last-generated timestamp
- Loading state during generation

### 8.5 Hebrew labels used
| Label | Hebrew |
|---|---|
| Job profitability | רווחיות עבודה |
| Revenue | הכנסה |
| Labor cost | עלות עובדים |
| Material cost | עלות חומרים |
| Vehicle cost | עלות רכב |
| Total cost | סה״כ עלות |
| Gross profit | רווח גולמי |
| Margin % | אחוז רווחיות |
| Missing data | חסרים נתונים |
| Confidence level | רמת ודאות |
| High | גבוהה |
| Medium | בינונית |
| Low | נמוכה |
| Regenerate | חשב מחדש |

---

## 9. Catalog UI — cost_price field (optional small addition)

Add `costPrice` to `CatalogItem` type and to the `CatalogForm`.  
Displayed as "מחיר עלות (₪)" below the existing `defaultPrice` field.  
Optional field — blank = unknown.  
This allows staff to populate cost prices going forward without any code path change in inventory.

---

## 10. Safety Constraints

| Action | Status |
|---|---|
| Generate invoices | FORBIDDEN |
| Modify billing amounts | FORBIDDEN |
| Mark payment received | FORBIDDEN |
| Change accounting records | FORBIDDEN |
| External messages | FORBIDDEN |
| Automatic financial decisions | FORBIDDEN |
| Calculate profitability | Allowed |
| Display profitability | Allowed |
| Store analytical snapshots | Allowed |
| Create CFO exceptions/tasks | Allowed |
| Recommend review | Allowed |
| Flag missing data | Allowed |

---

## 11. Files Changed

| File | Change |
|---|---|
| `supabase/migrations/20260523000000_cfo_lite.sql` | New: schema migration |
| `src/types/catalog.ts` | Add `costPrice?: number \| null` |
| `src/hooks/useCatalog.ts` | Map `cost_price` ↔ `costPrice` |
| `src/lib/profitability.ts` | Add `calculateOrderProfitability()` + types |
| `src/app/api/profitability/snapshots/generate/route.ts` | New: snapshot generation API |
| `src/app/api/agents/cfo-agent/scan/route.ts` | Extend: order-level scan + snapshot generation |
| `src/lib/agents/chat-engine.ts` | Add `profitability` intent + handler |
| `src/components/Profitability/index.tsx` | Add CFO tab + CfoTab component |
| `src/components/Catalog/index.tsx` | Add cost_price input field |
| `src/app/api/setup-db/route.ts` | No change needed (migration handles schema) |

---

## 12. Testing Checklist

1. Order with revenue + full costs → profitability calculated, confidence = high
2. Order with revenue but no crew → confidence = low, `no_crew_data` badge
3. Order with consumed inventory, cost_price null → `missing_cost_price` badge
4. Order with consumed inventory, cost_price set → material cost included in calculation
5. Order with zero revenue → confidence = missing_data, `no_revenue` badge
6. Negative profit order → `order_negative_profit` exception (critical)
7. Low margin order → `order_low_margin` exception (warn)
8. Re-run scan → no duplicate exceptions (dedupe)
9. Fix missing data → scan auto-resolves stale exceptions
10. CFO chat answers: "איזה עבודות הפסדיות?" / "מה הרווחיות לפי עבודה?"
11. CFO tab shows margin/confidence correctly colored
12. Regenerate button triggers snapshot API + updates table
13. Typecheck clean
14. Build clean
