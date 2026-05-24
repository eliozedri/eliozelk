# Agent Organization Master Specification
**Elkayam Road Marking LTD — Digital Operations Command Center**
**Date:** 2026-05-17 | **Status:** Approved reference — do not implement code without reading this document first
**Companion documents:** `agent-capability-audit.md`, `agent-operating-model.md`, `agent-training-model.md`, `catalog-agent-pilot.md`, `catalog-agent-reference-mapping.md`

> **Identity migration (2026-05-24):** The central executive operations agent is **CEO, id: `ceo`** (renamed from the legacy id `ops-orchestrator`; `type` is also `ceo`, Hebrew display name stays "מנהל תפעול"). This is the single source of truth and the routing target for all managerial decisions. Older `ops-orchestrator` references denote the same agent before the rename.

---

## 1. Executive Summary

Elkayam Road Marking LTD (אלקיים סימון כבישים בע״מ) is a 30-year-old road marking and traffic services company based in Ashkelon. The Digital Operations Command Center is being built to run the business's operational pipeline as a managed, agent-assisted system — not as a dashboard or decorative reporting layer.

The system manages **15 agents** across a unified operational pipeline. Each agent is responsible for one domain of the pipeline. Together they provide the owner with a real-time command center that replaces scattered manual tracking, prevents work from falling between departments, and produces the data quality required for billing, profitability, and management control.

**Agents by phase:**

| Phase | Agents | Goal |
|---|---|---|
| Phase 1 (current) | ceo, catalog-pricing, inventory, billing, cfo, field-ops, graphics, fabrication, coordination-qa | Core pipeline control + billing readiness |
| Phase 2 | orders, equipment-fleet, digital-hq panels, supplier-support | Completeness + dispatch readiness |
| Phase 3 (later) | engineering-plan-analysis, jarvis-whatsapp, advanced profitability | Intelligence layer + external integration |

**Hard constraints across all phases:**
- Agents detect, recommend, and create tasks. They do not make commercial decisions.
- No agent may invent prices, set customer prices, or approve invoices without owner action.
- No agent may create trusted catalog items without owner approval.
- No agent may communicate externally without owner approval.
- No agent may dispatch field teams or commit schedules without human confirmation.

---

## 2. Company Context

### 2.1 Identity

| Field | Value |
|---|---|
| Hebrew name | אלקיים סימון כבישים בע״מ |
| English name | Elkayam Road Marking LTD |
| Address | רחוב הזגג 5, אזור התעשייה הדרומי, אשקלון |
| Founded | 1992 (30+ years of operation) |
| ISO 9001 | Represented on company profile — **Requires owner confirmation of current certificate** |
| Regulatory approvals | Approved by Netivei Israel — **Requires owner confirmation of full list** |

### 2.2 Business Domains

The company is not a simple product seller. It combines:

1. Road marking and road painting
2. Parking lot and yard marking
3. Bike lanes, sports courts, accessibility markings
4. Thermoplastic and cold plastic / two-component markings
5. Temporary and permanent traffic arrangements
6. Traffic sign supply and installation
7. Large, custom, and illuminated signage
8. Construction and site signage
9. Reflective and 3D signage
10. Safety accessories supply and installation
11. Guardrails and concrete barriers
12. Fencing
13. Graphics and design approval
14. Fabrication / workshop / sign production
15. Road marking removal / water blasting
16. Field crew execution
17. Work diary / field execution documentation
18. Warehouse and inventory management
19. Monthly billing and invoice preparation
20. Profitability and cost analysis
21. Customer coordination and QA before dispatch
22. Equipment, fleet, and machinery management
23. Supplier management and procurement
24. Digital operations command center

### 2.3 Main Customer Types

- Netivei Israel / נתיבי ישראל
- Port Authority / רשות הנמלים
- Municipalities and local councils
- Israel Police
- Israel Airports Authority
- Israel Electric Company / IEC
- ICL / כיל
- Alstom
- Private contractors and construction companies
- Industrial sites and logistics companies
- Government institutions

### 2.4 Known Equipment and Fleet

#### Road Marking Machines
- CMC PM50C-ST-13 — two-component cold plastic marking machine
- CMC srl model 60 C-ST (serial 03018, 2020, 11.92kW, 568kg)
- HOFMANN H11 road marking machine

#### Production / Workshop
- Laser machine G3015X
- Graphtec FC8000-130 cutting plotter
- Baykal HGL 3100x6 guillotine

#### Heavy Equipment
- ORTECO SMART 800 pile driver on crawler (2011, 21.2kW, 2950kg)
- SUNWARD SWL 3230 compact loader / צמ"ה

#### Forklift
- FD35CT forklift (chassis 309392, 3000kg capacity, 4700mm lift height)

#### Generators
- Shamdling JS 45.4 silent diesel generator (45kW, John Deere 4039D engine, serial S-4942)
- Small Mitsubishi-branded mobile unit — model requires confirmation

#### Vehicles / Trucks
- Ford Super Duty pickup
- MAN TGL truck with crane/loading arm (possibly 18.250 — requires confirmation)
- Isuzu NQR truck — license 88-165-62
- Hino 300 truck — license 231-70-602
- Isuzu D-Max pickup — license 32-806-55
- MAN TGM 15.250 truck — license 63-998-68

#### Trailers
- Open trailer with mesh/metal sides — license 99-877-79 (requires confirmation)
- Lighting trailer MB-V4 by M.Bar Maintenance LTD (2019, 690kg total, Atlas Copco lighting, license 652-20-201, chassis KG91W17AMKG098001)

**Equipment categories:**
- צי רכב (vehicle fleet)
- נגררים (trailers)
- עגלות חץ (arrow carts)
- סימון כבישים (road marking machines)
- ייצור וחיתוך (production and cutting)
- צמ"ה (heavy machinery)
- מלגזות (forklifts)
- גנרטורים (generators)
- ציוד לא מזוהה (unidentified equipment)

**Known equipment status values:** פעיל / ממתין לאישור / בשיפוץ / לא שמיש

---

## 3. Core Operating Principle

This is the fundamental logic the entire system is built around. Every agent serves this pipeline.

### 3.1 The Pipeline

```
Order → Derived Quantities → Production/Preparation → Field Execution → Field Diary → Billing/Profitability/Control
```

**This is not optional logic. This is the system's spine.**

Every feature, every agent, and every data model must serve this flow — or it should not exist.

### 3.2 Order Is the First Source of Truth

When Elkayam receives an order from a customer, the order defines the expected work. From the order, the system derives:

- Quantities, products, and services
- Signage and graphics requirements
- Production and fabrication requirements
- Warehouse and inventory needs
- Field execution needs
- Vehicle and equipment requirements
- Coordination and customer approval requirements
- Billing basis

**The order is the plan.**

### 3.3 Field Work Diary Is the Second Source of Truth

The order says what was supposed to happen. The field diary says what actually happened.

A complete field diary must capture:
- Actual work performed and actual quantities
- Actual workers, vehicles, equipment, and hours
- Materials used
- Photos and proof
- Notes from the field
- Exceptions and deviations
- Completion status

**The field diary is critical because it becomes the real basis for billing, profitability, dispute handling, operational QA, and actual-vs-planned comparison.**

### 3.4 Only After Order + Field Diary Can the System Calculate Properly

Once both sources of truth exist, the system can calculate:
- Expected vs. actual quantities
- Estimated vs. actual cost
- Billable vs. non-billable work
- Missing documentation or approvals
- Daily and job profitability
- Customer profitability
- Billing readiness

### 3.5 Inventory Builds Gradually Through Operations

Inventory does not need to be perfect on day one. Target: approximately **90%+ reliability over time**, built through:
- Receiving goods
- Scanning supplier invoices and delivery notes
- Mapping purchased items to catalog items
- Deducting/allocating stock from orders and field diary usage
- Periodic warehouse counts
- Corrections and approvals

### 3.6 Finance and Warehouse Work Together on Supplier Documents

When a supplier invoice or delivery note is scanned:

| Agent | Reads |
|---|---|
| Finance/Billing Agent | Supplier, invoice number, date, amounts, VAT, payment terms, cost allocation |
| Inventory/Warehouse Agent | Products received, quantities, units, stock impact |
| Catalog Agent | Whether invoice items match existing catalog items, whether new items need proposing |

### 3.7 The Five Product States

Products may exist in one of five states. No agent may jump a product forward without human approval:

| State | Meaning |
|---|---|
| Detected from document | Found in a supplier invoice or delivery note — not yet in catalog |
| Proposed catalog item | Awaiting owner review — not trusted for commercial use |
| Approved catalog item | Owner-approved — may appear in orders |
| Inventory stock item | Tracked in warehouse — may be reserved against orders |
| Commercial/billable product | Approved, priced, with unit — ready for use in billing |

---

## 4. Source-of-Truth Hierarchy

When an agent encounters conflicting information, it applies this hierarchy from highest to lowest authority:

| Priority | Source | Notes |
|---|---|---|
| 1 | Owner-confirmed business rule | Explicit owner approval in Command Center, or written in `docs/agents/` |
| 2 | Approved production database | Authoritative tables, current state — not cached, not computed |
| 3 | Approved customer order | Validated order in the system |
| 4 | Field work diary / actual execution evidence | Actual quantities, workers, equipment used in the field |
| 5 | Approved supplier invoice / delivery note | Received and verified against purchase |
| 6 | Approved catalog item | `catalog_items` where `is_active = true` with confirmed price and unit |
| 7 | Approved price list / reference | Mishkal 2025 FC price list or equivalent owner-confirmed reference |
| 8 | Final company catalog PDF | Official product catalog — visual reference, not automatically authoritative |
| 9 | Website / company profile | Activity and capability reference only |
| 10 | Historical order data | Signal, not fact — useful for pattern detection |
| 11 | Agent recommendation | Hypothesis — must not be applied without human approval |

**Conflict resolution rule:** If two sources at the same priority level conflict, the agent surfaces the conflict as an exception and requests human resolution. It never silently chooses one over the other.

---

## 5. Full Agent Registry

| # | Agent ID | Hebrew Name | English Name | Phase | Current Layer Status |
|---|---|---|---|---|---|
| 1 | ceo | מנהל פעילות / מנהל מערכת | Ops Orchestrator | Phase 1 | All 8 layers ✅ |
| 2 | billing-collections-agent | סוכן כספים וחיוב | Finance / Billing Agent | Phase 1 | Scan route ✅ |
| 3 | cfo-agent | סוכן סמנכ"ל כספים / רווחיות | CFO / Profitability Agent | Phase 1 | Scan route ✅ |
| 4 | field-ops-agent | סוכן ביצוע שטח / יומן עבודה | Field Operations / Work Diary Agent | Phase 1 | Scan route ✅ |
| 5 | inventory-agent | סוכן מחסן ומלאי | Inventory / Warehouse Agent | Phase 1 | Scan route ✅ (27 checks, recently added to SCANNABLE_AGENTS) |
| 6 | catalog-pricing-agent | סוכן קטלוג ותמחור | Catalog / Pricing Agent | Phase 1 | Scan route ✅ (5 MVP rules) |
| 7 | graphics-production-agent | סוכן גרפיקה ואישור עיצוב | Graphics / Design Approval Agent | Phase 1 | Config only — scan route pending |
| 8 | fabrication-agent | סוכן ייצור / מסגרייה / סדנה | Production / Fabrication / Workshop Agent | Phase 1 | Config only — scan route pending |
| 9 | coordination-qa-agent | מנהל התיאומים / QA | Coordination / QA Manager Agent | Phase 1 | Config only — scan route pending |
| 10 | orders-agent | סוכן הזמנות וניהול לקוחות | Orders / Customer Management Agent | Phase 2 | Not yet implemented |
| 11 | equipment-fleet-agent | סוכן ציוד / רכבים / תחזוקה | Equipment / Fleet / Maintenance Agent | Phase 2 | Not yet implemented |
| 12 | digital-hq-agent | סוכן מרכז שליטה דיגיטלי | Digital HQ / Neural Operations Core Agent | Phase 2 (panels) | UI exists — panel logic pending |
| 13 | engineering-plan-agent | סוכן ניתוח תוכניות / הנדסה | Engineering / Plan Analysis Agent | Phase 3 | Not yet implemented |
| 14 | supplier-support-agent | סוכן ספקים / רכש תומך | Supplier / Purchasing Support Agent | Phase 3 (candidate) | Not yet implemented — shared with inventory+finance in Phase 1 |
| 15 | jarvis-agent | ג'רוויס — ממשק WhatsApp | Jarvis / WhatsApp Communications Agent | Phase 3 | Webhook + auto-reply implemented |

---

## 6. Agent-by-Agent Profiles

---

### 6.1 Ops Orchestrator — מנהל פעילות

**Mission:** Run the operational pipeline and identify what is stuck, risky, delayed, missing, or ready for the next action. Prevent work from falling between departments.

**Autonomy level:** 2 (recommends and creates tasks; no autonomous actions)

**What it monitors:**
- Stuck orders — no status change in more than X hours per stage
- SLA breach warnings and confirmed breaches
- Missing diaries for completed field jobs
- Orders approaching scheduled dispatch without readiness
- Cross-agent exception volume and anomalies
- Orders with multiple blocking exceptions across departments
- Agent scan health (which agents have not run within expected cadence)

**What it produces:**
- Management exceptions in `agent_exceptions`
- Next-action tasks in `agent_tasks`
- Daily operational summary (morning digest)

**Forbidden:**
- No price changes
- No catalog mutations
- No financial approvals
- No dispatch override
- No owner decision override

**Depends on:** All other agents' exception and task tables as inputs.

**KPIs:** Stuck orders reduced, average order cycle time, critical exceptions resolved within target window, dispatch readiness rate, billing blockers reduced.

---

### 6.2 Finance / Billing Agent — סוכן כספים וחיוב

**Mission:** Prevent revenue leakage by detecting every completed order that has not reached invoice readiness — and flagging exactly why. Every completed order has a billing path; this agent ensures none fall through the cracks.

**Autonomy level:** 2–3 (detects blockers, creates tasks, flags candidates — never issues invoices, never changes prices, never modifies accounting records)

---

**What this agent owns:**
- The accounting pipeline state from `status = "completed"` through `accounting_status = "invoiced"`
- Detection of billing readiness blockers per completed order
- Tracking of the `accounting_status` lifecycle for all completed orders
- Inventory reconciliation gap detection (materials used but not reconciled before billing)
- Field diary billing amount entry (approved diaries with no billed amount)
- Invoice candidate list preparation for owner review
- Monthly billing sweep: all completed, uninvoiced orders in the current billing cycle

**What this agent does not own:**
- Final invoice issuance (owner action — requires `accounting_status` to reach `"approved"` manually)
- Setting or changing customer prices (owned by catalog-pricing-agent)
- Approving disputed or questionable billing items
- Closing financial disputes (`accounting_status = "disputed"`)
- CFO-level profitability analysis (owned by cfo-agent)
- Accounting record modification without explicit owner action
- Collections enforcement — legal action, credit suspension, customer escalation
- Supplier invoice processing (not yet in scope — see schema gaps)

---

**Billing cycle model:**

Elkayam operates on a **monthly billing cycle**. The primary billing review happens at month-end. The agent's main responsibility is ensuring all completed orders are billing-ready before the monthly cutoff — not generating daily alarms on every uninvoiced order.

Short time-based thresholds (72h, 168h) may be used as optional **early-warning** signals for internal visibility, but they are not the primary billing business rule. The primary rule is: **all billable completed work must appear in the current month's billing review.**

The agent should:
- Detect completed orders not ready for month-end billing
- Detect old completed/uninvoiced work from previous billing cycles (stale unbilled work)
- Treat all time thresholds as configurable/provisional until calibrated with the owner

**The accounting pipeline for a completed order:**

```
completed (status)
  ↓
pending (accounting_status)          ← scan: flag for month-end readiness review
  ↓ [billing readiness verified — see terminology note]
verified                             ← scan: flag if awaiting approval too long
  ↓ [authorized approval — see terminology note]
approved                             ← ready for SAP invoice generation
  ↓ [invoice issued in SAP; SAP invoice number manually entered into Elkayam]
invoiced  ← invoiced_at set, billed_amount set, invoice_number (SAP ref, manual)
  ↓ [payment received — recorded manually]
paid  (or partial)
```

The `disputed` status (`accounting_status = "disputed"`) can be set at any point after `pending`. The agent flags disputed orders but does not resolve them.

**Terminology clarification — `verified` vs. `approved` (Requires owner confirmation):**

The current schema distinguishes two pre-invoice states whose exact actor model is not yet confirmed:
- `verified` — interpreted as: an accounting user confirmed the order appears technically ready for billing (blockers cleared, quantities confirmed, diary approved)
- `approved` — interpreted as: an authorized person (owner or accountant) approved this order for inclusion in the next SAP invoice run

Whether these are two separate people, one person at two workflow steps, or a single combined action is not yet confirmed. Until the owner confirms the intended workflow, treat both as mandatory human-review checkpoints before any invoicing in SAP. The agent flags both stages if they stall but does not advance either status autonomously.

---

**Billing readiness logic — an order is billing-ready only when all of the following are true:**

| # | Condition | How to check | Current limitation |
|---|---|---|---|
| 1 | Order exists and `status = "completed"` | DB query | — |
| 2 | Customer name is present and non-empty | `order.customer` not null/blank | — |
| 3 | Work was performed (field diary exists and is approved, for field orders) | `work_diaries` JOIN with `approval_status = "approved"` | Scan route uses approved diary set |
| 4 | Inventory reconciliation complete (if warehouse items used) | `inventory_consumptions` record exists for the order | Implemented in scan route |
| 5 | Billing amount entered in diary (if diary-based billing) | `diary.billedAmount > 0` | Implemented — `diary_unbilled` exception |
| 6 | No open blocking exception on the order | Agent exception scan | Not yet implemented as a gate check |
| 7 | Not already invoiced | `invoiced_at IS NULL AND accounting_status NOT IN ("invoiced","paid","partial")` | Implemented — pre-filter in scan route |
| 8 | Pricing confirmed | Line-item prices in JSONB `data.signRows`/`miscRows` — **not queryable via SQL scan** | SCHEMA GAP — see below |
| 9 | Quantities confirmed | Line-item quantities in JSONB `data` | SCHEMA GAP — cannot check per-item |

---

**Phase 1 scan checks — currently implemented:**

All time thresholds are **provisional — requires calibration against Elkayam's monthly billing cycle.** The current values (72h warn, 168h critical) were set at implementation time as early-warning signals. In a monthly billing context they may be overly aggressive and generate noise. Recommended review: raise to 7 days / 30 days for the main billing checks; keep the short thresholds only as optional configurable early warnings.

| Exception / Task category | Trigger | Current threshold | Threshold note | Creates task? |
|---|---|---|---|---|
| `order_pending_billing_verification` | `accounting_status = "pending"`, completed, uninvoiced | > 72h warn / > 168h critical | **Provisional** — consider 7d/30d for monthly cycle | Yes |
| `order_awaiting_billing_approval` | `accounting_status = "verified"`, awaiting approval | > 48h warn / > 120h critical | **Provisional** — depends on billing review frequency | No |
| `inventory_reconciliation_missing` | Completed, has warehouse items, approved diary exists, no consumption record | Immediate on condition | No time gate — fires when condition is true | Yes |
| `diary_unbilled` | Approved diary, `isBillable !== false`, `billedAmount = 0` | Immediate on condition | No time gate — key month-end check | Yes |

Note: billing-collections-agent is the only agent that creates both exceptions AND tasks in the same scan. Billing blockers must appear in both the exception feed and the task queue.

**Phase 2 scan additions (not yet implemented — safe to add):**

| Proposed exception category | Trigger condition | Notes |
|---|---|---|
| `order_billing_disputed` | `accounting_status = "disputed"` on a completed order | Immediate; no time gate. Flag for owner resolution |
| `diary_missing_billing_blocker` | Completed `field_work` order with no linked approved diary AND `accounting_status = "pending"` | **Read-only for billing-agent.** Field Ops Agent owns the correction; billing-agent surfaces this as a billing pre-condition blocker it cannot resolve. |
| `billing_stalled_too_long` | Completed order uninvoiced > 30 days regardless of `accounting_status` | **30 days provisional** — aligned with monthly cycle. Should be configurable per customer billing agreement. |
| `zero_billed_amount_invoiced` | `accounting_status = "invoiced"` but `billed_amount = 0 OR NULL` | Data integrity check — invoice with no amount. May indicate SAP sync not completed. |
| `missing_sap_invoice_number` | `accounting_status = "invoiced"` but `invoice_number` is null or empty | SAP invoice number not entered after invoicing in SAP. Data integrity warning. |
| `partial_billing_open_items` | `accounting_status = "partial"` AND remaining uninvoiced billable items exist | Requires item-level billing tracking — see partial billing model below. |

---

**Partial billing model:**

In Elkayam's context, partial billing occurs when a customer has a monthly account with multiple completed jobs or items, and only a portion of the total account is invoiced in the current billing cycle. Remaining items stay open for the next cycle.

Requirements for correct partial billing support:
1. Each billable item (job, diary entry, product delivery) must be individually trackable and have its own billing status
2. `accounting_status = "partial"` on an order must not prevent remaining open items from appearing in the next billing review
3. Marking part of an account as invoiced must not close the entire order unless all billable items are covered
4. Item-level partial billing requires per-item or per-diary billing fields — not just one order-level status

**Current schema limitation:** The system tracks billing at the order level only via `accounting_status` on `work_orders`. There is no per-item or per-diary billing status column. True partial billing at item/job granularity cannot be implemented without extending the schema. **Mark as Phase 2/3 schema requirement.**

Until that schema exists, partial billing must be managed manually by the owner with notes on the order. The agent can only flag `accounting_status = "partial"` orders that have been sitting partial for too long without resolution.

---

**Collections logic — current state:**

**Phase 1: Cannot detect overdue invoices.** The DB has no `invoices` table, no `payments` table, and no `due_date` field on orders or invoices. The only collection signal available is `accounting_status = "paid"` (paid in full) vs. `"invoiced"` (invoice issued, not confirmed paid) vs. `"partial"` (partial payment). There is no date arithmetic for aging.

The `customers.payment_terms` field exists (e.g., "net 30", "COD") but there is nothing to compute from — no payment due date, no payment received date.

**Collections capability map:**

| Capability | Phase 1 | Requires (for future) |
|---|---|---|
| Detect uninvoiced completed orders | ✅ Implemented | — |
| Detect approved-not-yet-billed diaries | ✅ Implemented | — |
| Detect disputed billing | Partial (status exists, no flag yet) | Phase 2 scan addition |
| Overdue invoice detection | ❌ Not possible | `invoices` table with `due_date` |
| 30/60/90-day aging buckets | ❌ Not possible | `invoices` + `payments` tables |
| Outstanding receivables total | ❌ Not possible | Payment tracking system |
| Collections escalation workflow | ❌ Not possible | CRM / ERP integration |

---

**Approval gates — what requires owner action:**

| Action | Approval required | Notes |
|---|---|---|
| Advancing `accounting_status` from `verified` → `approved` | Yes — owner decision | Agent cannot do this autonomously |
| Final invoice issuance | Yes — owner action in SAP | Agent surfaces the candidate; owner generates invoice in SAP, then copies SAP invoice number into Elkayam |
| Price override on invoice | Yes — owner decision | Agent flags; catalog-pricing-agent owns price accuracy |
| Manual billing despite missing diary | Yes — explicit override | Agent must create a blocking exception; not silently skipped |
| Billing with `billed_amount = 0` | Yes — must be deliberate | Agent flags as `zero_billed_amount_invoiced` (Phase 2) |
| Writing off a debt / marking uncollectible | Yes — CFO-level decision | Not in agent scope at all |
| Marking invoice paid manually | Yes — owner records | No payments table; manual status change |
| Closing a billing dispute | Yes — owner action | `disputed` status stays until resolved |

---

**Cross-agent dependencies:**

| Agent | Relationship | Direction |
|---|---|---|
| Orders Agent | Provides the order record; billing-agent reads order data | Upstream |
| Field Ops / Work Diary Agent | **Field Ops Agent owns** missing diary detection and correction. Billing-agent consumes approved diary data as a billing pre-condition but does not own the fix when a diary is missing. If a field diary is absent, Field Ops Agent must resolve it; billing-agent surfaces it as a blocker (`diary_missing_billing_blocker`). Ops Orchestrator escalates if the blocker remains unresolved. | Upstream — missing diary blocks billing; correction is Field Ops responsibility |
| Catalog / Pricing Agent | Owns per-item prices in the catalog; price accuracy at order creation flows into billing correctness | Parallel — pricing errors surface as billing gaps |
| CFO / Profitability Agent | Billing-collections feeds revenue data; CFO agent aggregates across orders for margin analysis | Parallel — cfo-agent is a consumer of `invoiced` + `billed_amount` data |
| Inventory / Warehouse Agent | Owns `inventory_consumptions` reconciliation; billing-agent checks reconciliation status before billing | Upstream — missing reconciliation blocks billing |
| Coordination / QA Agent | Confirms field execution readiness; once dispatched and completed, the billing clock starts | Upstream — completion triggers billing pipeline |
| Ops Orchestrator | Escalates when billing pipeline is stalled across multiple orders | Supervisor |

---

**Forbidden actions:**
- No final invoice issuance without owner approval
- No auto-generation of official invoice numbers — all invoice numbers are SAP references entered manually
- No price changes of any kind
- No modification of `accounting_status` beyond creating exceptions and tasks that prompt human action
- No approval of billing items with missing quantities or disputed prices
- No closing of billing disputes
- No write-off of debt
- No automatic marking of invoices as paid
- No inventory consumption of any kind
- No deletion of order, diary, or accounting records
- No SAP record creation, modification, or deletion of any kind

---

**KPIs:**
- Orders completed but not yet invoiced: count + total estimated ₪ at risk
- Billing blockers active: count of open `order_pending_billing_verification` and `order_awaiting_billing_approval` exceptions
- Inventory reconciliation gaps: count of `inventory_reconciliation_missing` exceptions
- Diary billing missing: count of `diary_unbilled` exceptions
- Average days from order completion to `accounting_status = "invoiced"`
- Orders invoiced this month vs. orders completed this month (invoice coverage rate)
- Orders stuck in `verified` state (approved by operations but owner hasn't approved billing)
- Revenue leakage risk: value of orders > 30 days completed but uninvoiced

---

**Schema gaps and logic notes:**

1. **SAP is the authoritative invoicing system — no direct integration:** Elkayam issues official invoices in SAP. The Elkayam management system prepares billing candidates and tracks billing readiness, but does not replace SAP. After an invoice is generated in SAP, the SAP invoice number is manually entered into the Elkayam `invoice_number` field on `work_orders`. There is no API integration between Elkayam and SAP at this stage.

   Consequences:
   - `invoice_number` is a manual external reference field (SAP invoice number)
   - `invoiced_at` and `billed_amount` are also manually entered after SAP invoicing
   - The agent can flag `accounting_status = "invoiced"` without a matching `invoice_number` as a data integrity warning (`missing_sap_invoice_number`)
   - The system must never auto-generate official invoice numbers

2. **No internal `invoices` table:** Beyond SAP being external, the Elkayam system also has no internal invoice document entity. An invoice is only a status on `work_orders` (`invoiced_at`, `billed_amount`, `invoice_number`). Cannot track: multi-invoice per order, invoice revision history, internal line items, VAT breakdown, or partial payment allocation per item.

3. **No `payments` table:** Payments are tracked only as a status change (`accounting_status = "paid"`). No payment date, payment amount, payment method, or bank reference. Overdue detection, aging buckets, and collections workflow are all impossible without this table. Future state: a payments table linked to SAP payment confirmations.

4. **No `due_date` field:** Neither `work_orders` nor any future invoice entity has a due date. Even if `customers.payment_terms = "net 30"`, there is no field to compute "due 30 days after invoiced_at" and detect overdue. Needed before any aging logic can be built.

5. **Pricing stored in JSONB `data`:** Per-line-item pricing (for `signRows`, `miscRows`, `accessoryRows`) is embedded in the JSONB `data` column, not normalized SQL columns. The scan route cannot check "price = 0" or "price missing" per line via SQL. Only the final `billed_amount` (set at SAP invoicing time) is a normalized column. The agent relies on catalog-pricing-agent's exception output or manual review to detect pricing gaps.

6. **No "expected billing amount" / quoted amount:** `billed_amount` is only known after invoicing. The agent cannot compute revenue-at-risk using a quoted amount — only by counting uninvoiced completed orders.

7. **No item-level billing status:** Partial billing at job/diary/item granularity requires per-item billing fields that do not currently exist. The current schema supports only order-level billing status. See partial billing model above.

8. **Supplier invoices not in scope:** Remove from scope until Phase 3 when a procurement module is designed. No supplier invoices table, no purchase orders in the current schema.

---

### 6.3 CFO / Profitability Agent — סוכן סמנכ"ל כספים / רווחיות

**Mission:** Analyze profitability, detect money leaks, and give management the data needed to make decisions about pricing, customers, and operations.

**Autonomy level:** 1–2 (read-only analysis, recommendations, exceptions — no financial actions)

**What it monitors:**
- Per-job profitability: planned cost vs. actual cost vs. revenue
- Low-margin jobs (below warning threshold — **Requires owner confirmation of exact %**)
- Loss-making jobs (negative margin)
- Labor cost ratio per job
- Vehicle and equipment cost ratio per job
- Customer profitability across multiple orders
- Customers with 3+ consecutive loss-making jobs
- Overdue receivables exposure
- Orders where cost data is incomplete (costPrice missing from catalog items)

**Cost components tracked per job:**
- Workers: number × daily rate × days
- Vehicles: number × daily rate × days
- Fuel: estimated or actual
- Equipment/machines: daily rate × days used
- Materials: from catalog costPrice × quantities
- Subcontractors: if applicable
- Overhead: percentage on top
- (Exact formulas and rates **Require owner confirmation**)

**What it produces:**
- Profitability exceptions per job
- Customer risk exceptions (chronic loss)
- Missing cost data exceptions
- Management profitability report

**Forbidden:**
- No modification of financial records
- No automatic price setting
- No customer credit blocking without owner-approved rule
- No invoice approval
- No financial recommendations with confidence level below HIGH

**KPIs:** Gross margin by job/customer/month, loss-making job count, labor cost ratio, equipment cost ratio, revenue leakage estimate, overdue receivables total.

---

### 6.4 Field Operations / Work Diary Agent — סוכן ביצוע שטח / יומן עבודה

**Mission:** Capture actual field execution and convert field reality into billing and profitability data. Ensure no completed job goes un-documented.

**Autonomy level:** 2 (detects gaps, creates tasks, compares planned vs. actual — no field decisions)

**What it monitors:**
- Orders completed but no diary filed within threshold hours
- Diaries filed but missing required fields (workers, quantities, hours, photos)
- Diaries filed but not approved within threshold hours
- Mismatch between quantities in order vs. quantities in diary
- Mismatch between workers/vehicles in assignment vs. diary
- Jobs open in the field for unexpectedly long duration
- Materials used in diary that were not reserved from inventory

**Required diary fields (proposed — Requires owner confirmation):**
- Related order/job
- Date, site/location, customer
- Crew/team, workers, team leader
- Vehicles, equipment/machines used
- Start time, end time, actual hours
- Actual quantities and work performed
- Materials used
- Photos/proof
- Completion status
- Notes, delays, exceptions

**What it produces:**
- Missing diary exceptions
- Incomplete diary exceptions
- Planned-vs-actual mismatch tasks
- Field-to-billing handoff readiness signal

**Forbidden:**
- No invented field quantities
- No false marking of completion
- No billing approval alone
- No deletion of field evidence

**KPIs:** Diary completion rate within 24h, missing diary count, planned-vs-actual mismatch count, billing-ready diary count, field reporting delay average.

---

### 6.5 Inventory / Warehouse Agent — סוכן מחסן ומלאי

**Mission:** Build and maintain reliable stock visibility while the business runs, and ensure no order is dispatched without the required materials.

**Autonomy level:** 2 (detects and recommends — proposes receiving tasks, does not update stock automatically)

**Current status:** 27 detection checks implemented. Recently added to `SCANNABLE_AGENTS`.

**What it monitors:**
- Stock levels below minimum threshold per product/category
- Stock at zero with open orders requiring that item
- Inventory reservation cache mismatch (`reserved_quantity` ≠ `SUM(active reservations)`)
- Items received from supplier but not yet put away / linked to catalog
- Open purchase orders past expected delivery date
- Materials required for upcoming dispatches with insufficient stock
- Movements without corresponding order reference

**Inventory build loop:**
Stock accuracy improves over time through: receiving goods, scanning supplier documents, connecting purchases to catalog items, deducting from field diary usage, periodic warehouse counts, owner-approved corrections.

**What it produces:**
- Stock shortage exceptions
- Receiving task proposals
- New-item-from-invoice proposals (state: "proposed stock item" — awaiting approval)
- Reservation mismatch exceptions
- Job-readiness blocking exceptions

**Forbidden:**
- No automatic stock update from OCR/scanned invoice without human review
- No automatic trusted product creation from documents
- No supplier invoice approval for payment
- No deletion of stock items
- No unverified stock deduction

**KPIs:** Inventory accuracy %, stockout count, receiving tasks unresolved, invoice-to-stock mapping rate, jobs blocked by stock shortage.

---

### 6.6 Catalog / Pricing Agent — סוכן קטלוג ותמחור

**Mission:** Maintain product and service data quality so that billing, profitability, and order execution can rely on correct prices, units, and categories.

**Autonomy level:** 1–2 (detects problems, creates tasks, suggests mappings — never changes live data without approval)

**Current status:** 5 MVP detection rules implemented. Scan route live.

**What it monitors:**
- Active commercial items missing `defaultPrice` (or price = 0 without exception whitelist)
- Active items missing `unit`
- Active items missing `costPrice` (required for profitability calculation)
- Exact duplicate or near-duplicate product names (threshold **Requires owner confirmation**)
- Inactive items referenced in open orders
- Items from supplier invoices not yet mapped to catalog (new item detection)
- Price below cost (if both values exist)

**Key reference sources:**
- `catalog.pdf` — product category reference, visual reference
- `safetyAccessories.ts` — 37 safety accessory items (`defaultPrice = 0` as a temporary placeholder — not approved commercial prices)
- `signs.ts` — ~327 sign reference records
- Mishkal 2025 FC price list — reference for tender pricing and market price structure
- Supplier invoices and delivery notes — source of proposed new items

**What it produces:**
- Data quality exceptions per catalog item
- Duplicate item detection tasks
- New-item proposals (state: "proposed catalog item")
- Catalog completeness score per item and portfolio

**Product approval states (no agent may skip a state):**
Detected → Proposed → Approved by owner → Assigned unit/category → Priced → Commercial/billable

**Forbidden:**
- No price invention
- No automatic product deletion
- No automatic merge or rename of products
- No automatic commercial catalog approval
- No suggested prices written into live records
- No fuzzy product matching applied without approval

**KPIs:** % active items with price, % active items with unit, duplicate count, completeness score average, unresolved catalog exceptions, proposed items awaiting owner review.

**Safety accessories — price = 0 placeholder behavior (Phase 1):**

All 37 safety accessory items (`sa-001` through `sa-037`) currently carry `defaultPrice = 0` as a **temporary placeholder**. This is an explicit operational convention for Phase 1 — it does not block the Agent Organization Master Spec or Phase 1 planning. It blocks billing and commercial use only.

**What price = 0 means in this system:**

| Statement | Correct interpretation |
|---|---|
| price = 0 | Temporary placeholder — real approved price not yet entered |
| price = 0 | Does NOT mean the item is free |
| price = 0 | Does NOT mean the item is ready for billing |
| price = 0 | Does NOT mean the Catalog Agent may approve or use it commercially |
| price = 0 | Catalog Agent must flag this the same as a missing price |

**Phase 1 agent behavior for price = 0 items:**

| Condition | Agent action |
|---|---|
| Item has `defaultPrice = 0` | Catalog Agent creates exception: "Price = 0 on active item [X] — treated as unapproved placeholder, not a confirmed commercial price" |
| Order contains an item with `defaultPrice = 0` | Finance/Billing Agent marks the order as billing-blocked: "Item [X] has placeholder price 0 — real approved price required before invoicing" |
| Agent detects a reference price in catalog PDF or Mishkal list | May surface as context in the exception payload only — "Reference: approximately [X] NIS" — must NOT write this value into `defaultPrice` |
| Owner enters a real approved price (any value ≠ 0) | Exception auto-resolves on next scan |
| Item is reference-only, not a commercial product | Owner must explicitly classify it as `is_active = false` or mark as reference-only — the agent cannot infer this from price = 0 alone |

**Exception severity for price = 0 (provisional):** Treat as **warning** severity. Not critical — the item exists and is trackable — but it blocks billing. See Section 13, questions SA-1 through SA-6 for owner calibration.

**What the agent must never do:**
- Invent a price for any item
- Write any suggested or reference price into `defaultPrice`, `costPrice`, or any related field
- Mark an order billing-ready if it contains an item with `price = 0`
- Treat "item appears in catalog PDF" as confirmation of a real price
- Treat price = 0 as meaning the item is free, non-billable, or excluded from commercial tracking

---

### 6.7 Graphics / Design Approval Agent — סוכן גרפיקה ואישור עיצוב

**Mission:** Ensure graphic and design work is complete, the design proof has been approved by the customer, and graphics work is not blocking production or dispatch.

**Autonomy level:** 2 (detects, tracks, warns — no customer contact, no production release)

**The two customer approval tracks — do not confuse:**

This agent owns **Track 1: Design/Graphics Proof Approval** only. Track 2 (execution scheduling approval) belongs to Coordination/QA and Orders agents. See Section 19.6 for the full schema gap analysis.

| Track | Meaning | DB column | Owner agent |
|---|---|---|---|
| Track 1 — Design proof approval | Customer approved the design file / sketch before production | `design_approval_status` (added 2026-05-18) | Graphics/Design Agent |
| Track 2 — Execution scheduling approval | Customer confirmed when/where we can come do the job | `customer_approval_status` (exists) | Coordination/QA + Orders Agent |

**Order types that require design proof approval (Track 1):**
- Custom signs (any shape, size, material)
- Signs by size / non-catalog dimensions
- Printed signs and stickers
- Logo and signage work
- Construction signage
- Any order where a design proof or sketch must be shown to the customer before production begins

**Order types that do NOT require design proof approval:**
- Standard catalog product supply (safety accessories, standard items)
- Road marking work (execution-only — no design proof)
- Equipment/machine rentals
- Fabrication-only orders with no external customer sign-off
- Repeat orders with explicitly pre-approved templates

**What it monitors:**
- Orders requiring graphics with no work started after threshold hours in `graphics_pending`
- Active graphics jobs exceeding expected completion time in `graphics_active`
- Design proof completed (`graphics_done`) but not yet sent to customer
- Design proof sent but no customer approval response after threshold hours (Track 1)
- Design proof returned for revision — track revision count, flag excessive loops
- Graphics operator queue overload (too many jobs in `graphics_active` simultaneously)
- Orders approaching scheduled installation date where design proof not yet approved

**What it produces:**
- SLA-breach exceptions per graphics stage (`sla_graphics_pending`, `sla_graphics_active`, `sla_graphics_done`)
- Design proof approval overdue exceptions (Track 1 — requires `design_approval_status` column)
- Production blocker exceptions (design proof not approved, cannot proceed)
- Graphics cycle time summary

**Design approval status — column added 2026-05-18:**

`design_approval_status` now exists on `work_orders` (nullable `text`, no CHECK constraint). The KNOWN LOGIC RISK in the scan route (`customer_approval_status` used as design proxy) has been resolved — the broken block was removed and replaced with correct Track 1 detection using `design_approval_status`.

Supported values (written by application layer):

| Value | Meaning |
|---|---|
| `null` | Design proof flow not yet started / not evaluated |
| `not_required` | Order does not require a design proof |
| `pending_send` | Design ready; proof not yet sent to customer |
| `sent` | Proof sent to customer — awaiting approval (exception fires here) |
| `approved` | Customer approved the design; cleared for production |
| `rejected` | Customer rejected — revision required |
| `revision_requested` | Customer requested changes before final approval |
| `bypassed_by_manager` | Design approval bypassed by authorized manager/owner (see bypass section below) |

**Manager/Owner bypass — design approval:**

Sometimes the customer does not need to approve the design, or management decides the job can proceed without explicit customer sign-off. Examples: repeat customer, repeat design, standard product, minor revision, urgent operational need, customer previously approved the pattern/template.

This is **not** customer approval and must not be recorded as such. The bypass is an explicit management decision.

Bypass behavior in scan logic:
- If `design_approval_status` is `approved`, `not_required`, or `bypassed_by_manager` → no design approval exception
- If `design_approval_status` is `sent` and no approval after threshold → `design_approval_pending` exception fires
- Exception resolution: either customer approves the proof, or an authorized manager sets `design_approval_status = 'bypassed_by_manager'`

**Future schema improvement (Phase 2):**

The single `bypassed_by_manager` value does not capture who authorized the bypass, when, or why. A future migration should add:

| Column | Type | Purpose |
|---|---|---|
| `design_approval_bypass_reason` | `text` | Free-text reason for the bypass |
| `design_approval_bypass_approved_by` | `text` | Manager/user who authorized |
| `design_approval_bypass_approved_at` | `timestamptz` | When the bypass was authorized |

Until these fields exist, the bypass is traceable only via `order_activities` log entries. See §19.6 for schema gap detail.

**Forbidden:**
- No direct customer contact
- No automatic customer approval reminders (must be approved by human)
- No release to production if required design approval is missing
- No design file deletion
- Do not treat `customer_approval_status` as a design proof approval indicator

**KPIs:** Average graphics cycle time, design approval overdue rate, orders blocked by graphics, first-pass design approval rate.

---

### 6.8 Production / Fabrication / Workshop Agent — סוכן ייצור / מסגרייה / סדנה

**Mission:** Track the fabrication lifecycle for every order requiring production work. Detect delays, missing pre-conditions, stuck production, and handoff failures before they block dispatch.

**Autonomy level:** 2 (detects, tracks, creates tasks — does not start or stop production, does not own stock)

---

**What this agent owns:**
- The full `fabrication_status` lifecycle for all orders where `fabrication_required = true`
- Detection of production delays and SLA breaches within the production stage
- Flagging missing or unclear production requirements before fabrication starts
- Flagging material shortages that block production
- Detecting the `fabrication_gate_open` state: when fabrication is done internally (`status = "ready"`) but the workflow gate has not been formally closed (`status = "completed"`)
- Monitoring known workshop machinery informational state

**What this agent does not own:**
- Customer approval of any kind (neither design proof approval — Track 1 — nor execution scheduling approval — Track 2)
- Warehouse/inventory stock levels (owned by inventory-agent)
- Final billing or pricing decisions
- Catalog price approval
- Field execution scheduling (owned by coordination-qa-agent and field-ops-agent)
- Equipment maintenance (owned by equipment-fleet-agent)
- Order data mutation (never modifies orders, status, or prices)

---

**The fabrication status lifecycle:**

```
pending → acknowledged → in_progress → ready → completed
                                              ↘ issue
```

| Status | Meaning | Gate state |
|---|---|---|
| `pending` | Order assigned to fabrication; team not yet acknowledged | Open — gate blocked |
| `acknowledged` | Team confirmed receipt; production not yet started | Open — gate blocked |
| `in_progress` | Fabrication actively in progress | Open — gate blocked |
| `ready` | Fabrication team considers work physically done (internal state) | **Still open** — gate requires `completed` |
| `completed` | Officially complete — workflow gate closed, dispatch allowed | **Closed** |
| `issue` | Team flagged an active problem | Open — gate blocked |

**Important:** `ready` does not close the dispatch gate. Only `completed` closes it. This is enforced by `canMarkReadyForInstallation()` in `workflowEngine.ts`. The `fabrication_gate_open` exception exists specifically to flag orders stuck at `ready` without advancing to `completed`.

---

**When production should start — upstream pre-conditions:**

Production should start (or be confirmed ready to start) only when all of the following conditions are met:

1. **Order stage:** Order has entered the `production` status in the pipeline (valid transitions: `graphics_done → production` or, if no graphics, `graphics_done → ready_installation` bypassing fabrication)
2. **Design proof approval (Track 1):** If the order requires a design proof, the proof must be approved by the customer before fabrication begins. This cannot currently be verified by scan because `design_approval_status` does not yet exist in the DB — see §19.6. Until that column exists, this pre-condition cannot be enforced automatically.
3. **Production requirements clear:** The `FabricationDetails` (description, dimensions, quantity, material) must be populated. Stored in the JSONB `data` column — not individually queryable by scan route; unclear requirements surface as `order_problems.category = "fabrication_unclear"`.
4. **No blocking material shortage:** No open `order_problems` with `category = "material_shortage"` on this order.
5. **No open blocking exception:** No unresolved critical exception on the order from any agent.

---

**What counts as "stuck production" — Provisional SLAs:**

All thresholds are **provisional — requires owner calibration** once real production cycle data is available. Urgency factor applies: urgent orders use `0.5×` all thresholds.

| Condition | Current threshold (Phase 1) | Severity | Alignment with workflowEngine STAGE_SLA |
|---|---|---|---|
| Acknowledged but production not started | 24h (urgent: 12h) | warn | Not in STAGE_SLA (fabrication internal) |
| In progress without update | 72h (urgent: 36h) | error | Matches `production` stage `warnH: 72` in workflowEngine |
| In progress — critical overrun | 120h (urgent: 60h) | critical | Matches `production` stage `criticalH: 120` in workflowEngine |
| Issue flagged by fabrication team | Immediate | critical | — |
| Ready but gate not closed | Immediate | warn | — |

**SLA calibration note:** The scan route's `FABRICATION_STUCK_H = 72` fires at `error` severity. The Ops Orchestrator's `STAGE_SLA` fires at `warn` severity at the same 72h threshold. This means the fabrication-agent is more aggressive in its escalation than the orchestrator-level SLA. Calibrate both together once production duration data is available.

**Normal production durations by order type (all Require owner calibration — values unknown):**
- Standard sign order: ___ hours
- Complex/custom sign order: ___ hours
- Safety accessories kit: ___ hours (likely very short — mostly warehouse, not fabrication)
- Road marking materials preparation: ___ hours
- Metal/fabrication-specific work: ___ hours

---

**Phase 1 scan checks — currently implemented:**

| Exception category | Trigger condition | Severity | Notes |
|---|---|---|---|
| `fabrication_issue` | `fabrication_status = "issue"` | critical | Immediate; no time gate |
| `fabrication_stuck_in_progress` | `fabrication_status = "in_progress"` > 72h without update | error | Uses `updated_at` as proxy — see schema gap below |
| `fabrication_acknowledged_overdue` | `fabrication_status = "acknowledged"` > 24h without update | warn | Uses `updated_at` as proxy |
| `fabrication_gate_open` | `fabrication_status = "ready"` (gate not closed) | warn | Immediate; no time gate |

**Phase 2 scan additions (not yet implemented — safe to add):**

| Proposed exception category | Trigger condition | Notes |
|---|---|---|
| `fabrication_pending_unacknowledged` | `fabrication_status = "pending"` > threshold hours | Order sent to fabrication with no acknowledgement |
| `fabrication_unclear_blocking` | Open `order_problems` with `category = "fabrication_unclear"` on production-stage order | Requires `order_problems` join |
| `material_shortage_blocking` | Open `order_problems` with `category = "material_shortage"` on production-stage order | Requires `order_problems` join |
| `fabrication_completed_not_advancing` | `fabrication_status = "completed"` but order still in `production` status > threshold | Gate closed but coordinator hasn't advanced the order |

---

**Cross-agent dependencies:**

| Agent | Relationship | Direction |
|---|---|---|
| Orders Agent | Provides validated, correctly typed orders into the production pipeline | Upstream |
| Graphics/Design Agent | Must complete design proof approval (Track 1) before fabrication starts on design-required orders | Upstream — SCHEMA GAP: cannot verify until `design_approval_status` exists |
| Inventory/Warehouse Agent | Owns material stock levels; fabrication-agent detects shortage blocking (via order_problems) but does not own stock | Parallel — inventory-agent raises `material_shortage` problems |
| Coordination/QA Agent | Consumes `fabrication_status = "completed"` as G1 gate; dispatches when fabrication-agent confirms readiness | Downstream consumer |
| Field Ops Agent | No direct interaction; field execution happens after fabrication is complete | Downstream |
| Finance/Billing Agent | Fabrication completion contributes to billing readiness; finance-agent doesn't pull from fabrication-agent directly | Downstream |
| Ops Orchestrator | Escalates when fabrication stage SLA is breached; reads fabrication-agent exceptions for health score | Supervisor |

---

**Forbidden actions:**
- No automatic start of production
- No marking `fabrication_status = "completed"` without real evidence
- No consuming or decrementing inventory without approved rules
- No overriding a missing or unapproved design proof (Track 1) to start fabrication
- No overriding a `material_shortage` exception
- No customer approval decisions of any kind
- No commercial price changes
- No modifying order data (quantities, specifications, dates)

---

**KPIs:**
- Production tasks open: count of orders with `fabrication_required = true` AND `fabrication_status != "completed"`
- Production tasks with active issue: count with `fabrication_status = "in_progress"` or `"issue"`
- Stuck production count: exceptions flagged as `fabrication_stuck_in_progress`
- Production blocked by unclear requirements: open `fabrication_unclear` order problems (Phase 2)
- Production blocked by material shortage: open `material_shortage` order problems (Phase 2)
- Production ready for coordination: `fabrication_status = "completed"` AND order not yet at `ready_installation`
- Average production cycle time: acknowledged_at → completed_at (Phase 2 — requires timestamp columns in DbOrderRow)
- Late production items: count exceeding `criticalH` threshold

---

**Known production machinery (informational):**
- Laser G3015X
- Graphtec FC8000-130
- Baykal HGL 3100x6 guillotine

These machines are not tracked in the DB. Machine availability, downtime, and maintenance are not yet modeled. Add to Phase 3 if machine-level tracking is required.

---

**Schema gaps and logic notes:**

1. **`updated_at` used as fabrication status timestamp proxy:** The scan route uses `order.updated_at` to measure how long the order has been in the current `fabrication_status`. This is unreliable — any field update (not just fabrication status change) resets `updated_at`. The DB does have `fabrication_acknowledged_at` and `fabrication_completed_at` columns (from migration `20260513152533`) but they are not included in `DbOrderRow`. Adding them to the scan query would make SLA checks accurate.

2. **`fabrication_details` not individually queryable:** Production requirements (description, dimensions, quantity, material) are stored in the JSONB `data` column, not normalized columns. Cannot check for missing/incomplete production specs via SQL scan. Relies on `order_problems.category = "fabrication_unclear"` as an indirect signal.

3. **Design proof approval gap:** No `design_approval_status` column exists — cannot verify that graphics were approved before fabrication started (see §19.6). This means the agent cannot enforce pre-condition #2 (design approval before production).

4. **No dedicated fabrication work items table:** Production tasks are tracked only via a status field on `work_orders`, not as independent work items with their own timestamps, assignees, or sub-tasks. For multi-step production (cut → weld → paint → inspect), there is no granularity below the order level. Mark as Phase 3 schema requirement if granular production tracking is needed.

---

### 6.9 Coordination / QA Manager Agent — מנהל התיאומים / QA

**Mission:** Ensure jobs are truly ready before they are dispatched to the field. Coordinate timing with customers. Prevent teams from being sent unprepared.

**Autonomy level:** 2–3 (verifies all readiness gates, creates blockers — never approves dispatch alone)

**This agent is the pre-dispatch gate.** Every job must pass its checklist before dispatch.

**Pre-dispatch gate checklist (proposed — Requires owner confirmation for final gate list):**

| Gate | Condition | Approval track | Source agent |
|---|---|---|---|
| G1 | Fabrication complete | — | Fabrication Agent |
| G2 | Warehouse status = ready | — | Inventory Agent |
| G3 | All required inventory items reserved and available | — | Inventory Agent |
| G4 | Design proof approved by customer (where design work required) | **Track 1 — design proof** | Graphics Agent (schema gap — see §19.6) |
| G5 | Customer confirmed execution timing and site access | **Track 2 — execution scheduling** | Coordination/QA (via `customer_approval_status`) |
| G6 | Field crew assigned | — | Field Ops |
| G7 | Required vehicles assigned | — | Equipment/Fleet Agent |
| G8 | Required equipment/machines assigned and ready | — | Equipment/Fleet Agent |
| G9 | Required certifications valid for assigned crew (if required) | — | HR/Compliance |
| G10 | No open blocking exception on the order | — | Any agent |

**The two approval gates are different:**
- **G4 (design proof)** — customer approved the design file/sketch. This is Track 1 and belongs to the Graphics Agent. Cannot be enforced until `design_approval_status` column is added. Do not use `customer_approval_status` to check this gate.
- **G5 (execution scheduling)** — customer confirmed when and where the job can be performed. This is Track 2 and is owned by this agent. Currently implemented as the `pending_approval_blocking` exception: fires when `customer_approval_status === "pending"` on a `ready_installation` order, meaning the order is technically ready but execution has not been customer-confirmed. `customer_approval_status` is the correct column for this check.

**What it produces:**
- Gate-failure exceptions per job (`gate_fabrication_open`, `gate_warehouse_open`, `pending_approval_blocking`)
- Dispatch readiness score per job
- Missing-readiness tasks assigned to responsible department
- Escalation when dispatch < X hours away and gates are not green

**Forbidden:**
- No overriding of critical missing data
- No dispatch approval if required gate data is missing
- No invention of customer confirmation
- No equipment safety override
- Do not check `customer_approval_status` for design proof approval (Track 1) — that column is Track 2 only

**KPIs:** Jobs dispatched with all gates green, dispatch blocker count, gate failures by gate type, same-day failure count (dispatched but returned).

---

### 6.10 Orders / Customer Management Agent — סוכן הזמנות וניהול לקוחות

**Mission:** Protect the order record as the first source of truth. Validate completeness at intake, detect stale or stuck early-stage orders, and ensure no order with a customer execution scheduling commitment is forgotten.

**Autonomy level:** 2 (validates, flags, detects — never modifies order data, prices, or customer records)

---

**What this agent owns:**
- Intake validation: completeness checks on all orders in `draft` and early-pipeline stages
- Draft lifecycle: detecting and escalating stale drafts before they are lost
- Order type routing: ensuring `order_type` is set and that downstream requirements are determinable
- **Execution scheduling approval (Track 2):** detecting standby orders where the customer has not approved execution timing — `customer_approval_status = "pending"`. This is the approved owner of Track 2.
- Early-pipeline progression: orders stuck at `graphics_pending` without the graphics team being notified
- Pipeline stall detection: orders that have not advanced past early stages within expected time

**What this agent does not own:**
- Graphics work or design proof approval (Track 1 — owned by graphics-production-agent)
- Fabrication management
- Field execution scheduling or dispatch
- Billing and pricing decisions
- Coordination/QA pre-dispatch gates (owned by coordination-qa-agent)
- Customer commercial terms (prices, credit, discounts)
- Order data modification of any kind

---

**The two approval tracks — orders-agent scope:**

| Track | Column | Value meaning | Owner |
|---|---|---|---|
| Track 1 — Design proof approval | `design_approval_status` (not yet in DB) | Customer approved design file/sketch | Graphics/Design Agent |
| **Track 2 — Execution scheduling approval** | `customer_approval_status` | `"pending"` = standby (customer hasn't confirmed when/where to execute); `"approved"` = customer confirmed execution timing | **Orders Agent + Coordination/QA** |

Orders-agent detects standby aging (Track 2); coordination-qa enforces the gate at `ready_installation` (Track 2). Both use the same `customer_approval_status` column for different lifecycle stages.

---

**Current `order_type` values (confirmed in DB):**

| Value | Hebrew label | Downstream routing |
|---|---|---|
| `field_work` | ביצוע עבודה | May require: graphics → fabrication → warehouse → field execution → scheduling |
| `pickup` | הזמנה לאיסוף | May require: graphics → fabrication → warehouse. No field execution or scheduling. |
| `equipment_supply` | אספקת ציוד | May require: warehouse. Depends on `fulfillment_method` (delivery vs. self-pickup). |

**Note:** The proposed 10+ business-level order type classifications in earlier spec versions (road marking, traffic arrangement, etc.) do not match the three DB values. Business taxonomy may be richer, but the scan rules must use these three confirmed values. If finer classification is needed, it should be added as a separate `order_subtype` field — not by expanding `order_type`.

---

**Order intake validation — what makes an order "valid enough to proceed":**

Phase 1 validation checks against currently available normalized columns only.

| Required field | DB column | Validation | Current status |
|---|---|---|---|
| Customer name | `customer` | Not null, not empty string | Implemented in scan |
| City / location | `city` | Not null, not empty | Implemented in scan |
| Order date | `order_date` | Not null, not empty (stored as text — not a date column) | Implemented in scan |
| Order type | `order_type` | One of: `field_work`, `pickup`, `equipment_supply` | Not yet checked by scan (Phase 2) |
| Contact person | `contact_person` | Not null | Not yet checked (Phase 2) |
| Product/job description | In JSONB `data.signRows` / `miscRows` | Not empty array | Not individually queryable via SQL (schema gap) |
| Quantities | In JSONB `data.*Rows[].quantity` | > 0 | Not individually queryable via SQL (schema gap) |
| Price/quote status | No dedicated column | Cannot check per-item pricing via SQL | Schema gap |

**Standby state — execution scheduling approval (Track 2):**

An order in standby means the customer has requested or approved the work in principle but has not confirmed when or where it can be executed. This is tracked via `customer_approval_status = "pending"`. These orders are:
- Not cancelled
- Not ready for dispatch
- Not stuck — intentionally waiting on customer
- At risk of being forgotten if left unmonitored

The orders-agent detects aging standby orders (30-day warn, 90-day error thresholds — provisional). Coordination-qa-agent enforces the standby gate at `ready_installation` stage.

---

**Phase 1 scan checks — currently implemented:**

All thresholds are **provisional — requires owner calibration.**

| Exception category | Trigger | Current threshold | Severity |
|---|---|---|---|
| `draft_overdue` | `status = "draft"` not submitted | > 48h warn / > 96h error (urgent: × 0.5) | warn / error |
| `incomplete_order_fields` | `draft` or `graphics_pending` with missing customer, city, or order_date | Immediate on condition | warn |
| `graphics_not_sent` | `graphics_pending` with no `graphics_sent_at` | > 4h warn / > 24h error (urgent: × 0.5) | warn / error |
| `standby_order_aged` | `customer_approval_status = "pending"` across all non-final statuses | > 720h (30d) warn / > 2160h (90d) error | warn / error |

Note: `incomplete_order_fields` skips `order_type` check — the `order_type` column has `NOT NULL DEFAULT 'field_work'`, so it is always set. A missing-type check would never fire. This is intentional.

**Phase 2 scan additions (not yet implemented — safe to add):**

| Proposed exception category | Trigger condition | Notes |
|---|---|---|
| `missing_contact_person` | `draft` or `graphics_pending` with null/empty `contact_person` | `contact_person` is in DbOrderRow — can be checked |
| `order_type_may_be_defaulted` | `order_type = "field_work"` on a `pickup` or supply-type order | Heuristic check — e.g., no `graphics_sent_at` but has `warehouse_required = true` without a field execution flag. Requires owner rules to define. |
| `stuck_draft_no_activity` | `status = "draft"` with `updated_at` unchanged > threshold | Sharper than `draft_overdue` — specifically targets drafts with no editing activity |
| `graphics_pending_long_aged` | `status = "graphics_pending"` > threshold days | Cross-checks with graphics-agent SLA exceptions |
| `standby_never_updated` | `customer_approval_status = "pending"` with `updated_at` unchanged > 180 days | Deep standby — no touch in 6 months, may be abandoned |

---

**Cross-agent dependencies:**

| Agent | Relationship | Direction |
|---|---|---|
| Graphics/Design Agent | Orders-agent detects `graphics_not_sent` (pipeline dispatch gap); graphics-agent takes over once `graphics_pending` is active | Handoff — orders-agent triggers, graphics-agent manages |
| Fabrication Agent | Orders-agent validates that orders requiring fabrication have `fabrication_required` set; fabrication-agent manages the lifecycle from `production` stage onward | Handoff |
| Inventory/Warehouse Agent | Orders-agent validates `warehouse_required` is set on supply orders; inventory-agent manages stock and reconciliation | Handoff |
| Coordination/QA Agent | Coordination-qa enforces Track 2 gate at `ready_installation`; orders-agent detects Track 2 aging earlier in the pipeline (any status) | Parallel — both use `customer_approval_status` |
| Billing/Collections Agent | Completed orders feed into billing; orders-agent's intake quality directly affects billing completeness (missing customer name = billing blocker) | Upstream |
| Ops Orchestrator | Escalates when intake blockers remain unresolved across multiple orders | Supervisor |

---

**Forbidden actions:**
- No modification of order data (quantities, dates, customer, order type)
- No modification of customer commercial terms
- No price setting or price adjustment
- No advancing `accounting_status` or billing status
- No closing or cancelling orders without evidence and explicit owner action
- No marking `customer_approval_status = "approved"` autonomously
- No invented quantities, descriptions, or field values

---

**KPIs:**
- Incomplete orders count (by missing field type)
- Stale draft count: orders in `draft` > 48h
- Graphics not dispatched: orders in `graphics_pending` > 4h without `graphics_sent_at`
- Standby orders count: `customer_approval_status = "pending"` by aging bucket (< 30d / 30–90d / > 90d)
- Average time from order creation to leaving `draft` status
- Orders in `draft` > 1 week (likely abandoned)

---

**Schema gaps and logic notes:**

1. **`order_date` is a text field:** Stored as a text string, not a `date` or `timestamptz` column. Cannot do date arithmetic or sort by order date via SQL without casting. The `incomplete_order_fields` check correctly tests for null/empty text but cannot validate that the date is a valid calendar date.

2. **Per-item fields in JSONB:** Quantities, descriptions, and prices for individual line items (`signRows`, `miscRows`, `accessoryRows`) are stored in the JSONB `data` column. Cannot check "quantity = 0" or "missing description" per line via SQL scan. Item-level validation requires either normalizing these into proper tables or accepting that item-level completeness checking is out of scope for Phase 1.

3. **No `on_hold` status:** Orders paused by explicit owner decision cannot be distinguished from orders that are genuinely stuck. An `on_hold` status would prevent orders-agent from flagging them as overdue. Currently, owner must manually review any order flagged as stuck to determine if it is actually on hold. See §19.2 for migration priority.

4. **`order_type` defaults to `"field_work"`:** The `order_type` column has `NOT NULL DEFAULT 'field_work'`. This means orders that were never explicitly typed are silently `field_work`. If a pickup or supply order is created without setting `order_type`, it will be misclassified and routed incorrectly. No scan check can currently detect this silently wrong default — it would require a separate "order_type likely wrong" heuristic.

5. **Proposed order type taxonomy vs. actual DB values:** The business may describe orders in richer terms (road marking, traffic arrangement, signage + installation, etc.) but the DB only has three values. Any business taxonomy beyond these three must be represented through other fields (`order_subtype`, tags, or notes) — not by expanding `order_type`.

---

### 6.11 Equipment / Fleet / Maintenance Agent — סוכן ציוד / רכבים / תחזוקה

**Mission:** Ensure vehicles, machines, trailers, and equipment required for field jobs are available, maintained, and safe/valid for dispatch.

**Autonomy level:** 2 (detects readiness issues, creates maintenance tasks — never marks unsafe equipment as ready)

**Phase 2 implementation target.**

**What it tracks per equipment item:**
- Name, category, license number, serial/chassis number
- Status (פעיל / ממתין לאישור / בשיפוץ / לא שמיש)
- Maintenance records (last service, next service due)
- Regulatory test/inspection dates and expiry
- Insurance expiry (Requires owner confirmation)
- Current job assignment
- Known defects
- Required documents

**What it monitors:**
- Vehicle or equipment with expired regulatory test/inspection
- Vehicle or equipment approaching test/inspection expiry (warning threshold days — **Requires owner confirmation**)
- Equipment in maintenance for unexpectedly long duration
- Equipment required for an upcoming job currently marked as not-ready
- No vehicle assigned to an order approaching dispatch date
- Fuel cost variance vs. expected (if fuel tracking exists)

**Dispatch readiness:** Works with Coordination/QA Agent. Before dispatch, vehicle and equipment must be:
- Status = פעיל
- No expired test/inspection
- No open blocking maintenance issue
- Assigned to the job

**What it produces:**
- Maintenance overdue exceptions
- Inspection expiry warnings
- Equipment unavailable/blocking dispatch exceptions
- Missing document tasks

**Forbidden:**
- No marking unsafe equipment as ready
- No modification of official vehicle/license data without source document
- No deletion of equipment records
- No approval of maintenance invoices alone
- No override of owner safety decision

**KPIs:** Active equipment readiness %, overdue maintenance count, jobs blocked by equipment, missing document count, inspection compliance rate (target 100%).

---

### 6.12 Digital HQ / Neural Operations Core Agent — סוכן מרכז שליטה דיגיטלי

**Mission:** Give the owner a real-time command center for the entire business — not a decorative dashboard, but a working operational panel that shows what needs attention right now.

**Autonomy level:** 1 (display, summarize, route — no autonomous actions)

**Current status:** Neural Core visual UI exists. Operational panels pending.

**What it surfaces:**
- Stuck orders requiring attention now
- Jobs scheduled today/tomorrow and their readiness status
- Missing materials for upcoming dispatches
- Graphics pending customer approval
- Production delays
- Field diaries missing from yesterday
- Billing candidates and blockers
- Critical financial exceptions
- Equipment/vehicle readiness problems
- Top exceptions requiring owner decision

**Interaction model:** Clicking an agent/department pod opens a useful operational panel in the same experience:
- Orders Agent → orders needing attention
- Coordination/QA → jobs needing readiness check
- Finance → billing candidates and blockers
- Inventory → shortages and received goods
- Catalog → missing price/unit/duplicate issues
- Field Ops → incomplete work diaries
- Equipment → vehicles/equipment not ready
- CFO → profitability risks

**Morning digest** (first owner view of the day) should answer:
- What is stuck?
- What is scheduled today and is it ready?
- What does the owner need to decide right now?

**Forbidden:**
- No hidden mutations from the dashboard view
- No autonomous business decisions
- No replacing department agents

---

### 6.13 Engineering / Plan Analysis Agent — סוכן ניתוח תוכניות / הנדסה

**Mission:** Read construction and traffic arrangement plans (PDFs), extract relevant signs, markings, and work requirements, and support quantity takeoff.

**Phase 3 (later). Comes before WhatsApp integration but after core pipeline is stable.**

**What it does (future):**
- Parse traffic arrangement and construction PDFs
- Extract candidate items (sign codes, marking types, quantities)
- Compare plan versions and detect changes
- Support quantity takeoff for order preparation
- Create review tasks for unconfirmed extractions

**Forbidden:**
- No final engineering decisions
- No automatic order creation without review
- No legal/traffic plan approval
- No quantity finalization without owner/engineer confirmation

---

### 6.14 Supplier / Purchasing Support Agent — סוכן ספקים / רכש תומך

**Phase 3 (candidate). Not a full agent in Phase 1.**

In Phase 1 and Phase 2, supplier and procurement logic is distributed across:
- Inventory/Warehouse Agent: receiving and stock impact
- Finance/Billing Agent: invoice processing and cost allocation
- Catalog Agent: product mapping from supplier documents
- Ops Orchestrator: reorder alerting

A dedicated Supplier Agent may become warranted in Phase 2–3 if supplier order complexity grows.

**Future scope:**
- Supplier comparison and tracking
- Purchase request generation and approval workflow
- Supplier invoice matching
- Supplier price history
- Delivery follow-up
- Supplier performance scoring

**Forbidden (at all phases):**
- No automatic purchase orders without owner approval
- No supplier payment approval
- No modification of supplier commercial terms

---

### 6.15 Jarvis / WhatsApp Communications Agent — ג'רוויס

**Mission:** Provide the owner with a WhatsApp-based interface for critical alerts and system queries. Bridge the Digital HQ to the owner's primary communication channel.

**Autonomy level:** 1–2 (alerts and responds — no system mutations from chat commands without owner verification)

**Current status:** Webhook and auto-reply implemented. WhatsApp Cloud API / Meta JARVIS app connected. `whatsapp_messages` table exists.

**What it does:**
- Receive inbound WhatsApp messages and route to appropriate system function
- Send outbound critical alerts to owner (SLA breach, critical exception, billing risk)
- Provide conversational queries about system state
- Acknowledge owner commands and create tasks for review in Command Center

**Notification triggers (send WhatsApp — proposed):**
- Critical SLA breach on an order
- Zero-stock critical item with open orders
- Job dispatched without all gates green
- Loss-making job detected above threshold
- Equipment with expired inspection still assigned to active job

**Quiet rules:**
- No WhatsApp notifications between 22:00–07:00 unless severity = critical
- Routine scan completions, low-priority tasks: no WhatsApp notification
- Maximum X automated messages per day before throttling (**Requires owner confirmation**)

**Forbidden:**
- No messages to customers or third parties
- No sending of financial data externally
- No irreversible system actions from chat command alone
- No bypassing Command Center approval workflows

---

## 7. Capability Matrix

| Capability | Orch | Finance | CFO | FieldOps | Inventory | Catalog | Graphics | Fabrication | CoordQA | Orders | Equipment |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Read orders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read diary | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | ✅ | — | — |
| Read inventory | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | — |
| Read catalog | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | — | ✅ | — |
| Read equipment | ✅ | — | — | ✅ | — | — | — | — | ✅ | — | ✅ |
| Create exceptions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create tasks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Suggest price | ❌ | ❌ | ❌ | ❌ | ❌ | Ref only | ❌ | ❌ | ❌ | ❌ | ❌ |
| Issue invoice | ❌ | Owner gate | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Update catalog | ❌ | ❌ | ❌ | ❌ | Propose | Owner gate | ❌ | ❌ | ❌ | ❌ | ❌ |
| Update inventory | ❌ | ❌ | ❌ | ❌ | Owner gate | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Contact customer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve dispatch | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Human gate | ❌ | ❌ |
| Block dispatch | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ |

Legend: ✅ = can do | ❌ = permanently blocked | ⚠️ = warn only (human decides) | Owner gate = can prepare but human must confirm | Ref only = reference/compare only, no write

---

## 8. Autonomy Model

| Level | Name | Description | Current agents at this level |
|---|---|---|---|
| 0 | Visual only | Shows state, no output | Digital HQ (panels) |
| 1 | Read-only assistant | Reads and displays — no exceptions or tasks | CFO (initial) |
| 2 | Recommends | Creates exceptions and tasks — no data mutations | Most Phase 1 agents |
| 3 | Acts after human approval | Writes to system after human approves specific action | Finance (invoice candidate), Inventory (receiving update with approval) |
| 4 | Safe low-risk automation | Auto-resolves stale exceptions where condition cleared | `autoResolveStaleExceptions` pattern |
| 5 | High-risk autonomy | Not allowed — permanently blocked | No agent |

**Default for all new agents:** Start at Level 2. Promote to Level 3 only after 20+ owner-approved actions of that type with consistent pattern.

**Level 5 actions permanently blocked regardless of training:**
- Issuing final invoices to customers
- Setting or changing customer prices
- Approving supplier payments
- Dispatching field teams
- Contacting customers or suppliers externally
- Modifying legal, financial, or HR records
- Overriding explicit owner decisions

---

## 9. Approval Model

### 9.1 Actions That Always Require Owner Approval

- Price changes on any commercial catalog item
- Approval of a new commercial/billable product
- Deletion or merge of any catalog item
- Issuance of a customer invoice
- Closure of a critical financial exception
- Change to customer commercial terms or payment terms
- Approval of uncertain supplier invoice line item mapping
- Marking a major job as complete without full field evidence
- Overriding a blocked dispatch gate
- Change to official vehicle/equipment license or test data
- Any action on an order marked as high-risk by any agent

### 9.2 Actions Approved at Manager Level

- Approving diary completeness and field execution records
- Assigning crew and vehicles to a job
- Approving graphics ready-for-production
- Resolving medium-severity exceptions

### 9.3 Safe Automatic Actions (Level 4 Automation)

- Auto-creating an exception when a condition is newly detected
- Auto-resolving a stale exception when the condition no longer exists
- Calculating completeness scores
- Grouping duplicate alerts
- Preparing draft billing candidates for review
- Sending WhatsApp alerts for critical exceptions (Jarvis)

---

## 10. Cross-Agent Workflows

### 10.1 New Customer Order Workflow

```
Customer request
→ Orders Agent validates completeness and classifies order type
→ Catalog Agent maps items/services — detects missing prices/units
→ Graphics Agent (if graphics required) — prepares design, tracks customer approval
→ Fabrication Agent (if production required) — receives production requirement
→ Inventory Agent — checks materials availability, creates reservations
→ Coordination/QA Agent — verifies all gates before scheduling dispatch
→ Equipment/Fleet Agent — confirms vehicle/machine availability
→ Coordination/QA Agent — confirms dispatch readiness
→ Field Ops Agent — records actual execution in work diary
→ Finance/Billing Agent — detects billing readiness, prepares invoice candidate
→ CFO Agent — analyzes job profitability
→ Ops Orchestrator — monitors full pipeline for blockers
```

### 10.2 Supplier Invoice / Delivery Note Workflow

```
Supplier document received (invoice or delivery note)
→ Finance/Billing Agent — reads: supplier, invoice number, date, amounts, VAT, payment terms
→ Inventory/Warehouse Agent — reads: products, quantities, units
→ Catalog Agent — maps invoice items to existing catalog items
  → If item exists: propose stock update (awaits human approval)
  → If item is new: create "proposed catalog item" for owner review
→ Owner reviews and approves uncertain mappings
→ Inventory updated after approval
→ Finance allocates cost to relevant job/order
→ CFO receives cost data for profitability calculation
```

### 10.3 Scheduled Field Job Dispatch Workflow

```
Job scheduled for dispatch
→ Coordination/QA Agent checks all pre-dispatch gates (G1–G10)
→ If any gate fails:
  → Create gate-failure exception
  → Create task for responsible department
  → Escalate if dispatch is within critical hours
→ Equipment/Fleet Agent confirms vehicle/equipment status = פעיל, no blocking issue
→ Inventory Agent confirms all materials reserved and available
→ Graphics Agent confirms customer approval (where required)
→ Fabrication Agent confirms production complete
→ Human dispatcher reviews and confirms dispatch
→ Field Ops Agent opens work diary for the job
```

### 10.4 Month-End Billing Workflow

```
End of billing period
→ Finance/Billing Agent scans all orders
→ Identifies completed orders with approved field diaries and no billing blockers
→ Creates invoice candidates list
→ Flags billing blockers with specific reason per order
→ Owner reviews list and approves invoice issuance for each
→ CFO Agent analyzes profitability across month's billed orders
→ Ops Orchestrator flags any orders still stuck in non-billed state
```

### 10.5 Catalog Quality Improvement Loop

```
New order placed or supplier invoice scanned
→ Catalog Agent detects missing/mismatched data (price, unit, duplicate)
→ Creates exception or task with specific finding
→ Owner approves correction
→ Catalog record updated
→ Improved catalog makes Inventory, Order, and Billing logic more reliable
→ CFO gains more complete costPrice data for profitability
```

---

## 11. Phase Roadmap

### Phase 1 — Practical Control Layer (current target)

**Goal:** Give the owner visibility and control over the operational pipeline. Detect what is stuck, what is missing, and what is blocking billing.

| # | Capability | Agent | Status |
|---|---|---|---|
| 1 | Ops cross-order monitoring (8 checks) | ceo | ✅ Live |
| 2 | Billing delay + reconciliation checks | billing-collections-agent | ✅ Live |
| 3 | Profitability snapshots + margin exceptions | cfo-agent | ✅ Live |
| 4 | Diary completeness + approval overdue | field-ops-agent | ✅ Live |
| 5 | Inventory: 27 detection checks | inventory-agent | ✅ Live (recently added to SCANNABLE_AGENTS) |
| 6 | Catalog: 5 MVP rules | catalog-pricing-agent | ✅ Live |
| 7 | Graphics SLA + blocker detection | graphics-production-agent | 🔲 Scan route pending |
| 8 | Fabrication delay + gate checks | fabrication-agent | 🔲 Scan route pending |
| 9 | Coordination/QA pre-dispatch gates | coordination-qa-agent | 🔲 Scan route pending |
| 10 | Digital HQ real KPI panels | digital-hq-agent | 🔲 Panel logic pending |

### Phase 2 — Controlled Workflows

| # | Capability | Agent |
|---|---|---|
| 1 | Order completeness validation and lifecycle routing | orders-agent (new) |
| 2 | Equipment/fleet maintenance and readiness warnings | equipment-fleet-agent (new) |
| 3 | Supplier invoice product mapping + approval workflow | inventory + catalog + finance |
| 4 | Controlled product proposal from documents | catalog-pricing-agent |
| 5 | Monthly billing candidate flow in UI | billing-collections-agent |
| 6 | Cross-agent exception deduplication | All agents |
| 7 | Threshold DB config table (agent_config) | System |
| 8 | Owner exception whitelist DB table | System |
| 9 | Approval feedback review cadence | ceo |
| 10 | Dashboard panels per department | digital-hq-agent |

### Phase 3 — Intelligence Layer

| # | Capability | Agent |
|---|---|---|
| 1 | PDF traffic plan analysis and quantity extraction | engineering-plan-agent |
| 2 | Advanced WhatsApp command interface | jarvis-agent |
| 3 | Near-duplicate product auto-suggestion (after 20+ approved corrections) | catalog-pricing-agent |
| 4 | Customer chronic loss detection (3+ consecutive loss-making orders) | cfo-agent |
| 5 | Threshold auto-calibration suggestions from approval history | ceo |
| 6 | Supplier performance scoring and purchase automation | supplier-support-agent |
| 7 | Pre-dispatch cross-agent checklist visible to dispatcher in UI | coordination-qa-agent |
| 8 | Profitability prediction at order intake | cfo-agent |

---

## 12. Risks and Anti-Patterns

### 12.1 Decorative Agents

**Risk:** Agents exist in the UI, have names and icons, but produce no real output.

**Anti-pattern:**
- Agent appears on Neural Core map
- Agent has no scan route
- Agent is not in `SCANNABLE_AGENTS`
- Agent never creates an exception or task

**Rule:** An agent that has not produced a verified exception or task in 30 days is a decorative agent. It should either be completed or removed.

### 12.2 Alert Flooding

**Risk:** Too many low-quality exceptions cause the owner to ignore the system.

**Anti-pattern:**
- Same exception created on every scan for the same entity
- Low-severity exceptions surfaced with same weight as critical ones
- Old, unresolvable exceptions remaining open forever

**Rules:**
- Use `dedupeKey` pattern — same condition on same entity must not create two open exceptions
- Use `autoResolveStaleExceptions` — close exceptions when the condition no longer exists
- Severity levels must be enforced: critical exceptions are rare, not routine
- Group similar exceptions in dashboard view

### 12.3 Invented Data

**Risk:** Agent fills in missing data without a reliable source, causing billing errors, profitability miscalculations, or wrong order decisions.

**Rule:** If data is missing, create an exception and a task to obtain it. Never invent. Never assume.

### 12.4 Over-Automating Before Calibration

**Risk:** Agent promotes to Level 3–4 automation before it has demonstrated accuracy through human-reviewed cycles.

**Rule:** Every agent starts at Level 2. Promotion requires 20+ owner-reviewed actions of that type with consistent approval pattern. The `agent_approvals` table is the audit trail.

### 12.5 Catalog as a Source of Truth Before It Is One

**Risk:** Using catalog data (prices, units, costPrices) in billing or profitability calculations before catalog quality is verified.

**Rule:** CFO and Billing agents must track catalog completeness confidence. If costPrice is missing for items on a job, profitability is flagged as "incomplete data — do not rely on this margin figure."

### 12.6 Ignoring the Order-Diary Link

**Risk:** System allows billing or profitability calculation without a confirmed field diary, leading to revenue leakage, billing errors, or false profitability.

**Rule:** For any order involving field execution, the billing-ready signal from Finance Agent requires a completed and approved diary. This is not negotiable.

---

## 13. Open Decisions — Requires Owner Confirmation

The following items could not be specified without owner input. Implementation must not proceed for any rule that depends on these until they are answered.

### Critical — System cannot function correctly without these answers

| # | Question |
|---|---|
| C1 | Exact official process for setting and approving customer prices |
| C2 | Who may approve customer prices and at what limit |
| C3 | Target gross margin by job/product/service type |
| C4 | Exact final order status list and transition rules |
| C5 | Exact billability requirements per order type |
| C6 | Exact required fields for a complete work diary |
| C7 | Customer approval and standby workflow — which customers, which order types |
| C8 | Which inventory changes may be auto-approved vs. always require human review |
| C9 | Which equipment/vehicle issues block dispatch vs. warning only |
| C10 | Whether government/municipal customers require a different billing or approval flow |
| C11 | Which user roles will exist and what permissions each has |
| C12 | Whether final invoices may ever be generated automatically, and under what conditions |
| C13 | Official source of truth for traffic sign codes/SKUs (Ministry codes, catalog numbers, or system codes) |
| C14 | Which catalog categories are commercially active vs. reference-only |
| C15 | Exact cost rates: worker/vehicle/fuel/equipment daily rates, overhead %, target margin by domain |

### Safety Accessories — Price = 0 Operational Decisions

These questions are specifically about the 37 safety accessory items currently carrying `defaultPrice = 0` as a temporary placeholder. They do not block Phase 1 planning. They must be answered before commercial use of these items is enabled.

| # | Question |
|---|---|
| SA-1 | Should safety accessories with `price = 0` be visible in the catalog to users browsing available products? |
| SA-2 | Should `price = 0` items be allowed in orders as draft / non-billable line items, or should they be blocked from orders entirely until a real price is set? |
| SA-3 | Should an order containing a `price = 0` item be blocked from billing (the current Phase 1 behavior), or should it be allowed to proceed with a manual override by the owner? |
| SA-4 | Who has authority to approve a real price for a `price = 0` item — owner only, or can a manager also approve? |
| SA-5 | Should `price = 0` trigger a warning exception, an error exception, or a critical exception in the Catalog Agent? |
| SA-6 | Among the 37 safety accessories, are any of them reference-only (never sold commercially, only internal reference)? If yes, which ones — so they can be classified as `is_active = false` and removed from exception scanning. |

### Important — Affects scan calibration and thresholds

| # | Question |
|---|---|
| I1 | SLA thresholds per order status (max hours in each status) — provisional defaults are in Section 17; confirm or adjust |
| I2 | Normal fabrication duration per order type — currently blank in Section 6.8; needed before Fabrication Agent scan rules can be written |
| I3 | Diary completion deadline (hours after field job completion) — Section 17 uses 24h warning / 48h critical as provisional default |
| I4 | Invoice issuance deadline (days after order completion) — Section 17 uses 7 days warning / 14 days critical as provisional default |
| I5 | Payment overdue warning threshold (days after invoice due date) — Section 17 uses 30/60/90 days as provisional default |
| I6 | Customer credit limit rules, if any |
| I7 | Are there any products outside the safety accessories range that are intentionally priced at zero for a real commercial reason (e.g., free bundled items, internal transfers)? These must be whitelisted so Catalog Agent does not flag them. |
| I8 | Order types that always require customer graphics approval vs. never — needed before Graphics Agent scan rules can be calibrated |
| I9 | Equipment inspection warning threshold (days before expiry) — Section 17 uses 30 days warning / 7 days critical as provisional default |
| I10 | Whether Supplier/Purchasing should become a separate agent in Phase 2 |

### Useful — Affects Phase 2+ features

| # | Question |
|---|---|
| U1 | Customer credit limit and credit risk rules |
| U2 | Price change handling for in-progress orders |
| U3 | Bundle/package product logic |
| U4 | Detailed equipment cost formulas (depreciation, maintenance allocation) |
| U5 | Labor cost formulas (hourly vs. daily, overtime rules) |
| U6 | Vehicle fuel/insurance overhead formulas |
| U7 | Exact KPI thresholds for each performance metric |
| U8 | Whether seasonal workers or subcontractors need separate tracking |

---

## 14. Implementation Roadmap

This is the recommended sequence for implementing new scan routes and agent capabilities. Do not skip steps or implement out of order without a specific reason.

**Before implementing any scan route, complete in sequence:**
1. Document the rule (what condition, what evidence, what the agent surfaces)
2. Define QA test cases (2–3 should-detect, 2–3 should-not-detect, 1–2 edge cases)
3. Implement in scan route using `scan-utils.ts` patterns
4. Run against test data — all test cases must pass
5. Run manually from Agent Command Center — review first scan output
6. Owner reviews first scan output — approves or dismisses each flag
7. Calibrate based on owner feedback (>25% false positives → revise rule)
8. Add any dismissed items to owner exception whitelist

**Recommended implementation sequence:**

| Priority | Agent | Capability to add |
|---|---|---|
| 1 | coordination-qa-agent | Pre-dispatch gate checklist scan route (Phase 1 completion) |
| 2 | graphics-production-agent | Graphics delay + customer approval overdue scan route (Phase 1 completion) |
| 3 | fabrication-agent | Stuck-in-production + gate-bypass detection scan route (Phase 1 completion) |
| 4 | digital-hq-agent | Real KPI panels — connect existing agent data to dashboard panels |
| 5 | billing-collections-agent | Monthly billing candidate flow + stronger diary-to-billing link |
| 6 | orders-agent | Order completeness + lifecycle routing (Phase 2) |
| 7 | equipment-fleet-agent | Maintenance overdue + dispatch readiness (Phase 2) |
| 8 | catalog-pricing-agent | Controlled mapping suggestions + product proposal approval workflow |
| 9 | inventory-agent | Supplier invoice product mapping + receiving workflow |
| 10 | cfo-agent | Customer chronic loss detection + stronger profitability confidence model |

**Critical architectural note:**

Do not over-focus on Catalog Agent at the expense of the core operational pipeline. The business's most critical data flows are:

1. Orders → Field Work Diary → Billing
2. Coordination/QA → Dispatch Readiness
3. Inventory → Job Readiness

Catalog Agent is valuable, but the above flows generate revenue and prevent losses. They come first.

---

## 15. Integration with Digital HQ / Neural Operations Core

### 15.1 Current State

The Neural Operations Core visual UI exists. Agent pods are rendered on the background image with hotspot positions defined in `neural-core-hotspots.ts`. Each pod is clickable and opens the Agent Command Center view for that agent.

What is missing: Operational panels. Clicking a pod currently opens an agent view — it does not open a live operational panel showing the agent's current findings in a useful, task-oriented format.

### 15.2 Target Panel Architecture

Each agent pod should open a panel with three zones:

| Zone | Content |
|---|---|
| Top | Current state summary: X exceptions open, Y tasks pending, last scan Z minutes ago |
| Middle | Actionable items: top 3–5 items requiring owner decision or attention today |
| Bottom | Quick stats: KPI snapshot, trend indicator, link to full view |

### 15.3 Morning Digest — Owner's First View

When the owner opens the Command Center in the morning, the Digital HQ panel should immediately surface:

- **Today's dispatches:** which jobs are going out today and are they ready?
- **Yesterday's gaps:** field diaries not completed from yesterday
- **Billing ready:** completed orders ready to invoice
- **Blocked orders:** top 3 orders most stuck in the pipeline
- **Equipment warnings:** vehicles/machines with expiring tests
- **Graphics waiting:** customer approvals outstanding
- **Materials risk:** zero-stock items with active orders
- **CFO alerts:** any jobs flagged as loss-making since last review

### 15.4 Noise Control Rules

The Digital HQ must not become an alert flood:

- Show only actionable items — not informational
- Group exceptions of the same type under one line (e.g., "3 orders missing diaries" not 3 separate alerts)
- Suppress resolved exceptions immediately
- Severity filter: default view shows medium+ only; critical always shown; low requires drill-down
- Old exceptions with no owner action after 7 days: surface separately as "aging exceptions"

### 15.5 Integration Points per Agent

| Agent | Panel trigger | Key panel content |
|---|---|---|
| ceo | "Pipeline" pod | Stuck orders, SLA breaches, cross-department blockers |
| billing-collections-agent | "Finance" pod | Billing candidates, blockers, overdue receivables |
| cfo-agent | "CFO" pod | Margin alerts, loss-making jobs, cost anomalies |
| field-ops-agent | "Field Ops" pod | Missing diaries, pending approvals, actual-vs-planned mismatches |
| inventory-agent | "Inventory" pod | Stockouts, low stock, pending receiving, job material readiness |
| catalog-pricing-agent | "Catalog" pod | Missing prices/units, proposed items awaiting approval, completeness score |
| graphics-production-agent | "Graphics" pod | Approval delays, missing files, production blockers |
| fabrication-agent | "Production" pod | Stuck jobs, material shortages, schedule risk |
| coordination-qa-agent | "Coordination" pod | Gate failures per job, readiness score, upcoming dispatches |
| orders-agent | "Orders" pod | Incomplete orders, standby orders, lifecycle blockers |
| equipment-fleet-agent | "Equipment" pod | Readiness summary, maintenance due, expired tests |

---

## 16. Appendix — Known Safe Patterns

All scan routes should follow these established patterns from `scan-utils.ts`:

- `dedupeKey(agentId, entityId, checkType)` — prevents duplicate exceptions for same condition
- `upsertException(...)` — creates or updates an existing exception (idempotent)
- `upsertTask(...)` — creates or updates a task
- `loadAgentExceptionDedupeMap(agentId)` — loads existing open exceptions at scan start
- `autoResolveStaleExceptions(agentId, activeKeys, resolvedBy)` — closes exceptions where condition cleared
- `writeAgentActivity(agentId, summary)` — logs scan to `agent_activity_feed`
- `verifyMasterAuth(request)` — gate at top of every scan route
- `updateAgentRunStatus(agentId, "active"|"idle")` — wraps entire scan

**Standard scan pattern:**
```
auth check → updateAgentRunStatus("active") → load data in parallel → load dedupe maps → run rules → autoResolveStaleExceptions → writeAgentActivity → updateAgentRunStatus("idle") → logAgentAction → return ScanResult
```

**`ScanResult` interface:** always use `emptyScanResult()` factory and increment counters as rules fire.

---

## 17. Provisional SLA Threshold Reference

> **All thresholds in this section are provisional working defaults. They are not confirmed by the owner. They exist to give Phase 1 scan rules something to operate against. Every value must be reviewed and replaced with an owner-confirmed number before the system goes into steady-state operation.**
>
> Label used throughout: **Provisional — requires owner calibration**

### 17.1 Order Pipeline Stage Thresholds

These thresholds apply to the time an order spends in a given state before the Ops Orchestrator or the responsible agent should flag it.

| Stage / Condition | Warning trigger | Critical trigger | Notes |
|---|---|---|---|
| New order with missing required fields | 24h without completion | 48h | Orders Agent (Phase 2) |
| `graphics_pending` — no graphics assignment | 24h | 48h | Graphics Agent |
| `graphics_active` — no completion | 48h | 96h | Varies by complexity — complex jobs may need higher threshold |
| Customer graphics approval outstanding | 72h (first notice) | 120h (escalate) | Only for order types where customer approval is required |
| `graphics_done` — awaiting production start | 24h | 48h | Fabrication Agent |
| `production` (fabrication in progress) | 24h from expected completion | 48h | Fabrication Agent — exact expected duration **requires owner calibration per order type** |
| Production complete but `warehouse_status` not updated | 12h | 24h | Fabrication/Inventory Agent |
| All dispatch gates not green with dispatch < 48h away | 48h before dispatch | 12h before dispatch | Coordination/QA Agent — critical if same-day |
| `ready_installation` — not yet scheduled for dispatch | 48h | 5 days | Coordination/QA / Ops Orchestrator |
| Order `in_progress` (field) without diary activity | 24h for short jobs | 48h for multi-day jobs | Field Ops Agent |

### 17.2 Field Diary Thresholds

| Condition | Warning trigger | Critical trigger | Notes |
|---|---|---|---|
| Field job completed — no diary filed | 24h after completion | 48h | Field Ops Agent |
| Diary filed — not approved by manager | 24h after filing | 48h | Field Ops Agent |
| Diary filed with missing required fields | Immediate exception on detection | — | Does not age — exception exists until resolved |

### 17.3 Billing and Collections Thresholds

| Condition | Warning trigger | Critical trigger | Notes |
|---|---|---|---|
| Order completed — not invoiced | 7 days | 14 days | Finance/Billing Agent |
| Invoice issued — payment not received past due date | 30 days overdue | 60 days overdue | Finance/Billing Agent |
| Invoice overdue — escalation to collections/legal | — | 90 days overdue | Requires owner decision on action |
| Billing candidate with open exception blocking it | Immediate visibility | 7 days unresolved | Finance/Billing Agent |

### 17.4 Inventory and Stock Thresholds

| Condition | Warning trigger | Critical trigger | Notes |
|---|---|---|---|
| Stock below minimum level | When stock ≤ minimum × 1.5 | When stock ≤ minimum | Inventory Agent — **minimum levels require per-item owner calibration** |
| Stock at zero — no open purchase | Immediate | Immediate | Inventory Agent |
| Stock at zero — active orders require the item | Immediate critical | — | Inventory Agent — escalates directly |
| Receiving task open without action | 2 days | 5 days | Inventory Agent |

### 17.5 Equipment and Fleet Thresholds

| Condition | Warning trigger | Critical trigger | Notes |
|---|---|---|---|
| Vehicle/equipment test/inspection expiry | 30 days before expiry | 7 days before expiry | Equipment/Fleet Agent |
| Vehicle/equipment test expired — in active use | — | Immediate | Equipment/Fleet Agent — blocks dispatch |
| Equipment in maintenance longer than expected | 3 days beyond scheduled | 7 days | Equipment/Fleet Agent — **expected duration requires per-asset owner calibration** |

### 17.6 Calibration Notes

These provisional defaults were chosen to be conservative (lean toward surfacing issues slightly early rather than missing them). Expected calibration direction after owner review:

- Graphics and production thresholds may need to be raised for complex jobs
- Billing thresholds may vary by customer type (government customers often have longer accepted invoice cycles)
- Inventory minimum levels must be set per product/SKU — the default behavior until set is to flag any item reaching zero
- Equipment thresholds may need to differ between vehicle types and heavy equipment

---

## 18. Fencing and Barrier Pricing Reference Model

> **This section captures known pricing formulas for fencing-type products from business context provided by the owner. These are reference values for use in order estimation and cost verification — not universal pricing rules for all business domains.**
>
> **Status: Known reference — Provisional — requires owner confirmation before use in live quotes or automated profitability calculations.**

### 18.1 Basic Fence Structure Calculation

Standard construction rule for site fencing (barriers, perimeter fencing):

| Parameter | Value | Notes |
|---|---|---|
| Post spacing | Every 3 meters | Standard for most site fencing |
| Default fence height | 2m | Standard height |
| Post profile | 80×80×2mm | Square section steel profile |
| Post total length | 3m per post | 1m into ground, 2m above ground |
| Post quantity formula | `CEIL(length_m / 3) + 1` | +1 for the closing end post |

**Example:** 30m fence = CEIL(30/3) + 1 = 11 posts

### 18.2 Material Unit Costs (Reference Values)

> These values were provided as known reference costs. They must be confirmed as current before use in any live quote or profitability calculation.

| Material | Unit | Reference cost (NIS) |
|---|---|---|
| Iskurit mesh / איסכורית (plain) | Per sqm | 11 |
| Printed mesh / sunshade fabric / שמשונית | Per sqm | 24 |
| Post profile 80×80×2mm | Per linear meter | 14 |
| In-house vinyl sticker print | Per sqm | 35 |

### 18.3 Insulated Panel Fence (EPS 5cm) Reference

> Source: Supplier quote from פנל השומרון, dated 22/03/2026. Confirm whether this quote is still current.

| Material | Specification | Reference cost (NIS) |
|---|---|---|
| EPS insulated panel wall (smooth two-sided) | 5cm thickness, per sqm | 47 |
| One panel unit | 2m × 1m = 2sqm | 94 per panel |
| Galvanized U-channel | 5cm wide, 3m length, 1.25mm thickness | 17 per unit |

**U-channel rule:** Each panel requires approximately 2 U-channels (top and bottom tracks). In a reference project with 320 panels, 340 U-channels were used (320 × 2 = 640 theoretical; actual was lower due to shared runs). The exact multiplier depends on installation method.

**Formula for U-channels:** `panel_count × 2 + surplus_factor` — **Surplus factor requires owner calibration**.

### 18.4 Default Profit / Margin for Fencing Work

| Component | Method |
|---|---|
| Product margin | 33% profit on total material cost (excluding workers) |
| Workers | Calculated separately: `worker_count × daily_rate × installation_days` |
| Combined profitability | Material value × 1.33 + worker cost |

**Important scoping note:** This 33% product margin default was confirmed for fencing/barrier-type work only. It is not a universal company-wide margin target. Other business domains (road marking, traffic arrangements, sign installation) have different cost structures and margin expectations that **require owner confirmation**.

### 18.5 Worker Cost in Fencing Calculations

Workers are added on top of the product/materials calculation:

- **Worker daily rate:** Used in prior business calculations — **exact current rate requires owner confirmation** (see Section 13, question C15)
- **Installation days:** Based on field diary actual days once work is executed; at estimation time, use planned installation days from order
- Workers are not included in the 33% product margin — they are a separate line item

### 18.6 How Agents Should Use This Reference

| Agent | How to use |
|---|---|
| Catalog/Pricing Agent | Reference for detecting whether quoted material rates in fencing orders are within expected range |
| CFO/Profitability Agent | Use as a sanity-check model when calculating actual vs. expected cost for fencing jobs — flag significant deviations |
| Finance/Billing Agent | Do not derive prices from this model — use only for supporting reconciliation |
| Any agent | Must not automatically apply these rates to live records without owner confirmation |

---

## 19. Order Status Reconciliation

> **This section documents the gap between the business's required order statuses and the statuses currently implemented in the database. Do not modify the DB schema based on this section. This is documentation only.**

### 19.1 Currently Implemented DB Statuses

These statuses are confirmed to exist in the `work_orders` table based on the codebase audit as of 2026-05-17:

| Status value | Meaning | Primary agent that monitors it |
|---|---|---|
| `graphics_pending` | Order is awaiting graphics design work to begin | Graphics Agent |
| `graphics_active` | Graphics design work is in progress | Graphics Agent |
| `graphics_done` | Graphics complete, cleared for production | Fabrication Agent |
| `production` | Order is in fabrication/production phase | Fabrication Agent |
| `ready_installation` | All pre-dispatch conditions met — ready for field installation | Coordination/QA Agent |
| `completed` | Order has been executed and completed in the field | Field Ops Agent, Finance Agent |

**Phase 1 scan rules must only reference these six status values.** Any scan rule that checks for a status not in this list will silently miss all relevant records or error. This is the confirmed safe set for Phase 1 implementation.

### 19.2 Proposed Additional Statuses — Not Yet in DB

The following statuses are required for the full business workflow but do not currently exist in the `work_orders.status` column. Each requires a DB migration before any agent can scan against it. Do not implement agent rules that depend on these until the migration is confirmed and deployed.

| Proposed status | Business purpose | Agent that needs it | DB migration required |
|---|---|---|---|
| `draft` | New order being entered — not yet validated or routed | Orders Agent | Yes — add to status enum/constraint |
| `missing_information` | Order submitted but incomplete — blocked from entering pipeline | Orders Agent | Yes |
| `awaiting_customer_execution_approval` | Customer approved the work in principle but has not confirmed timing — standby state, not cancelled | Orders Agent, Coordination/QA | Yes — **this is a high-priority addition; standby orders must not get lost** |
| `scheduled` | Installation date confirmed, job assigned to crew and vehicle, ready for field dispatch | Coordination/QA | Yes |
| `in_field_execution` | Field crew is on site, work is actively in progress | Field Ops Agent | Yes |
| `pending_diary_review` | Field work completed, diary filed but not yet approved by manager | Field Ops Agent, Finance Agent | Yes |
| `ready_for_billing` | All billing conditions met — diary approved, quantities confirmed, price confirmed | Finance/Billing Agent | Yes |
| `billed` | Invoice issued to customer | Finance/Billing Agent | Yes |
| `on_hold` | Paused by explicit owner decision — reason must be recorded | Orders Agent | Yes |
| `cancelled` | Cancelled — no further pipeline actions | Orders Agent | Yes |

### 19.3 The Standby State — Critical Gap

The `awaiting_customer_execution_approval` status is particularly important to implement. Elkayam regularly has customers who have approved work in principle but have not confirmed when to execute. These orders must:

- Remain visible in the system (not be confused with cancelled orders)
- Not be routed to production or dispatch
- Not be counted as "stuck" by the Ops Orchestrator (they are intentionally paused)
- Have a mechanism to re-enter the active pipeline when the customer confirms timing

**Phase 1 workaround (until migration):** Use a notes field, a tag, or a separate boolean flag to mark standby orders. The Orders Agent in Phase 2 should check for this flag. Do not assume orders without this status are active.

### 19.4 Phase 1 Agent Scan Rules — Status Mapping

Until proposed statuses are implemented, agents should use the following mappings:

| Business concept | Phase 1 DB approximation | Limitation |
|---|---|---|
| "Order stuck at intake / missing info" | No equivalent — scan for `work_orders` with null/empty required fields | Requires field-level null checks, not status checks |
| "Order in standby" | No equivalent — use notes field workaround | High risk of standby orders being confused with active stuck orders |
| "Job completed — awaiting diary" | `status = 'completed'` AND no linked diary entry within threshold | Works with current schema |
| "Job completed — diary approved — billing ready" | `status = 'completed'` AND diary approved AND no billing exception | Works but requires join logic |
| "Order on hold by owner" | No equivalent — must be tracked manually | Owner must be aware this gap exists |
| "Order cancelled" | No equivalent — orders can only be deleted, not formally cancelled | Risk of accidentally querying deleted or ghost records |

### 19.5 Recommended Migration Priority

When DB migrations are scheduled, implement in this order based on operational impact:

1. `awaiting_customer_execution_approval` — highest priority; prevents standby orders from being lost or incorrectly flagged
2. `design_approval_status` column on `work_orders` — unblocks correct Track 1 detection in graphics-production-agent; resolves the known logic risk in `graphics_approval_pending` exception
3. `on_hold` — prevents mistaken treatment of paused orders as stuck
4. `draft` / `missing_information` — enables Orders Agent completeness checks
5. `scheduled` — enables Coordination/QA to track confirmed vs. unconfirmed dispatches
6. `pending_diary_review` — enables cleaner Field Ops / Finance handoff
7. `ready_for_billing` / `billed` — enables Finance Agent to work with confirmed billing states
8. `in_field_execution` / `cancelled` — useful but lower priority for Phase 1

### 19.6 Approval Column Naming Gap — Two Approval Tracks

The `work_orders` table currently has a single approval-related column: `customer_approval_status`. This column's semantic meaning is **execution/scheduling approval (Track 2)**: whether the customer has confirmed when and where the job can be executed in the field.

A second approval track — **design/graphics proof approval (Track 1)** — does not yet have a dedicated column. This gap creates a concrete logic risk in the graphics-production-agent scan route.

| Track | Business meaning | Required for | DB column | Current status |
|---|---|---|---|---|
| Track 1 — Design proof approval | Customer approved the design file/sketch before production | Custom signs, printed signs, stickers, logo work, construction signage | `design_approval_status` | **Missing — not yet in DB** |
| Track 2 — Execution scheduling approval | Customer confirmed when/where field job can be executed | Any field execution or standby order | `customer_approval_status` | Exists (`'pending'` / `'approved'`) |

**Known logic risk in scan route:**
`graphics-production-agent` scan route, lines 108–137: the `graphics_approval_pending` exception uses `customer_approval_status === "pending"` and `order_type === "field_work"` as proxies for "design proof not yet customer-approved." Both conditions are wrong:
- `customer_approval_status` is Track 2 (execution scheduling), not Track 1 (design proof)
- `order_type === "field_work"` does not correctly identify orders that require a design proof

Consequence: false positives on orders that have pending execution scheduling approval but no graphics work; false negatives on graphics orders where execution is already confirmed but design proof is still outstanding.

**`design_approval_status` column — applied 2026-05-18:**

Migration `20260527000000_work_orders_group2_columns.sql` added this column as nullable `text` with no default and no CHECK constraint. This was deliberate: the column is new, all existing orders have `null`, and the plain-text type allows the bypass value `bypassed_by_manager` without a schema change.

```sql
-- Applied. Column is nullable text, no CHECK constraint.
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS design_approval_status text;
```

**Supported values:**

| Value | Meaning | Exception fires? |
|---|---|---|
| `null` | Not yet evaluated | No (column is new; all legacy orders start here) |
| `not_required` | No design proof needed for this order | No |
| `pending_send` | Design ready, proof not yet sent | Future check (Phase 2) |
| `sent` | Proof sent to customer, awaiting approval | **Yes** — after 24h warn / 72h critical |
| `approved` | Customer approved | No |
| `rejected` | Customer rejected — needs revision | No current check; flag for Phase 2 |
| `revision_requested` | Customer requested changes | No current check; flag for Phase 2 |
| `bypassed_by_manager` | Design approval bypassed by authorized manager/owner | **No** — treated as cleared |

**Manager bypass logic:** When management authorizes proceeding without customer design approval, `design_approval_status` is set to `bypassed_by_manager`. This is explicitly distinct from customer approval. The exception resolves automatically on the next scan. See §6.7 bypass section for full business rules.

**Future schema improvement — bypass audit trail:**

| Column | Type | Purpose |
|---|---|---|
| `design_approval_bypass_reason` | `text` | Free-text business reason for the bypass |
| `design_approval_bypass_approved_by` | `text` | Manager/user who authorized the bypass |
| `design_approval_bypass_approved_at` | `timestamptz` | Timestamp of bypass authorization |

These are not yet in the DB. Until they exist, bypass authorization is traceable only via `order_activities` log entries.

**Coordination/QA** may continue to use `customer_approval_status` for Track 2 (G5 gate) only.

---

*Last updated: 2026-05-18 (Group 4: §6.7 bypass logic + resolved KNOWN LOGIC RISK; §19.6 updated — design_approval_status column applied; agent-registry orders-agent + equipment-fleet-agent added; scan routes aligned to Group 2 schema; license_number check implemented; required_date_overdue check added)*
*Source: Owner intake form answers, codebase audit 2026-05-17, business context, owner clarification 2026-05-18*
*Do not implement code, change DB schema, or push without explicit owner approval after reviewing this document.*
