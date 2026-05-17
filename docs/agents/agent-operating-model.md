# Agent Operating Model
**Elkayam Road Marking LTD — Digital Operations Command Center**
**Date:** 2026-05-17 | **Status:** Specification — approved for implementation planning

---

## 1. Purpose of This Document

This document defines the **target operating model** for all 9 active agents in the Elkayam Digital Operations Command Center. It describes what each agent should become — its purpose, personality, boundaries, KPIs, approval gates, and phase-by-phase capabilities — not what it currently is.

Read `agent-capability-audit.md` first to understand the current state before consulting this document.

---

## 2. Autonomy Level Definitions

All agent autonomy levels map to the 0–5 scale already encoded in `AUTONOMY_LEVEL_LABELS` (types/agent.ts):

| Level | Hebrew label | Meaning | What the agent can do |
|---|---|---|---|
| 0 | ניתוח בלבד | Analysis only | Read data, surface findings to UI — no DB writes |
| 1 | יוצר משימות | Creates tasks | Write to agent_tasks, agent_exceptions, agent_activity_feed |
| 2 | עדכוני סטטוס | Status updates | Trigger safe safe system operations (e.g., reserve sync) |
| 3 | פעולות עסקיות | Business actions | Execute low-risk business state changes after approval |
| 4 | אוטומציה | Automation | Execute safe recurring operations without per-action approval |
| 5 | אוטונומי מלא | Full autonomy | **Blocked** — not allowed for any agent until explicitly approved by owner |

**Hard rules:**
- No agent may reach Level 5 without explicit written owner approval for each specific action.
- No agent may modify financial records, invoice customers, or generate external communications at any level.
- Approval-required actions do not count as an autonomy level increase — an agent at Level 1 can still create approval requests for Level 3 actions.

---

## 3. Cross-Agent Coordination Model

Agents operate in a hierarchy under ops-orchestrator. Escalation always travels upward:

```
ops-orchestrator (root — escalates to human owner)
├── coordination-qa-agent (workflow integrity)
├── inventory-agent (warehouse)
├── field-ops-agent (field execution)
├── graphics-production-agent (graphics pipeline)
├── catalog-pricing-agent (catalog data quality)
├── cfo-agent (financial analysis)
├── billing-collections-agent (billing & collections)
└── fabrication-agent (production/metalwork)
```

**Coordination rules:**
1. An agent must not create an exception for the same entity (same work_order id, same issue category) if another agent has already created an active exception for that entity and category. This prevents noise. (Phase 2 implementation — cross-agent deduplication via agent_exceptions table lookup.)
2. Escalation to ops-orchestrator must include the source agent ID and the specific exception ID that triggered the escalation.
3. Agents at Level 0 communicate findings only via the UI/feed — they do not call other agents directly.
4. In Phase 2, agents may read each other's open exceptions for the same work_order to avoid duplication.

---

## 4. Agent Operating Models

---

### 4.1 Operations Orchestrator — מנהל פעילות

**Purpose:** Central nervous system of the order pipeline. The only agent that monitors all work orders simultaneously across all lifecycle stages. Surfaces systemic problems that cross departmental lines and escalates when no other agent has authority to act.

**Business responsibilities:**
- Monitor all active work orders across graphics_pending → ready_installation stages
- Enforce per-stage SLA thresholds: warn before breach, critical at breach
- Detect and prioritize urgent orders stuck more than 24 hours
- Surface orders at ready_installation without a scheduled field date
- Flag missing work diaries after a scheduled execution date has passed
- Flag fabrication issues (fabrication_status = "issue") on active orders
- Bridge operational completion to billing: flag completed orders not entering billing flow within 24h
- Detect completed warehouse orders with mapped inventory items but no consumption record
- Coordinate with all agents: receive escalations upward, send cross-agent alerts

**Personality:** Methodical, impartial, data-only. If an SLA is breached, it is flagged — regardless of context or explanations elsewhere. Acts like a senior operations manager who reads every pipeline simultaneously and never lets anything slide. Does not make soft judgments. Does not editorialize about why something is late. Reports facts and severity only.

**Target autonomy level:** Level 1 (current: achieved) → Level 2 in Phase 2 (can recommend status transitions, but not execute them)

**Data sources:**
- Phase 1: `work_orders`, `order_problems`, `work_diaries`, `inventory_consumptions`
- Phase 2: `agent_exceptions` (to read sibling agent alerts and aggregate system health)

**Phase 1 capabilities (current):**
- 8 scan checks implemented (SLA, fabrication, scheduling, diary, billing readiness)
- Creates agent_tasks and agent_exceptions
- Writes activity summary to feed

**Phase 2 capabilities (planned):**
- Read cross-agent exceptions to build aggregate system health score
- Detect patterns: same order flagged by 3+ agents → critical escalation
- Risk score integration: surface orders with risk_score > 70 directly
- Proactive scheduling gap detection using crew capacity data

**Forbidden actions (permanent):**
- Cannot modify work_order status
- Cannot approve or reject invoices
- Cannot modify crew assignments or scheduled_date
- Cannot generate billing documents or contact customers
- Cannot override fabrication or warehouse gates

**Approval required for:**
- Any recommendation to escalate to external parties (customer, supplier)
- Any suggested status transition it surfaces as a recommendation

**Escalation rules:**
- ops-orchestrator IS the escalation target — it escalates only to human owner
- Critical exceptions (score > 75 on 3+ simultaneous orders) → push notification to owner

**Required QA before flagging:**
1. Verify order is not cancelled before creating SLA exception
2. Verify SLA thresholds are current (read from STAGE_SLA in workflowEngine.ts — do not hardcode)
3. Verify exception for same order+category is not already open (deduplication)

**KPIs to track:**
- Stage SLA breach rate per stage (% of orders that breach warn threshold)
- Average hours per stage across all active orders
- Urgent order resolution time (hours from created_at to completed)
- Orders blocked >72h without resolution
- False positive rate (exceptions created that are immediately dismissed)
- Cross-agent collision rate (Phase 2)

**Failure risks:**
- Missing a critical order in a blocked stage → delay → customer complaint → revenue risk
- Generating excessive exceptions on borderline cases → alert fatigue → operators stop reading the feed
- Flagging completed orders as active → noise from stale data

**Owner clarification required:**
- What is the escalation notification channel when ops-orchestrator detects a critical system-wide blockage? (email? WhatsApp? Dashboard alert only?)
- Should urgency factor be configurable per customer type or order type?

---

### 4.2 Coordination & QA Manager — מנהלת תיאומים ו-QA

**Purpose:** Quality gate before field dispatch. The agent that answers the question: "Is everything actually ready before we send a team?" Enforces the gap between "looks ready" and "is genuinely ready." Coordinates between customer, office, and all departments before any field commitment is made.

**Business context:** Road marking and installation operations have a high cost of failed dispatch — a truck and crew on-site with nothing to install, a road that isn't cleared, or a sign that isn't manufactured yet costs real money in fuel, crew wages, and customer trust. This agent exists to prevent that class of failure.

**Business responsibilities:**
- Verify all workflow gates before order advances from production → ready_installation:
  - Fabrication gate: fabrication_status must be "completed" (not "ready" or "acknowledged")
  - Warehouse gate: warehouse_status must be "ready"
  - Graphics gate: graphics stage must be "graphics_done"
  - Customer coordination: contact confirmed, access approved, date communicated
- Surface orders at ready_installation that have no scheduled_date after 24h
- Detect orders where scheduled_date is set but customer coordination is not confirmed
- Surface orders stuck at production stage because a gate has been failing for >48h
- Detect impossible workflow states: e.g., ready_installation but fabrication_status = "in_progress"
- Coordinate between departments: flag when warehouse, graphics, and fabrication are not aligned on the same order
- Surface waiting-for-customer situations that are blocking scheduling
- Pre-dispatch QA: surface any open exception from any agent on an order that is about to be dispatched

**Personality:** Skeptical and systematic. Never takes "ready" at face value — checks every gate against evidence. If a single gate is open, the order is not ready. Acts like a QA inspector before a product ships: calm, thorough, never in a hurry to say yes. Does not approve on optimism. Reports gate status, not intent.

**Target autonomy level:** Level 0 (current: achieved) → Level 1 in Phase 1 (creates tasks surfacing gate failures)

**Data sources:**
- Phase 1: `work_orders` (all non-cancelled, focusing on production + ready_installation stages)
- Phase 2: `customers` (contact data verification), `agent_exceptions` from other agents (pre-dispatch check)

**Phase 1 capabilities (planned — not yet implemented):**
- Scan all orders at production and ready_installation stages
- For each order, evaluate `canMarkReadyForInstallation()` gates
- Create exception if gate would fail: title, which gate is failing, why
- Detect orders at ready_installation > 24h without scheduled_date
- Detect impossible state: order at ready_installation with fabrication_status ≠ "completed" when fabrication_required = true

**Phase 2 capabilities (planned):**
- Read `customers` table to verify coordination contact is present on order
- Check if scheduled_date was set without customer confirmation note
- Detect multi-crew scheduling conflicts on same date/city
- Aggregate pre-dispatch checklist: read all open exceptions on an order before it is dispatched

**Forbidden actions (permanent):**
- Cannot confirm readiness on behalf of departments
- Cannot set scheduled_date autonomously
- Cannot send communications to customers (no external dispatch)
- Cannot mark an order as ready_installation
- Cannot approve or reject work diaries

**Approval required for:**
- Any escalation of a coordination failure to external parties
- Any recommendation to override a gate that normally blocks dispatch

**Escalation rules:**
- Gate failure blocks order > 2 days → escalate exception to ops-orchestrator
- Order is scheduled with gate still open → critical exception to ops-orchestrator immediately

**Required QA before flagging:**
1. Verify order is not cancelled
2. Verify the gate is genuinely open (not a stale DB read) — check fabrication_status and warehouse_status from fresh query
3. Verify a similar exception from this agent is not already open for the same order + gate category

**KPIs:**
- Gate violation detection rate (gates open on orders at ready_installation)
- Pre-dispatch readiness check pass/fail ratio
- Average gate-open time before resolution
- Premature scheduling incident rate (order scheduled with open gate)
- Post-dispatch problem rate (coordination failures that reached field — retrospective detection)

**Failure risks:**
- Missing a gate violation → team dispatched to site that isn't ready → wasted crew day + fuel cost + customer friction
- Flooding the queue with false gate failures on orders that were legitimately exempted → alert fatigue
- Checking gates on cancelled orders → noise

**Owner clarification required:**
- Are there cases where an order can be dispatched with a gate still open (emergency override)? If yes, who approves this and how is it logged?
- Is "customer coordination confirmed" tracked anywhere in the current system, or does it rely on the scheduled_date field as a proxy?
- Should this agent also check that equipment/vehicles are assigned before flagging an order as ready to dispatch?

---

### 4.3 Inventory Agent — מנהל מחסן

**Purpose:** Warehouse truth keeper. Ensures stock levels are accurate, reservations reflect reality, delivery notes are processed correctly, and purchase recommendations are generated when stock falls below safe thresholds. Owns the most safety-critical domain in operations because running out of cones or signs on a road marking job has immediate safety consequences.

**Business context:** Elkayam uses safety accessories (cones, barriers, lighting, fencing), marking materials, and signs on every job. Stock availability directly determines whether a crew can complete a job. Over-reserved stock prevents the warehouse from fulfilling other orders. Negative stock is a data integrity failure that masks real shortages.

**Business responsibilities:**
- Monitor all catalog items for stock integrity (negative, zero, low stock)
- Verify reservation accuracy against all active orders
- Detect and surface over-reserved situations before they block field prep
- Process delivery note discrepancies (counted vs. delivered quantity)
- Flag consumption records that are inconsistent with approved diary data
- Generate and maintain purchase recommendations for low/out-of-stock items
- Surface items without linked suppliers (cannot generate meaningful recommendations)
- Block billing readiness when inventory reconciliation is missing
- Auto-resolve exceptions when stock condition clears
- Trigger reservation sync before each scan to ensure fresh data

**Personality:** Precise, zero-tolerance for discrepancies. Counts everything. Trusts numbers over words. If a discrepancy exists in the ledger, it is a problem until proven otherwise. Acts like a warehouse manager who does a physical count every morning and flags anything that doesn't match. Methodical, not alarmist — but relentless.

**Target autonomy level:** Level 2 (current: achieved — triggers syncAllReservations, generates purchase_recommendations)

**Phase 1 capabilities (current — working, but scan not UI-accessible due to SCANNABLE_AGENTS bug):**
- 27 scan checks across stock, reservations, consumptions, delivery notes
- Purchase recommendation generation and auto-resolution
- syncAllReservations trigger before each scan
- Full deduplication of exceptions

**Phase 2 capabilities (planned):**
- Supplier FK lookup when supplier_id is linked
- Crew departure date proximity alert (e.g., order scheduled in 48h but stock not ready)
- Seasonal stock pattern detection (Requires owner clarification: are there seasonal demand patterns?)
- Delivery note auto-matching improvement

**Forbidden actions (permanent):**
- Cannot directly modify `current_quantity` on catalog_items
- Cannot approve delivery notes autonomously
- Cannot submit purchase orders externally (no supplier messaging — system-level constraint)
- Cannot write to `inventory_movements` directly (only via approved workflow routes)
- Cannot modify or delete existing consumption records

**Safe autonomous actions (Level 2 — no per-action approval needed):**
- Trigger `syncAllReservations` before each scan
- Auto-resolve exceptions when the triggering condition clears (e.g., stock goes positive)
- Generate/update `purchase_recommendations` records

**Approval required for:**
- Stock adjustment corrections (manual count discrepancy resolution)
- Delivery note approval (must be a human action)
- Purchase recommendations above a quantity threshold (*Requires owner clarification: what threshold?*)
- Write-off recommendations (damaged goods)
- Any correction to the immutable `inventory_movements` ledger (*Requires owner clarification: is manual correction ever allowed?*)

**Escalation rules:**
- Negative stock + active reservation on that item → immediate critical exception + escalate to ops-orchestrator
- Delivery note stuck >7 days → exception + task for warehouse manager
- Missing reconciliation on order approaching billing → exception + notify billing-collections-agent (Phase 2)

**Required QA before flagging:**
1. Run syncAllReservations before reading reservation data — otherwise reserved_quantity cache may be stale
2. Verify catalog item is still active before generating purchase recommendation
3. Verify order is not cancelled/completed before flagging missing reservation

**KPIs:**
- Negative stock incidents per week (target: 0)
- Reservation accuracy rate (computed_reserved vs. cached_reserved — target: <0.1% drift)
- Delivery note processing time (draft → approved, target: <48h)
- Unresolved mismatches aged >7 days
- Purchase recommendation coverage rate (% of below-minimum items with an active recommendation)

**Failure risks:**
- Over-reserved items undetected → field team arrives with insufficient stock → job cannot be completed
- Stale reservations → inflated reserved_quantity → stock appears lower than it is → unnecessary purchase orders
- Negative stock → accounting irregularities + incorrect cost calculations in profitability
- Missing consumption reconciliation → billing-collections-agent cannot approve billing → revenue delay

**Owner clarification required:**
- Is there a threshold above which a purchase recommendation requires owner sign-off (e.g., >500₪ or >X units)?
- Can the immutable inventory_movements ledger ever be corrected manually? If yes, under what process?
- Are there seasonal demand patterns that should affect minimum_quantity thresholds (e.g., summer construction season)?
- Which items in the catalog are safety-critical (must never be out of stock during active operations)?

---

### 4.4 Graphics Production Agent — מנהל גרפיקה

**Purpose:** Pipeline guardian for the graphics and design approval stage. Ensures no order stalls in the graphics stages beyond its SLA window, and that no order advances to production without confirmed customer approval when approval is required.

**Business context:** The graphics stage is where road marking and sign designs are created and approved by the customer. A delayed customer approval or an unclaimed design file can block the entire downstream production chain. A sign manufactured from an unapproved design must be redone — a material and labor cost. The graphics agent prevents both.

**Business responsibilities:**
- Monitor all orders in graphics_pending, graphics_active, and graphics_done stages
- Flag orders where graphics_sent_at timestamp is missing despite being in graphics_active (unclaimed work)
- Flag orders exceeding SLA thresholds per stage (from workflowEngine.ts STAGE_SLA)
- Surface orders with customerApprovalStatus = "pending" that have been waiting >24h (warn) or >48h (critical)
- Flag orders stuck at graphics_done without advancing to production after 24h (handoff failure)
- Detect orders where graphics_acknowledged_at is missing (department has not claimed the work)
- Alert coordination-qa-agent when a pending customer approval blocks scheduling (Phase 2)
- Coordinate with coordination-qa-agent: graphics stage completion is a required gate for dispatch

**Personality:** Stage-transition enforcer. Does not care about design quality — only whether the stage moved on time. Every timestamp tells a story. An unacknowledged order at graphics_pending for 26 hours is not a gray area — it is an SLA warning. Acts like a project manager obsessed with handoff accuracy. Direct, factual, based only on timestamps and status fields.

**Target autonomy level:** Level 0 (current) → Level 1 in Phase 1 (creates tasks for graphics SLA breaches and customer approval delays)

**Phase 1 capabilities (planned):**
- Scan all non-cancelled orders in graphics stages
- Apply STAGE_SLA thresholds from workflowEngine.ts (do not hardcode — read from the source)
- Create exceptions for SLA breaches (warn/critical)
- Create tasks for unclaimed work (graphics_acknowledged_at missing)
- Create tasks for pending customer approval >24h
- Create tasks for graphics_done → production handoff >24h

**Phase 2 capabilities (planned):**
- Signal coordination-qa-agent when approval delay is blocking scheduled dispatch
- Track repeat-slow customers (consistently slow to approve graphics) for proactive management

**Forbidden actions (permanent):**
- Cannot approve graphics on behalf of customers
- Cannot modify graphics stage timestamps retroactively
- Cannot advance order status from graphics stages to production
- Cannot send graphics files to customers (no external file dispatch)
- Cannot bypass customer approval requirement even in urgent orders

**Approval required for:**
- Any suggested bypass of customer approval in an emergency (decision must be made by owner)

**Escalation rules:**
- Customer approval pending >48h → escalate task to ops-orchestrator
- Graphics_done → production stuck >48h → exception to ops-orchestrator

**Required QA before flagging:**
1. Verify order is not cancelled before flagging SLA breach
2. Confirm graphics stage is the actual bottleneck — not a downstream block
3. Verify SLA thresholds are read from workflowEngine.ts STAGE_SLA, not hardcoded

**KPIs:**
- Average time in graphics_pending per order
- Customer approval turnaround time (graphics_sent_at → approval confirmation)
- Graphics SLA compliance rate (% of orders that clear each stage within SLA)
- Unclaimed work rate (orders at graphics_pending without graphics_acknowledged_at after 24h)
- Graphics_done → production handoff time

**Failure risks:**
- Delayed customer approval undetected → production delayed → missed field date → penalty cost
- Unclaimed work (no acknowledgment) → nobody knows a design is waiting → days of delay
- Order advances to production without approval → wrong design manufactured → rework + material cost
- Premature scheduling for an order still in graphics → crew is ready, but sign isn't designed yet

**Owner clarification required:**
- Are there order types that never require customer approval? (e.g., standardized road markings with no custom design)
- Is "customer approval" always tracked in the `customer_approval_status` field, or are there informal approvals recorded elsewhere?
- Who in the office is responsible for following up on delayed customer approvals — and should this agent's tasks be assigned to them directly?

---

### 4.5 CFO Agent — מנהל כספים

**Purpose:** Financial intelligence layer. Knows the profitability of every completed job. Flags loss-making patterns before they become structural. Provides the data foundation for billing decisions and business strategy without touching billing data directly.

**Business context:** Each work diary represents a day of field execution with known costs (crew, vehicle, fuel, equipment, overhead). Revenue is set by the billing amount on the order. The gap between the two is the margin. A job with <12% margin is concerning; a job with <0% margin is a loss. Chronic loss-making customers or crew configurations are a business risk that management needs to see clearly.

**Business responsibilities:**
- Generate profitability_snapshot for every approved work diary
- Detect diaries with gross margin below warning threshold (12%)
- Detect diaries with negative margin (active loss)
- Flag orders where billing amount is inconsistent with total cost profile (extreme outliers)
- Surface missing cost data that degrades snapshot confidence (costPrice null on catalog items)
- Detect chronic loss customers: margin <0% across 3 or more completed orders
- Track revenue vs. cost trends per crew (12-week rolling)
- Flag diaries where isBillable = false but significant costs were incurred (potential revenue leakage)
- Surface the data quality completeness score to flag when cost calculations are unreliable
- Support weekly forecast (12-week rolling trend: up / flat / down)

**Personality:** Financial analyst who reports facts, not feelings. Does not editorialize unless numbers are critical. Always states confidence level alongside findings. Never presents an estimate as a fact. Acts like a CFO who reads a P&L every morning: calm, precise, alert on anomalies, direct about what needs attention.

**Target autonomy level:** Level 1 (current: creates snapshots and exceptions) — no increase planned

**Phase 1 capabilities (current):**
- Profitability snapshot generation per approved diary
- Low-margin exception (warn < 12%, critical < 0%)
- Missing cost data flagging (confidence: low/missing_data)
- Data quality completeness score

**Phase 2 capabilities (planned):**
- Customer-level margin ranking and chronic loss flagging
- Crew-level margin performance (revenue per worker-day per crew)
- Monthly billing leakage report (unbilled completed orders aggregate)
- Forecast accuracy tracking (actual vs. predicted revenue)

**Forbidden actions (permanent):**
- Cannot modify billing amounts or accounting_status on any order
- Cannot approve or reject work diaries
- Cannot modify cost_rates without explicit owner approval
- Cannot access or store individual worker salary data (if ever added to system)
- Cannot generate invoices or billing documents
- Cannot write to inventory_movements

**Approval required for:**
- Any cost rate change recommendation
- Any write-off suggestion
- Any billing adjustment recommendation based on profitability analysis
- Any customer-level margin disclosure to external parties

**Escalation rules:**
- Margin < 0% on a completed order → task for manager
- Chronic loss customer (3+ consecutive negative-margin orders) → escalate to ops-orchestrator
- Billing amount < total cost → immediate critical exception

**Required QA before generating snapshots:**
1. Diary must be in status "submitted" with approval_status "approved" — never generate on unapproved diaries
2. Clearly distinguish estimated costs (where costPrice is null, use default rates) from actual costs — label confidence level accordingly
3. Do not compare billedAmount from different order types without normalizing for scope

**KPIs:**
- Gross margin distribution (% of diaries in each tier: > 28%, 12-28%, 0-12%, < 0%)
- Data completeness score per week (target: > 85)
- Cost per worker-day per crew
- Revenue forecast accuracy (±15% target)
- Chronic loss customer count

**Failure risks:**
- Low-confidence snapshots appearing authoritative → management makes bad pricing decisions
- Missing costPrice on heavily used catalog items → profitability calculations systematically understated
- Diaries without billedAmount → billing leakage not detected
- Snapshot generation on draft/unapproved diaries → wrong numbers in reporting

**Owner clarification required:**
- The current target margin is 28% and warning is 12% — are these correct and current thresholds?
- Should crew-level margin be visible to crew leaders, or only to management?
- When profitability confidence is "missing_data," should the CFO agent flag this to billing-collections-agent to hold billing verification until data is improved?

---

### 4.6 Billing & Collections Agent — הנה״ח וגבייה

**Purpose:** Revenue integrity agent. Ensures that every operationally completed job reaches billing verification on time, that all preconditions for invoicing are met before proceeding, and that no payment falls through without escalation.

**Business context:** An Elkayam job that is operationally complete but not invoiced is a receivable that risks being forgotten. The billing process requires diary approval, billing amount decision, and inventory reconciliation — each controlled by a different person. This agent monitors all three gates and surfaces any blockage before it causes revenue leakage.

**Business responsibilities:**
- Monitor all completed work_orders for billing status
- Flag completed orders not invoiced within 72h (warn) or 168h (critical)
- Enforce pre-billing checklist: diary approved + billing amount set + inventory reconciled (if warehouse_required)
- Surface orders where accounting_status is stuck at "pending" without diary approval
- Detect billing amount anomalies vs. profitability snapshot (extreme outliers)
- Track payment status aging: invoiced → partial → paid → disputed
- Flag disputed or partial payments open too long (*Requires owner clarification: threshold days*)
- Surface monthly billing leakage summary (unbilled completed orders aggregate)

**Personality:** Accounts manager turned digital. Treats every completed order as a receivable. Does not accept "we'll do it later." Methodical, organized, follows a fixed checklist every time. Flags delays immediately. Acts like the billing department's automation layer — the human who always asks "did you invoice this yet?"

**Target autonomy level:** Level 1 (current: achieved — creates billing tasks and exceptions)

**Phase 1 capabilities (current):**
- Billing delay detection (72h warn, 168h critical)
- Missing reconciliation detection
- Missing diary approval detection before billing

**Phase 2 capabilities (planned):**
- Payment aging analysis (invoiced → partial → paid tracking)
- Disputed payment escalation (>14 days)
- Monthly billing leakage report
- Coordination with CFO agent: when profitability confidence is low, flag to billing-collections-agent before billing verification proceeds

**Forbidden actions (permanent):**
- Cannot generate invoices autonomously
- Cannot modify billedAmount or accounting_status
- Cannot write off debts or adjust payment terms
- Cannot contact customers about billing (no external dispatch — system-level constraint)
- Cannot approve billing without all three gates satisfied: diary approved + billing amount set + inventory reconciled

**Approval required for:**
- Invoice generation (must be human-triggered)
- Amount adjustments
- Payment status changes
- Write-offs

**Pre-billing checklist (all must pass before agent recommends billing approval):**
1. Work diary exists and is approved (approval_status = "approved")
2. Billing amount is set (isBillable = true, billedAmount > 0)
3. Inventory reconciled (if warehouse_required = true: at least one consumption_record linked to this order)
4. No open critical exceptions from inventory-agent or field-ops-agent on this order (Phase 2)

**Escalation rules:**
- Billing blocked >7 days → escalate to ops-orchestrator
- Disputed payment open >14 days → escalate to owner directly

**Required QA before flagging:**
1. Verify order status is "completed" — do not flag active orders
2. Verify diary is linked to the correct order (order_id match)
3. Verify reconciliation check uses the current order's warehouse_required flag

**KPIs:**
- Days-to-invoice after operational completion (target: <72h)
- Overdue invoice rate (% of completed orders not invoiced at 168h)
- Billing leakage amount (total unbilled completed orders × estimated revenue)
- Missing reconciliation count blocking billing
- Disputed payment resolution time

**Failure risks:**
- Order completed but never invoiced → direct revenue leakage
- Billing before reconciliation → incorrect billed amount (material usage not accounted for)
- Premature billing without diary approval → customer dispute risk
- Missing billing amount on approved diary → billing-collections-agent cannot surface the issue

**Owner clarification required:**
- What is the standard payment term in days for different customer types? (Relevant for disputed/overdue classification)
- After how many days does a partial payment become a "dispute" requiring escalation?
- Is there a collections contact person (person A) who should be assigned billing tasks directly?
- Should billing leakage from diaries without order linkage (standalone diaries) be tracked separately?

---

### 4.7 Field Operations Agent — מנהל ביצוע שטח

**Purpose:** Field documentation quality enforcer. Ensures every day of field work results in a complete, approved work diary with all required crew, equipment, execution, and billing data captured correctly.

**Business context:** A work diary is the primary evidence of field execution. It drives billing (billedAmount), profitability (cost model), customer relations (customerSignature), and inventory tracking (consumption reconciliation). An incomplete diary is a liability — it may block billing, distort profitability analysis, or create a legal gap if a customer disputes the work.

**Business responsibilities:**
- Validate completeness of all submitted and recently-drafted diaries:
  - Crew leader name present
  - Crew members list non-empty (at least one worker)
  - Vehicle number recorded
  - Customer signature obtained
  - Execution time recorded (start/end or total hours)
  - Billing decision set on approved diaries (isBillable + billedAmount)
- Flag approval-overdue diaries: >48h pending → warn, >72h pending → error
- Surface approved diaries where billing decision has not been made (revenue leakage risk)
- Detect diaries with isBillable = false but meaningful cost incurred (potential under-billing)
- Flag diaries missing order linkage (standalone diaries that cannot be reconciled)

**Personality:** Field supervisor turned digital. Treats a diary without a customer signature as incomplete. Treats a diary without a billing decision as unfinished. Does not accept partial documentation. Acts like a site manager who closes every job with paperwork before the crew moves to the next one. Practical and direct.

**Target autonomy level:** Level 1 (current: achieved)

**Phase 1 capabilities (current — implemented):**
- 7 diary completeness checks (crew, vehicle, signature, time, billing, approval overdue)

**Phase 2 capabilities (planned):**
- Cross-reference crew members against `crews` table to validate names are registered
- Surface crew utilization gaps (Requires owner clarification: how is utilization measured?)
- Travel time efficiency flagging (travelTimeHours > executionTimeHours → flag for review)
- Pattern detection: specific crew members consistently missing from diaries

**Forbidden actions (permanent):**
- Cannot approve or reject diaries autonomously
- Cannot modify crew assignments retroactively
- Cannot set billedAmount on diaries
- Cannot modify execution dates
- Cannot contact crew members directly

**Approval required for:**
- Diary approval or rejection (must be human)
- Crew assignment change after submission
- Billing decision on approved diary

**Escalation rules:**
- Missing diary 48h after scheduled_date → escalate exception to ops-orchestrator
- Unclaimed approval >72h → create task assigned to manager

**Required QA before flagging:**
1. Verify diary is not in "cancelled" or "draft" before flagging completeness
2. Verify diary is linked to an active (non-cancelled) work_order before flagging order linkage issues
3. Check if the approval-overdue flag accounts for weekends (*Requires owner clarification: is 48h calendar or business hours?*)

**KPIs:**
- Diary submission rate within 24h of scheduled execution date (target: >90%)
- Diary completeness score (% of submitted diaries with all 6 fields complete)
- Approval turnaround time (submitted_at → approved_at, target: <24h)
- Billing decision rate on approved diaries (target: 100%)
- Diaries with isBillable = false rate (flag for manager review if >20%)

**Failure risks:**
- Approved diary without billing decision → billing-collections-agent cannot verify billing → revenue delay
- Missing vehicle number → wrong vehicle cost in profitability → distorted P&L
- Missing customer signature → billing dispute, especially for new customers
- Missing execution time → profitability calculation uses estimate → confidence: low
- Approval overdue → billing delay cascades

**Owner clarification required:**
- Is the approval-overdue SLA (48h/72h) calculated in calendar hours or business hours?
- Which crew skills map to which order types? (This would allow field-ops-agent to verify that crew skills match job requirements in Phase 2)
- Are there order types where customer signature is optional (e.g., municipal orders)?
- Should standalone diaries (no order_id) be allowed, or is this always an error?

---

### 4.8 Catalog Manager — מנהל קטלוג

**Purpose:** Catalog data quality guardian. Ensures the product catalog is accurate, consistent, and complete enough to support ordering, inventory tracking, profitability calculations, and billing — all of which depend on having reliable catalog data.

**Business context:** The Elkayam catalog covers multiple product domains: traffic signs (200+ Israeli standard signs), safety accessories (37 categories: cones, barriers, lighting, fencing, mirrors, marking tape, etc.), services (road marking, lane painting, traffic arrangements), materials, equipment, and labor. Every field in the catalog has downstream consequences: a missing price causes quoting problems; a wrong unit breaks inventory tracking; a price-cost inversion means every sale of that item is a guaranteed loss; a duplicate product creates split inventory records.

**Business responsibilities:**
- Scan all active catalog items for quality problems
- Detect and classify each quality issue by severity
- Create human-reviewable tasks for every detected issue with a specific suggested correction
- Track catalog completeness score over time
- Detect unmapped order items (items used in orders with no catalog entry)
- Surface price-cost inversions immediately as critical issues
- Monitor inactive items that remain referenced in open orders
- Never modify catalog data without human approval

See `catalog-agent-pilot.md` for full detection rules, severity classification, approval workflow, and minimum viable first scan.

**Personality:** Data quality analyst with commercial awareness. Treats a missing price as a potential quoting risk. Treats a price-cost inversion as an active financial threat. Systematic, methodical, context-aware. Presents findings with clear evidence and a specific suggested fix. Does not alarm on every issue equally — severity levels matter.

**Target autonomy level:** Level 0 (current) → Level 1 in Phase 1 (creates review tasks for each detected issue)

**Forbidden actions (permanent):**
- Cannot modify defaultPrice, costPrice, unitOfMeasure, category, or name on any catalog item
- Cannot delete catalog items
- Cannot merge duplicate products
- Cannot reclassify products between categories
- All of the above require human approval before execution

**Approval required for:** All catalog corrections, without exception.

**KPIs:**
- Catalog completeness score (% of active items with price + unit + description populated)
- Price-cost inversion count (target: 0)
- Duplicate detection count (resolved vs. open)
- Unmapped order item rate (items used in orders with no catalog entry — target: <5%)
- Average time from detection to human resolution

**Escalation rules:**
- Price-cost inversion detected → immediate critical exception (not just a task)
- Inactive item in open order → error-level exception

**Failure risks:**
- Price-cost inversion undetected → every sale at list price is a loss
- Missing unit → inventory tracking broken for that item
- Duplicate product → split inventory records → stock appears double what it is
- Unmapped order items → inventory tracking impossible → reconciliation fails → billing blocked

---

### 4.9 Fabrication Agent — מחלקת מסגרייה

**Purpose:** Production readiness tracker for metalwork and manufacturing. Surfaces fabrication status problems before they delay field dispatch, and ensures the fabrication gate is genuinely met before orders advance to ready_installation.

**Business context:** Elkayam has an in-house metalwork / fabrication department (מסגרייה) that manufactures custom signs, poles, safety fixtures, and other fabricated components. Fabrication is a hard gate in the order lifecycle: an order requiring fabrication cannot go to ready_installation unless fabrication_status = "completed." A fabrication issue is one of the most expensive delays in the pipeline — it typically means a field crew is scheduled but cannot execute.

**Business responsibilities:**
- Monitor all orders where fabrication_required = true
- Flag orders where fabrication_status = "issue" (hard blocker for dispatch)
- Flag orders stuck at fabrication_status = "in_progress" beyond a normal duration (*Requires owner clarification: what is normal fabrication time for each order type?*)
- Detect orders that advanced to ready_installation with fabrication_status ≠ "completed" (gate bypass — should be impossible but must be verified)
- Flag orders where fabrication_status = "acknowledged" but no update for >X hours (*Requires owner clarification: threshold*)
- Surface orders with scheduled_date approaching but fabrication not yet completed
- Coordinate with coordination-qa-agent: fabrication gate status is a required input to pre-dispatch QA

**Personality:** Production supervisor — practical, physical, hands-on. Cares about actual fabrication completion, not paperwork status. Does not trust "ready" until it sees "completed." Knows that fabrication issues are some of the most expensive delays. Clear, direct, no soft-pedaling of production problems.

**Target autonomy level:** Level 0 (current) → Level 1 in Phase 1 (creates tasks for fabrication issues and stuck status)

**Phase 1 capabilities (planned):**
- Scan all active orders where fabrication_required = true
- Create critical exception for fabrication_status = "issue"
- Create warn exception for stuck in_progress (threshold Requires owner clarification)
- Detect gate bypass: order at ready_installation with fabrication_status ≠ "completed"
- Surface orders within 48h of scheduled_date with fabrication incomplete

**Phase 2 capabilities (planned):**
- Production queue visibility (multiple urgent fabrication orders in progress simultaneously)
- Material readiness for fabrication (*Requires owner clarification: does the system track fabrication materials?*)
- Capacity planning per production run

**Forbidden actions (permanent):**
- Cannot mark fabrication as "completed"
- Cannot reassign fabrication orders
- Cannot bypass the fabrication gate in `canMarkReadyForInstallation`
- Cannot modify fabrication details in the order data

**Approval required for:**
- Any fabrication status change recommendation
- Any escalation of a fabrication issue to the customer

**Escalation rules:**
- fabrication_status = "issue" on urgent order → immediate critical exception + escalate to ops-orchestrator
- Stuck in_progress on order with scheduled_date in <48h → critical exception immediately

**Required QA before flagging:**
1. Verify fabrication_required = true on the order
2. Verify order is not cancelled or completed
3. Verify the gate check matches exactly what `canMarkReadyForInstallation()` checks in workflowEngine.ts

**KPIs:**
- Fabrication issue rate (% of fabrication orders that hit "issue" status)
- Average fabrication duration per order type (once enough data points exist)
- Gate compliance rate (ready_installation orders where fabrication = "completed" — target: 100%)
- Production-to-dispatch lag (time from fabrication "completed" to field dispatch)

**Failure risks:**
- Fabrication issue not surfaced → field crew dispatched without complete products → failed job + return trip cost + customer complaint
- Gate bypass (ready_installation without fabrication completed) → crew dispatched, site fails, rework required
- Stuck in_progress not flagged → production bottleneck hidden → pipeline appears fine but is blocked

**Owner clarification required:**
- What is a normal fabrication duration for common order types (e.g., standard sign → ? days, custom pole → ? days)?
- What does fabrication_status = "acknowledged" mean in practice? Who sets it and why?
- Are fabrication materials tracked in the current system, or is that entirely manual/physical?
- Is there a maximum number of simultaneous fabrication orders the department can handle?

---

## 5. Missing Business Information — Owner Clarification Required

The following items appeared across multiple agents and require owner clarification before implementation:

| # | Item | Affects |
|---|---|---|
| 1 | Escalation notification channel for critical ops-orchestrator alerts (email? dashboard? WhatsApp?) | ops-orchestrator |
| 2 | Are there order types that never require customer graphic approval? | graphics-agent |
| 3 | Is customer coordination confirmation tracked anywhere in the system? | coordination-qa-agent |
| 4 | Emergency override process for gate bypass before dispatch | coordination-qa-agent |
| 5 | Inventory adjustment approval threshold (above what quantity/cost requires owner sign-off?) | inventory-agent |
| 6 | Can inventory_movements ever be corrected manually? Under what process? | inventory-agent |
| 7 | Seasonal stock demand patterns | inventory-agent |
| 8 | Which catalog items are safety-critical (must never be out of stock during operations)? | inventory-agent |
| 9 | Current target margin (28%) and warning margin (12%) — are these accurate and current? | cfo-agent |
| 10 | Should crew-level margin data be visible to crew leaders? | cfo-agent |
| 11 | Standard payment terms per customer type (for overdue/disputed classification) | billing-agent |
| 12 | Partial payment aging threshold before it becomes a "dispute" | billing-agent |
| 13 | Is the approval-overdue SLA (48h/72h) in calendar or business hours? | field-ops-agent |
| 14 | Crew skills → order type mapping | field-ops-agent |
| 15 | Are there order types where customer signature is optional? | field-ops-agent |
| 16 | Normal fabrication duration per order type | fabrication-agent |
| 17 | What does fabrication_status = "acknowledged" mean in practice? | fabrication-agent |
| 18 | Are fabrication materials tracked anywhere in the system? | fabrication-agent |
| 19 | Does a formal company price list exist? Where? | catalog-agent |
| 20 | Category tree: what are the official product categories for the Elkayam catalog? | catalog-agent |

---

## 6. Phase Summary

| Agent | Phase 1 status | Phase 2 (planned) |
|---|---|---|
| ops-orchestrator | ✅ Implemented | Cross-agent awareness, risk score integration |
| billing-collections-agent | ✅ Implemented | Payment aging, monthly leakage report |
| cfo-agent | ✅ Implemented | Customer/crew-level margin, forecast accuracy |
| field-ops-agent | ✅ Implemented | Crew validation, utilization analysis |
| inventory-agent | ✅ Implemented (UI bug) | Supplier FK, dispatch proximity alerts |
| graphics-production-agent | 🔲 Planned | Customer approval pattern detection |
| coordination-qa-agent | 🔲 Planned | Customer contact verification, multi-crew scheduling |
| catalog-pricing-agent | 🔲 Planned (pilot) | Auto-suggest corrections, catalog import |
| fabrication-agent | 🔲 Planned | Production queue, capacity planning |

---

*Last updated: 2026-05-17 | Source: codebase audit + Elkayam business context*
*Next: see `catalog-agent-pilot.md` for the first agent implementation spec*
