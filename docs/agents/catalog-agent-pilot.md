# Catalog Agent — Pilot Specification
**Elkayam Road Marking LTD — catalog-pricing-agent**
**Date:** 2026-05-17 | **Status:** Specification — approved for implementation planning

---

## 1. Agent Identity

| Field | Value |
|---|---|
| Agent ID | `catalog-pricing-agent` |
| AgentType | `"catalog_pricing"` |
| Department | `"catalog"` |
| Hebrew name | מנהל קטלוג |
| Autonomy level target | Level 1 (scan + create review tasks) |
| Current status | Visual/config only — no scan route |
| DB status | Row exists in `agents` table |
| Scan route | Not yet implemented — this is the pilot spec |

---

## 2. Business Mandate

### What this agent does

The Catalog Agent scans the Elkayam product catalog for data quality problems, classifies every issue by severity, creates review tasks for human action, and tracks catalog health over time.

It is an **audit and recommendation agent** — it never modifies catalog data on its own.

### What this agent must never do

| Action | Reason |
|---|---|
| Invent or estimate prices | Prices have commercial and contractual consequences — wrong data is worse than missing data |
| Delete catalog items | Deletion cascades to order history, inventory records, and profitability snapshots |
| Merge duplicate products | Merging requires understanding which orders/reservations belong to which item — cannot be decided algorithmically |
| Reclassify products between categories | Category changes affect order form defaults, reporting, and workflow routing |
| Modify defaultPrice, costPrice, unitOfMeasure, name, or description | All corrections must go through human approval |
| Mark an item as inactive | Deactivation affects all open orders referencing that item |

If the agent detects that any of the above would resolve an issue, it creates a task with the suggested action and required approval — it does not execute the action.

---

## 3. Business Context — Catalog Domains

The Elkayam catalog covers the following product/service domains. Each has different quality requirements:

### 3.1 Traffic Signs
- Source data: `src/data/signs.ts` — 200+ Israeli standard signs
- Series 100–900 (warning, instruction, information, special)
- Shapes: triangle, circle, rectangle, special
- Variants: provisional (p-series), diamond-reinforced, various materials
- Quality requirements: sign number, series, shape, availability — catalog items for signs must map to the standard number system
- Known problems: sign catalog items may have generic names that don't follow the standard naming convention

### 3.2 Safety Accessories
- Source data: `src/data/safetyAccessories.ts` — 37 product categories
- Categories: cones (50–100cm), flexible separators, barrier posts, sign fixtures, solar/electric lighting, speed mats, cable protection, parking accessories, mirrors, marking tape, fencing (HDPE/mesh), accessibility (tactile, anti-slip), flood barriers
- Quality requirements: each item needs a clear size/spec in the name or description, a unit of measure (יחידה or specific unit), and a price
- Known problems: near-duplicate names for same item in different sizes (e.g., "חרוט 50" vs "חרוט 50ס״מ" vs "חרוט 50 ס״מ")

### 3.3 Road Marking Services
- Services: lane painting by color (white/yellow), arrow markings, pedestrian crossings, speed bumps (thermoplastic)
- Quality requirements: unit of measure is critical (מ״ר, מטר, or יחידה depending on service type), price should reflect market rate
- Known problems: services may lack cost price, making profitability calculations unavailable

### 3.4 Materials
- Materials: paint (by liter/drum), thermoplastic, reflective beads, solvents
- Quality requirements: unit must be by volume or weight (ליטר, ק״ג, תוף), supplier should be linked, cost price is essential

### 3.5 Equipment
- Equipment: machinery (day rate), vehicles, specialized tools
- Quality requirements: unit must be "יום" or "שעה", daily rate required

### 3.6 Labor
- Labor: crew worker (per day), team leader (per day), overtime
- Quality requirements: unit must be "יום" or "שעה", rate should match cost_rates table

---

## 4. Data Sources

| Source | Table / File | Fields used | Access level |
|---|---|---|---|
| Catalog items | `catalog_items` | All fields | Read-only |
| Order items | `work_orders` | `data.accessoryRows`, `data.miscRows`, `data.signRows` | Read-only |
| Inventory reservations | `inventory_reservations` | `item_id`, `order_id`, `status` | Read-only |
| Cost rates reference | `cost_rates` | `worker_daily`, `leader_daily`, `equipment_daily` | Read-only (for cross-check only) |
| Company price list | *Not found in codebase* | — | **Requires owner clarification** |

**Data source that must NOT be used:**
- Historical order prices (orders may use informal/negotiated pricing that does not reflect true catalog price)
- Agent suggestions from prior scan (suggestions are not facts — the DB state is the only truth)

---

## 5. Detection Rules

Each rule runs during a scan and produces either an exception (severity ≥ warn) or a task (always). Rules are listed in priority order — most business-critical first.

---

### Rule 1 — Price–Cost Inversion
**Condition:** `default_price IS NOT NULL AND cost_price IS NOT NULL AND default_price < cost_price AND default_price > 0`
**Severity:** Critical
**What it means:** Every sale of this item at list price results in a guaranteed financial loss. No margin is possible.
**Exception title template:** `היפוך מחיר–עלות — [item name] (מחיר: ₪X, עלות: ₪Y)`
**Resolution task:** `"בדוק ותקן תמחור — [item name]: מחיר המכירה (₪X) נמוך מעלות (₪Y)"`
**Requires approval:** Yes — price change is a commercial decision
**Dedupe key:** `price_cost_inversion:catalog_item:[item.id]`

---

### Rule 2 — Exact Duplicate Name
**Condition:** Two or more active catalog items share the exact same `name` (case-insensitive trim comparison)
**Severity:** Error
**What it means:** Data integrity violation. Orders, inventory, and reservations may split between the two items.
**Exception title template:** `כפילות מדויקת בשם — "[name]" ([N] פריטים)`
**Resolution task:** `"סקור וזהה פריט אב — "[name]" קיים [N] פעמים בקטלוג"`
**Requires approval:** Yes — merging or deleting requires understanding which item has the correct history
**Dedupe key:** `exact_duplicate:[name_normalized]`
**Note:** Surface both/all item IDs in the exception payload so the reviewer can navigate to each one.

---

### Rule 3 — Missing Price (for commercial items)
**Condition:** `default_price IS NULL` for items of type: product, material, service, equipment
**Severity:** Error
**What it means:** Item cannot be quoted or priced in order creation. If it appears in an order, the order value is understated.
**Exception title template:** `מחיר חסר — [item name] ([type], [category])`
**Resolution task:** `"הגדר מחיר לפריט — [item name]"`
**Requires approval:** Yes
**Dedupe key:** `missing_price:catalog_item:[item.id]`
**Exception for Labor type:** Labor items without a price should be cross-checked against `cost_rates` table. If a matching rate exists (worker_daily, leader_daily), create a task to link them — but do not auto-populate.

---

### Rule 4 — Missing Unit of Measure
**Condition:** `unit_of_measure IS NULL OR TRIM(unit_of_measure) = ''`
**Severity:** Error
**What it means:** Without a unit, inventory tracking is impossible for this item. Reservations and consumptions cannot be calculated correctly.
**Exception title template:** `יחידת מידה חסרה — [item name]`
**Resolution task:** `"הגדר יחידת מידה — [item name]: [type], [category]"`
**Requires approval:** Yes
**Dedupe key:** `missing_unit:catalog_item:[item.id]`

---

### Rule 5 — Inactive Item Referenced in Open Order
**Condition:** `is_active = false` AND item.id appears as `catalogItemId` in a `work_orders.data.accessoryRows` or `work_orders.data.miscRows` for an order with status NOT IN ('completed', 'cancelled')
**Severity:** Error
**What it means:** An open order references a discontinued item. The order may be unfulfillable if the item is truly out of production.
**Exception title template:** `פריט לא פעיל בהזמנה פתוחה — [item name] בהזמנה [order_number]`
**Resolution task:** `"בדוק הזמנה [order_number] — פריט '[item name]' סומן כלא פעיל"`
**Requires approval:** No — this is a detection-only task. Correction (reactivating the item or substituting) requires separate human decision.
**Dedupe key:** `inactive_in_open_order:catalog_item:[item.id]:work_order:[order.id]`

---

### Rule 6 — Zero Price on Non-Complimentary Item
**Condition:** `default_price = 0` for items of type: product, material, equipment AND the item has appeared in at least one order with a non-zero quantity
**Severity:** Warn
**What it means:** Item is priced at zero but is being used in real orders. Either it is intentionally free (bundled, complimentary) or there is a pricing error.
**Exception title template:** `מחיר אפס — [item name] (בשימוש בהזמנות)`
**Resolution task:** `"אשר מחיר אפס — האם '[item name]' אכן ניתן ללא תשלום?"`
**Requires approval:** Yes — owner must confirm whether zero price is intentional
**Dedupe key:** `zero_price:catalog_item:[item.id]`

---

### Rule 7 — Missing Cost Price (on items used in orders)
**Condition:** `cost_price IS NULL` AND item.id appears as `catalogItemId` in at least one work_order with status NOT 'cancelled'
**Severity:** Warn
**What it means:** Without costPrice, profitability calculations for any job using this item are incomplete. CFO agent snapshots will have confidence: low or missing_data.
**Exception title template:** `עלות חסרה — [item name] (בשימוש בהזמנות, מונע חישוב רווחיות)`
**Resolution task:** `"הגדר מחיר עלות לפריט — [item name]: נדרש לחישוב רווחיות"`
**Requires approval:** Yes
**Dedupe key:** `missing_cost_price:catalog_item:[item.id]`

---

### Rule 8 — Near-Duplicate Name
**Condition:** Two active catalog items whose names, when stripped of punctuation and whitespace variations, are within a configurable similarity threshold.
**Initial implementation:** Compare items where:
- First 6+ characters are identical (case-insensitive), AND
- Remaining characters differ only in punctuation, spacing, unit abbreviation format, or slash vs. × vs. x
- Examples: "חרוט 50 ס״מ" vs "חרוט 50ס״מ", "שלט 60×60" vs "שלט 60/60", "גדר HDPE" vs "גדר HDPE ™"
**Severity:** Warn
**What it means:** Possible duplicate. If they are the same product, inventory is split between two items.
**Exception title template:** `ייתכן כפילות בשם — "[name A]" ו-"[name B]"`
**Resolution task:** `"בדוק אם מדובר באותו מוצר: '[name A]' ו-'[name B]'"`
**Requires approval:** Yes
**Dedupe key:** `near_duplicate:[normalized_name_pair_key]` (lexicographically sorted pair, normalized)
**Note:** This check is computationally O(n²) on catalog size. Limit to active items only. Skip if catalog > 5,000 items until optimized.

---

### Rule 9 — Unmapped Item Used in Order
**Condition:** A `work_orders.data.accessoryRows`, `work_orders.data.miscRows`, or `work_orders.data.signRows` entry has a non-empty `description` but no `catalogItemId` (or catalogItemId references a non-existent catalog item), in an order with status NOT IN ('completed', 'cancelled')
**Severity:** Warn
**What it means:** An item is being ordered/tracked without a catalog entry. Inventory tracking and profitability calculation are impossible for this line item.
**Exception title template:** `פריט הזמנה לא ממופה לקטלוג — "[description]" בהזמנה [order_number]`
**Resolution task:** `"קשר לקטלוג — פריט '[description]' בהזמנה [order_number] אינו מקושר לפריט קטלוג"`
**Requires approval:** No — creating the catalog entry or linking the item is a subsequent human action
**Dedupe key:** `unmapped_order_item:work_order:[order.id]:[description_normalized]`
**Note:** Deduplicate by description (normalized) — the same unmapped item description appearing in 10 orders should not create 10 separate exceptions. Create one exception per unique description, listing the affected orders in the payload.

---

### Rule 10 — Missing Minimum Quantity (for tracked items)
**Condition:** `current_quantity > 0` (item is being physically tracked) AND `minimum_quantity = 0` (no reorder threshold set) AND item is of type: product or material
**Severity:** Info
**What it means:** This item is in the warehouse but will never trigger a purchase recommendation because no reorder threshold is defined. It is effectively unmanaged.
**Task:** `"הגדר כמות מינימום — [item name]: יש מלאי אך אין סף הזמנה"`
**No exception** (info severity — task only)
**Dedupe key:** `missing_minimum_quantity:catalog_item:[item.id]`

---

### Rule 11 — Missing Supplier (for items with minimum quantity)
**Condition:** `minimum_quantity > 0` AND `supplier_id IS NULL`
**Severity:** Warn
**What it means:** This item has a reorder threshold but no supplier. When stock falls below minimum, no meaningful purchase recommendation can be generated.
**Exception title template:** `ספק חסר — [item name] (כמות מינימום: [min_qty] [unit])`
**Task:** `"קשר ספק לפריט — [item name]: אין ספק, לא ניתן לייצר המלצת רכש מלאה"`
**Requires approval:** No
**Dedupe key:** `missing_supplier:catalog_item:[item.id]`
**Note:** This check is also performed by inventory-agent. Catalog-agent creates it in a catalog data quality context; inventory-agent creates it in a procurement readiness context. Both are valid — deduplication is by agent_id, so they will not collide.

---

### Rule 12 — Missing Description
**Condition:** `description IS NULL OR TRIM(description) = ''` for items of type: product, service, material
**Severity:** Info
**What it means:** Products without descriptions are harder to identify during order creation and may be misused or confused with similar items.
**Task:** `"הוסף תיאור — [item name]: אין תיאור"`
**No exception**
**Dedupe key:** `missing_description:catalog_item:[item.id]`

---

### Rule 13 — Dimension Value Without Dimension Unit
**Condition:** `dimension_value IS NOT NULL AND TRIM(dimension_value) != ''` AND `dimension_unit IS NULL OR TRIM(dimension_unit) = ''`
**Severity:** Warn
**What it means:** A physical dimension is specified but its unit is missing, making the dimension meaningless.
**Exception title template:** `מידה ללא יחידה — [item name] (ערך: [dimension_value], יחידה: חסרה)`
**Task:** `"השלם מפרט מידה — [item name]: יש ערך מידה אך חסרה יחידה"`
**Requires approval:** No
**Dedupe key:** `dimension_without_unit:catalog_item:[item.id]`

---

### Rule 14 — Type-Category Mismatch (partial implementation)
**Condition:** Item `type` does not match the expected category group for that type.
**Initial mapping (expand with owner input):**

| Item type | Expected category group (contains one of) |
|---|---|
| `labor` | "כוח אדם", "עבודה", "עובדים" |
| `equipment` | "ציוד", "רכבים", "מכונות" |
| `material` | "חומרים", "צבע", "חומרי גלם" |
| `service` | "שירותים", "סימון", "התקנה" |
| `product` | any category (products span multiple categories) |
| `misc` | any category |

**Severity:** Info
**What it means:** Possible misclassification. Not necessarily wrong, but warrants review.
**Task:** `"בדוק סיווג — [item name]: סוג '[type]' בקטגוריה '[category]'"`
**No exception**
**Dedupe key:** `type_category_mismatch:catalog_item:[item.id]`
**Status:** Initial category-to-type mapping is provisional. **Requires owner clarification for final category tree.**

---

## 6. Severity Classification Summary

| Severity | What triggers it | UI display | Creates exception? | Creates task? |
|---|---|---|---|---|
| Critical | Price–cost inversion | Red, pulsing beacon | ✅ | ✅ |
| Error | Exact duplicate, missing price/unit, inactive item in open order | Red | ✅ | ✅ |
| Warn | Zero price in use, near-duplicate, missing cost price, missing supplier, dimension mismatch | Amber | ✅ | ✅ |
| Info | Missing description, missing minimum quantity, type-category mismatch | Blue (feed only) | ❌ | ✅ |

---

## 7. Minimum Viable First Scan (Phase 1)

The first scan implementation should implement exactly these 5 rules in order of priority:

1. **Rule 1 — Price–Cost Inversion** (critical — hardest to detect, highest business risk)
2. **Rule 3 — Missing Price** (error — directly impacts order creation)
3. **Rule 4 — Missing Unit of Measure** (error — breaks inventory tracking)
4. **Rule 2 — Exact Duplicate Name** (error — data integrity)
5. **Rule 5 — Inactive Item in Open Order** (error — open order risk)

These 5 rules cover the highest-severity issues. Rules 6–14 should be added in a second iteration after the first scan has been validated by owner review.

---

## 8. Approval Workflow

When the Catalog Agent creates a task for a detected issue:

**Task fields:**
- `requires_approval: true` for all catalog modification tasks
- `recommended_action`: the specific suggested correction (e.g., "Set defaultPrice to ₪X based on [reference]")
- `related_entity_type: "catalog_item"`
- `related_entity_id: item.id`
- `priority`: mapped from severity (critical → critical, error → high, warn → normal, info → low)

**Human review flow:**
1. Task appears in Agent Command Center → Catalog Manager → open tasks
2. Reviewer clicks through to the catalog item
3. Reviewer makes the correction manually in the catalog UI
4. Reviewer marks the task as "completed" in the Command Center
5. Next scan will detect that the condition no longer applies → auto-resolve the exception via `autoResolveStaleExceptions`

**Rejection flow (reviewer decides not to fix):**
1. Reviewer marks the task as "dismissed" with a note
2. Agent logs this dismissal in `agent_activity_feed`
3. On next scan: agent checks if the condition still applies
   - If yes, and the task was dismissed: agent does NOT re-create the task immediately — it waits N days (*Requires owner clarification: what is the re-open delay for dismissed catalog tasks?*)
   - If the condition has cleared: exception auto-resolves

**What the agent must not do:**
- Must not apply the suggested correction directly after task creation
- Must not assume a correction was made just because a task was created
- Must not create a new task for the same issue within the same scan cycle (deduplication handles this)

---

## 9. Source of Truth — Catalog Data

When there is a conflict about what the correct catalog value should be, apply this hierarchy:

| Priority | Source | Notes |
|---|---|---|
| 1 | Owner-confirmed business rule (approved correction in Command Center) | Highest authority |
| 2 | Current production DB state (`catalog_items` where `is_active = true`) | What the system says today |
| 3 | Approved company price list | **Requires owner clarification: does a formal price list exist? In what format?** |
| 4 | Historical order data — most frequently used price for this item | Useful signal, not authoritative (may be custom/negotiated) |
| 5 | Inventory receipt data (cost price from delivery notes) | Authoritative for costPrice; not for defaultPrice |
| 6 | Agent suggestion | Never authoritative on its own |

**What the agent must not use as a price source:**
- Estimates based on product type alone
- Competitor pricing (not available)
- Averages of rejected/custom pricing from unusual orders

---

## 10. Catalog Completeness Score

The agent should track and report a catalog completeness score as part of its scan summary. This score (0–100) measures the data quality of the active catalog:

```
score = weighted average of:
  - % items with defaultPrice set (weight: 30)
  - % items with unitOfMeasure set (weight: 25)
  - % items with costPrice set, if used in orders (weight: 20)
  - % items with description non-empty (weight: 10)
  - % active items with no open error/critical exceptions (weight: 15)
```

This score should be written to `agent_activity_feed` as a structured payload at the end of each scan, and displayed in the Agent Command Center for the catalog agent card.

---

## 11. QA Test Cases

Before deploying the first scan, verify these scenarios against a test dataset:

| Scenario | Expected result |
|---|---|
| Item with defaultPrice=50, costPrice=60 | Rule 1 fires: critical exception |
| Item with defaultPrice=60, costPrice=50 | Rule 1 does not fire |
| Item with defaultPrice=null, costPrice=null | Rule 3 fires (warn only): missing price |
| Two items named "חרוט 50 ס״מ" (active) | Rule 2 fires: exact duplicate exception |
| One item named "חרוט 50 ס״מ" (active), one named "חרוט 50ס״מ" (active) | Rule 8 fires: near-duplicate warning |
| Item with is_active=false, referenced in open order | Rule 5 fires: error exception |
| Item with is_active=false, referenced only in completed order | Rule 5 does NOT fire |
| Order with miscRow description="כרטיש" and no catalogItemId | Rule 9 fires: unmapped item task |
| Order with signRow, no catalogItemId | Rule 9 fires: unmapped sign item task |
| Item with unit_of_measure="" | Rule 4 fires: missing unit exception |
| Item with unit_of_measure="יחידה" | Rule 4 does NOT fire |
| Item with dimension_value="1.5", dimension_unit="" | Rule 13 fires |
| Item with dimension_value="" | Rule 13 does NOT fire |
| Same unmapped description in 3 open orders | Rule 9 fires once (deduplicated by description, all 3 orders listed in payload) |
| Scan run twice — same issue exists both times | Exception is updated (not duplicated) |
| Issue resolved between scan 1 and scan 2 | Exception auto-resolved on scan 2 |

---

## 12. Missing Business Information — Catalog Agent Specific

| # | Item | Impact on implementation |
|---|---|---|
| 1 | Does a formal company price list exist? In what format? (Excel, PDF, another DB table?) | Determines whether Rule 3 can suggest a specific price vs. just flagging missing |
| 2 | What is the official product category tree for Elkayam? (current `category` field is free text) | Required to implement Rule 14 reliably; needed for catalog organization |
| 3 | Which items are safety-critical (must always be in stock)? | Should be flagged at higher severity than standard low-stock items |
| 4 | Which labor items should match cost_rates table rates? | Enables Rule 3 variant for labor items |
| 5 | Is there a naming convention for catalog items? (e.g., "[category] [size] [material]") | Would enable more reliable near-duplicate detection (Rule 8) and name quality checks |
| 6 | Are there item types that are legitimately priced at zero? If yes, which? | Enables Rule 6 to distinguish intentional free items from pricing errors |
| 7 | What is the re-open delay for dismissed catalog tasks? (How many days before the agent re-creates a dismissed task?) | Required for approval workflow implementation |
| 8 | Are safety accessory categories in safetyAccessories.ts the same as catalog categories? | Would establish the mapping between the data file and the DB |

---

## 13. Implementation Notes (for scan route developer)

- Follow the same pattern as `inventory-agent/scan/route.ts`: use `scan-utils.ts` functions for deduplication, exception upsert, task upsert, activity logging, and agent run status update
- Use `verifyMasterAuth` for auth
- Use `emptyScanResult` from `lib/agents/types.ts`
- Use `autoResolveStaleExceptions` at the end of the scan
- Write a scan summary to `agent_activity_feed` including the completeness score
- The scan is a POST to `/api/agents/catalog-pricing-agent/scan`
- After implementing the scan route, add `"catalog-pricing-agent"` to `SCANNABLE_AGENTS` in `AgentCommandCenter/index.tsx`
- Also fix the existing bug in the same file: add `"inventory-agent"` to `SCANNABLE_AGENTS`

---

*Last updated: 2026-05-17 | Source: codebase audit + owner input on known catalog problems*
*Next: see `agent-training-model.md` for how this agent improves over time*
