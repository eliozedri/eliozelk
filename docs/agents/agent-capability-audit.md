# Agent Capability Audit
**Elkayam Road Marking LTD — Digital Operations Command Center**
**Date:** 2026-05-17 | **Status:** Approved for reference — do not implement based on this doc alone

---

## 1. Purpose of This Document

This document is a current-state snapshot of every agent, department, and operational unit defined anywhere in the Elkayam codebase. It does not prescribe what agents should become — that is `agent-operating-model.md`. It records exactly what exists today, where it lives in code, and what capability level it has actually reached.

Read this before touching any agent-related code. If something is not in this document, it either does not exist yet or was added after this audit date.

---

## 2. The 8-Layer Model

For a core agent to be fully operational, it must exist in all 8 layers:

| Layer | File / Location | Purpose |
|---|---|---|
| 1. Identity | `src/lib/agents/agent-registry.ts` | Label, icon, description, responsibilities, workflowRole |
| 2. Type system | `src/types/agent.ts` — `AgentType` union | TypeScript type contract |
| 3. Org hierarchy | `src/types/agent.ts` — `AGENT_ORG` | Escalation chain / org chart |
| 4. Visual position | `src/lib/agents/neural-core-hotspots.ts` | Position on JARVIS Neural Operations Core image |
| 5. Database | Supabase `agents` table | Live status, autonomy_level, scopes, last_run_at |
| 6. Scan route | `src/app/api/agents/{id}/scan/route.ts` | Real detection and task-creation logic |
| 7. UI wiring | `SCANNABLE_AGENTS` set in `AgentCommandCenter/index.tsx` | Exposes scan button in Command Center |
| 8. Chat | Global floating chat context (`openAgentChat(id)`) | User can open a conversation with this agent |

Agents missing layers 6 or 7 are **visual/config only** — they appear in the Neural Core but cannot be triggered or produce output.

---

## 3. Agent Inventory

### 3.1 ceo — מנהל פעילות

| Property | Value |
|---|---|
| AgentType | `"orchestrator"` |
| Department | `"operations"` |
| Hebrew name | מנהל פעילות |
| English name | Operations Orchestrator |
| Neural Core hotspot | `id: "orchestrator"` |

**Layer coverage:**

| Layer | Status |
|---|---|
| AGENT_REGISTRY | ✅ |
| AgentType union | ✅ |
| AGENT_ORG | ✅ (root node — all others report to it) |
| Neural Core hotspot | ✅ |
| DB (agents table) | ✅ (seeded in migration) |
| Scan route | ✅ `/api/agents/ceo/scan` |
| SCANNABLE_AGENTS | ✅ |
| Chat addressable | ✅ |

**Current capability level:** Action-capable, workflow-aware, data-aware

**Data sources currently read:**
- `work_orders` (all non-cancelled, with all stage timestamps and fabrication fields)
- `order_problems` (open/unresolved)
- `work_diaries` (submitted + approval status)
- `inventory_consumptions` (for reconciliation awareness)

**Scan checks currently implemented (8 checks):**
1. SLA breach — all active stages (graphics_pending/active/done, production, ready_installation)
2. Fabrication issue flag on active orders
3. Unscheduled order stuck at ready_installation >24h (warn) / >72h (critical)
4. Missing diary after scheduled_date has passed
5. Urgent order stuck in active stage >24h
6. Open problems count on active orders (warn ≥1, error ≥3)
7. Completed order with accounting_status=pending not invoiced >24h (warn) / >72h (critical)
8. Completed warehouse order with mapped catalog items but no inventory_consumptions (billing blocker)

**Writes to:** `agent_exceptions`, `agent_tasks`, `agent_activity_feed`, `agent_action_log`

**Declared autonomy level:** 1 (creates tasks/exceptions — does not execute transitions)

---

### 3.2 billing-collections-agent — הנה״ח וגבייה

| Property | Value |
|---|---|
| AgentType | `"billing_collections"` |
| Department | `"accounting"` |
| Hebrew name | הנה״ח וגבייה |
| English name | Billing & Collections |
| Neural Core hotspot | `id: "accounting"` |

**Layer coverage:**

| Layer | Status |
|---|---|
| AGENT_REGISTRY | ✅ |
| AgentType union | ✅ |
| AGENT_ORG | ✅ |
| Neural Core hotspot | ✅ |
| DB (agents table) | ✅ |
| Scan route | ✅ `/api/agents/billing-collections-agent/scan` |
| SCANNABLE_AGENTS | ✅ |
| Chat addressable | ✅ |

**Current capability level:** Action-capable, data-aware, workflow-aware

**Data sources currently read:**
- `work_orders` (completed only)
- `work_diaries` (submitted + approved)
- `inventory_consumptions` (for reconciliation check)

**Scan checks currently implemented:**
1. Completed order not invoiced within billing_warn_hours (72h) or billing_critical_hours (168h)
2. Completed order missing inventory reconciliation before billing
3. Orders in accounting_status=pending without diary approval

**Declares autonomy level:** 1

---

### 3.3 cfo-agent — מנהל כספים

| Property | Value |
|---|---|
| AgentType | `"cfo"` |
| Department | `"finance"` |
| Hebrew name | מנהל כספים |
| English name | CFO / Finance Manager |
| Neural Core hotspot | `id: "cfo"` |

**Layer coverage:**

| Layer | Status |
|---|---|
| AGENT_REGISTRY | ✅ |
| AgentType union | ✅ |
| AGENT_ORG | ✅ |
| Neural Core hotspot | ✅ |
| DB (agents table) | ✅ |
| Scan route | ✅ `/api/agents/cfo-agent/scan` |
| SCANNABLE_AGENTS | ✅ |
| Chat addressable | ✅ |

**Current capability level:** Action-capable, data-aware

**Data sources currently read:**
- `work_diaries` (submitted + approved, with full cost data)
- `cost_rates` (labor, vehicle, equipment, overhead rates)
- `profitability_snapshots` (read + generate)
- `work_orders` (linked orders for customer and billing context)

**Scan checks implemented:**
1. Generate profitability_snapshot per approved diary
2. Flag diaries with margin below warning threshold (12%)
3. Flag diaries with negative margin (loss)
4. Flag missing cost data (costPrice null on used items → confidence: low/missing_data)
5. Flag diaries where billedAmount appears inconsistent with cost profile

**Declared autonomy level:** 1

---

### 3.4 field-ops-agent — מנהל ביצוע שטח

| Property | Value |
|---|---|
| AgentType | `"field_operations"` |
| Department | `"field"` |
| Hebrew name | מנהל ביצוע שטח |
| English name | Field Operations Manager |
| Neural Core hotspot | `id: "field_ops"` |

**Layer coverage:**

| Layer | Status |
|---|---|
| AGENT_REGISTRY | ✅ |
| AgentType union | ✅ |
| AGENT_ORG | ✅ |
| Neural Core hotspot | ✅ |
| DB (agents table) | ✅ |
| Scan route | ✅ `/api/agents/field-ops-agent/scan` |
| SCANNABLE_AGENTS | ✅ |
| Chat addressable | ✅ |

**Current capability level:** Action-capable, data-aware

**Data sources currently read:**
- `work_diaries` (submitted and draft)
- `work_orders` (linked order context)

**Scan checks implemented (7 checks):**
1. Missing crew leader name
2. Missing crew members list
3. Missing vehicle number
4. Missing customer signature
5. Missing execution time (start/end)
6. Approved diary without billing decision (isBillable not set)
7. Approval overdue: >48h → warn, >72h → error

**Declared autonomy level:** 1

---

### 3.5 inventory-agent — מנהל מחסן ⚠️ UI BUG

| Property | Value |
|---|---|
| AgentType | `"inventory"` |
| Department | `"warehouse"` |
| Hebrew name | מנהל מחסן |
| English name | Warehouse / Inventory Manager |
| Neural Core hotspot | `id: "warehouse"` |

**Layer coverage:**

| Layer | Status |
|---|---|
| AGENT_REGISTRY | ✅ |
| AgentType union | ✅ |
| AGENT_ORG | ✅ |
| Neural Core hotspot | ✅ |
| DB (agents table) | ✅ |
| Scan route | ✅ `/api/agents/inventory-agent/scan` |
| SCANNABLE_AGENTS | ❌ **MISSING — BUG** |
| Chat addressable | ✅ |

> **⚠️ KNOWN BUG:** `inventory-agent` has the most comprehensive scan route in the system (27+ checks, purchase recommendation generation, reserve sync) but is **NOT listed in `SCANNABLE_AGENTS`** in `src/components/AgentCommandCenter/index.tsx`. The scan button is invisible in the UI. The route exists and works; the UI wiring is missing. Fix: add `"inventory-agent"` to the `SCANNABLE_AGENTS` set.

**Current capability level:** Action-capable, workflow-aware, data-aware — but not UI-triggerable

**Data sources currently read:**
- `catalog_items` (stock levels, unit, supplier, minimum quantities)
- `work_orders` (active, with accessoryRows/miscRows)
- `inventory_reservations` (all, active filter)
- `inventory_consumptions` (consumed/pending_review)
- `work_diaries` (for diary approval state)
- `delivery_notes` (all non-cancelled)
- `delivery_note_items` (line items)

**Scan checks implemented (27+ checks across stock, reservations, consumptions, delivery notes):**

Stock integrity:
1. Negative stock (critical)
2. Out of stock with minimum set (error)
3. Low stock (0 < current < minimum) (warn)
4. Over-reserved (reserved > current) (warn)
5. Missing unit of measure (warn)

Order/catalog mapping:
6. Order items not mapped to catalog (task)
7. Missing reservation for active mapped order item (warn)

Reservation integrity:
8. Stale reservation for inactive/cancelled order (warn)
9. Stale reservation for item no longer in catalog (error)
10. Duplicate active reservations for same item/order/key (error)
11. reserved_quantity cache mismatch vs SUM(active reservations) (warn)
12. Active reservation with invalid quantity ≤0 (error)

Consumption integrity:
13. Approved diary with mapped items but no consumption record (warn)
14. Consumption for unapproved/draft diary (error)
15. Duplicate consumption for same diary/item (error)
16. Consumption quantity > reservation/planned quantity (warn)
17. Active reservation after full consumption (warn)
18. Completed warehouse order no inventory reconciliation (warn)
19. Unmapped diary item needing catalog mapping (task)
20. Negative stock after consumption (critical)

Delivery notes:
21. Proxy consumption used (reservation quantity, not actual) (warn)
22. Return from field pending confirmation (task)
23. Delivery note approved but no receive movement (error)
24. Delivery note item unmapped to catalog (task)
25. Counted ≠ delivered on delivery note item (warn)
26. Delivery note stuck in draft/counting >7 days (warn)
27. Missing supplier for item with minimum quantity (warn)

Also generates/resolves: `purchase_recommendations` (low_stock, out_of_stock, over_reserved, negative_stock)
Also triggers: `syncAllReservations` before each scan

**Declared autonomy level:** 2 (creates tasks/exceptions + triggers safe sync operations)

---

### 3.6 graphics-production-agent — מנהל גרפיקה

| Property | Value |
|---|---|
| AgentType | `"graphics_production"` |
| Department | `"graphics"` |
| Hebrew name | מנהל גרפיקה |
| English name | Graphics Production Manager |
| Neural Core hotspot | `id: "graphics"` |

**Layer coverage:**

| Layer | Status |
|---|---|
| AGENT_REGISTRY | ✅ |
| AgentType union | ✅ |
| AGENT_ORG | ✅ |
| Neural Core hotspot | ✅ |
| DB (agents table) | ✅ |
| Scan route | ❌ None |
| SCANNABLE_AGENTS | ❌ |
| Chat addressable | ✅ |

**Current capability level:** Visual/config only — no scan, no tasks, no logic

**Data it could scan (not yet implemented):**
- `work_orders`: graphics_pending, graphics_active, graphics_done stages
- Relevant fields: graphics_sent_at, graphics_acknowledged_at, graphics_completed_at, customer_approval_status
- SLA thresholds already defined in `workflowEngine.ts`: graphics_pending warn 24h/critical 48h, graphics_active warn 48h/critical 72h, graphics_done warn 24h/critical 48h

**Declared autonomy level:** 0

---

### 3.7 catalog-pricing-agent — מנהל קטלוג

| Property | Value |
|---|---|
| AgentType | `"catalog_pricing"` |
| Department | `"catalog"` |
| Hebrew name | מנהל קטלוג |
| English name | Catalog Manager |
| Neural Core hotspot | `id: "catalog"` |

**Layer coverage:**

| Layer | Status |
|---|---|
| AGENT_REGISTRY | ✅ |
| AgentType union | ✅ |
| AGENT_ORG | ✅ |
| Neural Core hotspot | ✅ |
| DB (agents table) | ✅ |
| Scan route | ❌ None — **PILOT IMPLEMENTATION TARGET** |
| SCANNABLE_AGENTS | ❌ |
| Chat addressable | ✅ |

**Current capability level:** Visual/config only — zero operational logic

**Known data quality problems (confirmed by owner):**
- Missing prices (defaultPrice = null)
- Missing/wrong units of measure
- Duplicate or near-duplicate products
- Weak or inconsistent product names
- Products assigned to wrong/too-general categories
- Missing images/files
- Inconsistent descriptions
- Conflicts between catalog items, order items, inventory, and price references
- Some imported catalog data may be unreliable for commercial decisions

**Data it should scan:**
- `catalog_items` (all fields)
- `work_orders` (data.accessoryRows, data.miscRows for unmapped item detection)
- `inventory_reservations` (for inactive-item-in-active-reservation detection)

**Declared autonomy level:** 0

---

### 3.8 coordination-qa-agent — מנהלת תיאומים ו-QA

| Property | Value |
|---|---|
| AgentType | `"coordination_qa"` |
| Department | `"operations"` |
| Hebrew name | מנהלת תיאומים ו-QA |
| English name | Coordination & QA Manager |
| Neural Core hotspot | `id: "coordination-qa"` |

**Layer coverage:**

| Layer | Status |
|---|---|
| AGENT_REGISTRY | ✅ (recently added) |
| AgentType union | ✅ (recently added) |
| AGENT_ORG | ✅ |
| Neural Core hotspot | ✅ (renamed from "procurement") |
| DB (agents table) | ✅ (recently seeded, autonomy_level: 0) |
| Scan route | ❌ None |
| SCANNABLE_AGENTS | ❌ |
| Chat addressable | ✅ |

**Current capability level:** DB record exists, fully registered — but no scan logic

**Workflow gates this agent should enforce (from workflowEngine.ts):**
- `canMarkReadyForInstallation()` — fabrication gate + warehouse gate
- `canMarkOperationallyComplete()` — same gates, different stage

**Data it should scan:**
- `work_orders` (production → ready_installation transition validity, scheduled_date, warehouse_status, fabrication_status, customer_approval_status)
- `customers` (contact verification for coordination)

**Declared autonomy level:** 0

---

### 3.9 fabrication-agent — מחלקת מסגרייה

| Property | Value |
|---|---|
| AgentType | `"fabrication"` |
| Department | `"fabrication"` |
| Hebrew name | מחלקת מסגרייה |
| English name | Fabrication Department |
| Neural Core hotspot | `id: "fabrication"` |

**Layer coverage:**

| Layer | Status |
|---|---|
| AGENT_REGISTRY | ✅ |
| AgentType union | ✅ |
| AGENT_ORG | ✅ |
| Neural Core hotspot | ✅ |
| DB (agents table) | ✅ |
| Scan route | ❌ None |
| SCANNABLE_AGENTS | ❌ |
| Chat addressable | ✅ |

**Current capability level:** Visual/config only — no scan, no tasks, no logic

**Data it should scan:**
- `work_orders` where `fabrication_required = true` — all non-cancelled
- Relevant fields: fabrication_status (pending | in_progress | ready | completed | acknowledged | issue), scheduled_date, status

**Declared autonomy level:** 0

---

### 3.10 engineering-plan-agent — ניתוח תכניות הנדסה (future placeholder)

| Property | Value |
|---|---|
| AgentType | `"engineering_analysis"` |
| Department | `"engineering"` |
| Hebrew name | ניתוח תכניות הנדסה |
| English name | Engineering Plan Analysis |
| Neural Core hotspot | ❌ Not in Neural Core |

**Layer coverage:**

| Layer | Status |
|---|---|
| AGENT_REGISTRY | ✅ (with explicit note: "future specialized analysis agent — not part of active 9-agent Neural Core") |
| AgentType union | ✅ |
| AGENT_ORG | ❌ (not in hierarchy) |
| Neural Core hotspot | ❌ |
| DB (agents table) | ❌ (not seeded) |
| Scan route | ❌ |
| SCANNABLE_AGENTS | ❌ |
| Chat addressable | ❌ |

**Current capability level:** Concept only — no implementation, no DB record, not in active system

**Future purpose (defined in registry):** PDF engineering analysis, quantity extraction with confidence scoring, technical specification validation for signage

---

## 4. Gap Findings

### Gap 1 — inventory-agent missing from SCANNABLE_AGENTS (BUG)

**File:** `src/components/AgentCommandCenter/index.tsx`
**Line:** `const SCANNABLE_AGENTS = new Set([...])`
**Problem:** `"inventory-agent"` is absent from this set. The scan route exists and is one of the most comprehensive in the system (27+ checks). The scan button does not appear in the Agent Command Center UI.
**Fix:** Add `"inventory-agent"` to the set.
**Risk if unfixed:** Inventory scan can only be triggered via direct API call. No UI trigger. Operator cannot run inventory health checks from the command center.

### Gap 2 — Five agents have no scan routes

| Agent | Impact |
|---|---|
| `graphics-production-agent` | SLA thresholds are defined in workflowEngine.ts but the agent cannot enforce them |
| `catalog-pricing-agent` | Catalog data quality problems are known and undetected by any automated agent |
| `coordination-qa-agent` | Workflow gate violations (`canMarkReadyForInstallation`) are not surfaced by this agent |
| `fabrication-agent` | fabrication_status = "issue" is only caught by ceo, not the fabrication agent itself |
| `engineering-plan-agent` | Intentional — future module, not planned for current phase |

### Gap 3 — No cross-agent awareness

Currently, agents do not read each other's exceptions or tasks. Each agent scans independently. This means:
- ceo may flag the same SLA breach that graphics-agent would flag → duplicate noise in the future
- coordination-qa-agent cannot know whether warehouse-agent has already cleared a reservation issue

**Mitigation path (Phase 2):** Agents should read `agent_exceptions` table filtered by related_entity_id to check whether a sibling agent has already flagged the same order before creating a new exception.

### Gap 4 — engineering-plan-agent is underdefined

The registry entry exists but has no DB row, no AGENT_ORG entry, no hotspot, no scan, and no timeline. This is not a bug — it is an explicitly future module — but it occupies space in the TypeScript type union that could cause confusion.

### Gap 5 — Autonomy levels not consistently enforced

The `autonomy_level` field in the DB is declared per agent but not enforced at runtime. Any scan route can create any exception/task regardless of autonomy level. The autonomy level is currently display-only. Enforcement would require a middleware layer.

---

## 5. DB Tables — Agent Access Map

| Table | Read by agents | Written by agents |
|---|---|---|
| `work_orders` | ceo, billing, cfo, field-ops, inventory | — |
| `work_diaries` | cfo, field-ops, billing, inventory, ceo | — |
| `catalog_items` | inventory | — |
| `inventory_reservations` | inventory | — |
| `inventory_consumptions` | inventory, billing, ceo | — |
| `delivery_notes` | inventory | — |
| `delivery_note_items` | inventory | — |
| `cost_rates` | cfo | — |
| `profitability_snapshots` | cfo | ✅ cfo (generates) |
| `order_problems` | ceo | — |
| `purchase_recommendations` | inventory | ✅ inventory (upsert/resolve) |
| `agents` | — | ✅ all (update status, last_run_at) |
| `agent_tasks` | all | ✅ all |
| `agent_exceptions` | all | ✅ all |
| `agent_approvals` | — | ✅ all (create approval requests) |
| `agent_activity_feed` | — | ✅ all |
| `agent_action_log` | — | ✅ all |

**Tables not yet read by any agent:**
- `customers` (coordination-qa-agent should use this for contact verification)
- `crews` (field-ops-agent should validate crew membership)
- `suppliers` (inventory-agent should use this when FK relationship is added)

---

## 6. Current Autonomy Level Summary

| Agent | Declared Level | Actual Behavior Level |
|---|---|---|
| ceo | 1 | 1 — creates tasks/exceptions |
| billing-collections-agent | 1 | 1 — creates tasks/exceptions |
| cfo-agent | 1 | 1 — creates tasks/exceptions + generates snapshots |
| field-ops-agent | 1 | 1 — creates tasks/exceptions |
| inventory-agent | 2 | 2 — creates tasks/exceptions + triggers syncAllReservations |
| graphics-production-agent | 0 | 0 — no behavior (no scan route) |
| catalog-pricing-agent | 0 | 0 — no behavior (no scan route) |
| coordination-qa-agent | 0 | 0 — no behavior (no scan route) |
| fabrication-agent | 0 | 0 — no behavior (no scan route) |
| engineering-plan-agent | — | 0 — not in active system |

---

## 7. Pages / Routes with Agent-Relevant Business Data

| Route | Component | Agent-relevant data |
|---|---|---|
| `/` (dashboard) | `Dashboard/index.tsx` | KPIs, SLA alerts, department load |
| `/agents` | `AgentCommandCenter/index.tsx` | Agent command center, scan triggers |
| `/orders` | `OrdersTable/index.tsx` | Work order list, status filters |
| `/catalog` | `Catalog/index.tsx` | Catalog CRUD — catalog-agent's domain |
| `/warehouse` | `Warehouse/index.tsx` | Inventory, delivery notes, purchase recommendations |
| `/work-diary` | `WorkDiary` | Diary submission, approval — field-ops and billing domain |
| `/graphics` | `Graphics/index.tsx` | Graphics status tracking |
| `/fabrication` | `Fabrication/index.tsx` | Fabrication status by order |
| `/accounting` | `Accounting/index.tsx` | Billing verification, invoice tracking |
| `/profitability` | `Profitability/index.tsx` | CFO domain — margin per diary/order/crew |
| `/customers` | `Customers/index.tsx` | Customer data — coordination-qa domain |
| `/schedule` | `Schedule/index.tsx` | Weekly scheduling — coordination-qa + ops domain |
| `/crews` | `Crews/index.tsx` | Crew management — field-ops domain |
| `/safety` | `SafetyAccessories/index.tsx` | Safety accessory catalog |

---

## 8. Business Context Relevant to Agent Design

### Order Lifecycle (from workflowEngine.ts)

```
graphics_pending → graphics_active → graphics_done → production → ready_installation → completed
                                                    ↘ (no fabrication needed) ↗
```

**SLA thresholds per stage:**
- graphics_pending: warn 24h, critical 48h (→ graphics dept)
- graphics_active: warn 48h, critical 72h (→ graphics dept)
- graphics_done: warn 24h, critical 48h (→ office/coordination)
- production: warn 72h, critical 120h (→ fabrication)
- ready_installation: warn 24h, critical 72h (→ schedule/field)

**Business gates (from canMarkReadyForInstallation):**
- If fabrication_required: fabrication_status must be "completed" (not just "ready" or "acknowledged")
- If warehouse_required: warehouse_status must be "ready"

### Known Product Domains (from safetyAccessories.ts + signs.ts)

**Traffic Signs:** 200+ Israeli standard signs (Series 100–900), by shape (triangle/circle/rectangle/special) and series (warning, instruction, information, special), with variants (provisional, diamond-reinforced).

**Safety Accessories:** 37 categories including:
- Cones (50cm–1m), flexible separators, barrier posts, sign fixtures, safety lighting (solar/electric), speed mats, cable protection, parking accessories, panoramic mirrors, marking tape, fencing (SAFEGATE HDPE, mesh), accessibility (tactile mats, anti-slip), flood barriers

**Catalog item types** (from types/catalog.ts): product, service, labor, material, equipment, misc

### Cost Model (from types/costRates.ts)

| Cost element | Standard rate |
|---|---|
| Worker daily | 450₪ |
| Team leader daily | 650₪ |
| Worker hourly (OT) | 60₪ |
| Vehicle base daily | 350₪ |
| Fuel per day | 160₪ |
| Vehicle per km | 2.5₪ |
| Equipment daily | 250₪ |
| Overhead % | 18% |
| Fixed daily overhead | 120₪ |
| Minimum daily billing | 3,000₪ |
| Target margin | 28% |
| Warning margin | 12% |
| Loss threshold | 0% |

### Risk Score Model (from riskScoring.ts)

Per-order risk score 0–100 composed of:
- SLA breach: red +40pts, yellow +20pts
- Urgent priority: +15pts
- Open problems: escalating score, max +30pts (critical at ≥3)
- Chronic loss customer (red): +20pts
- Unscheduled installation ready: +20pts
- Missing crew: +10pts
- Fabrication issue flag: +25pts

Risk levels: low 0–25 | medium 26–50 | high 51–75 | critical 76–100

---

*Last updated: 2026-05-17 | Source: full codebase audit*
*Next: see `agent-operating-model.md` for target state and `catalog-agent-pilot.md` for first implementation spec*
