# Agent Training Model
**Elkayam Road Marking LTD — Digital Operations Command Center**
**Date:** 2026-05-17 | **Status:** Specification — approved for implementation planning

---

## 1. What "Training" Means in This System

This is not a machine learning system. There are no model weights, no neural networks, and no automatic learning from data.

"Training" in this context means:

> **Building reliable, auditable, human-approved knowledge that improves agent decision quality over time.**

This happens through six concrete mechanisms:
1. Written rules and SOPs stored in `docs/agents/`
2. Approval feedback loops stored in `agent_approvals`
3. QA test cases run against scan logic
4. Source-of-truth rules that define what the agent treats as authoritative
5. Threshold calibration based on historical exception resolution patterns
6. Rejection examples that show the agent what not to flag

None of these require changing the codebase's underlying architecture. They require discipline in running scans, reviewing output, and logging decisions consistently.

---

## 2. Training Mechanisms

### 2.1 Knowledge Base Documents

Location: `docs/agents/`

These markdown files are the agent's written knowledge base. They should be updated when:
- A business rule changes
- Owner clarification resolves a previously marked "Requires owner clarification"
- A new product domain or workflow stage is added to the system
- An agent consistently produces false positives in a category — the rule needs to be refined in writing before it is refined in code

**What belongs in knowledge base docs:**
- Business rules (what counts as a valid catalog item, what is a genuine SLA breach, what fabrication statuses are acceptable)
- Escalation paths (who gets notified, in what order, for what severity)
- Category rules (which product categories exist, what belongs in each)
- Naming conventions (how products should be named in the catalog)
- Approval process steps (what happens when a human approves or rejects a suggestion)
- Owner-confirmed exceptions (e.g., "Item X is intentionally priced at zero — do not flag")

**What does NOT belong in knowledge base docs:**
- Code implementation details (those belong in code comments and this spec)
- Historical records of specific decisions (those belong in `agent_approvals` and `agent_activity_feed`)
- Temporary workarounds (those belong in code with a dated comment)

---

### 2.2 Approval Feedback Loop

The `agent_approvals` table is the most important training signal in the system.

**How it works:**

When an agent creates an approval request:
- `action_payload` contains the full context: what was detected, what correction was suggested, what evidence was used
- `risk_level` is set by the agent
- Human reviews and sets `approval_status` to "approved" or "rejected"
- If rejected: `rejected_reason` is filled in

**What to do with this data:**

| Event | Training action |
|---|---|
| Human approves the same class of suggestion consistently (>5 times) | The detection rule is likely well-calibrated. No change needed. |
| Human rejects with reason "not applicable — this is intentional" | Add an explicit exception to the knowledge base doc. Consider adding a DB flag on the entity. |
| Human rejects with reason "wrong threshold — this is normal for us" | Adjust the detection threshold in the scan rule (requires code change after owner confirmation). |
| Human always approves immediately without reviewing carefully | The risk_level may be too low — consider raising it to force more deliberate review. |
| Human consistently dismisses a certain category | That category's detection rule may be producing noise. Review and recalibrate or remove. |

**Periodic review cadence (Requires owner clarification: monthly? quarterly?):**
- Export all `agent_approvals` from the past period
- Count approved vs. rejected per agent per category
- Calculate false positive rate = rejected / (approved + rejected) per category
- If false positive rate > 25% in any category → review the detection rule with owner

---

### 2.3 QA Test Cases

Each scan check must have documented "should detect" and "should not detect" test cases before it is deployed.

**Format:**

```
Check: [Rule name]
Should detect:
  - [DB state description] → expected: [exception type, severity]
  - [DB state description] → expected: [task created, priority]
Should NOT detect:
  - [DB state description] → expected: nothing
Edge cases:
  - [boundary condition] → expected: [outcome]
```

These test cases are stored in this `docs/agents/` directory, adjacent to the spec documents. A developer implementing a scan rule must verify all test cases pass before merging.

Test cases also serve as regression protection: if a scan rule is modified later, the test cases must still pass.

**For the Catalog Agent pilot**, the QA test cases are defined in `catalog-agent-pilot.md` Section 11.

---

### 2.4 Threshold Calibration

Detection rules have configurable thresholds: SLA hours, minimum stock percentages, delay thresholds, similarity cutoffs. These should NOT be hardcoded — they should be read from a source that can be updated without a code deploy.

**Current approach (Phase 1):**
- SLA thresholds: read from `STAGE_SLA` in `workflowEngine.ts` — do not hardcode in scan routes
- Profitability thresholds: read from `cost_rates` table where applicable
- Other thresholds: defined as named constants in each scan route, clearly labeled for easy change

**Target approach (Phase 2):**
- Store agent-specific thresholds in an `agent_config` table (one row per agent per key)
- Scan routes read thresholds from DB at scan time
- This allows threshold adjustment without code change

**Calibration signals:**

| Signal | Action |
|---|---|
| Exception consistently resolved in <1h after creation | Threshold may be too loose (catching too early). Consider tightening. |
| Exception resolved only after escalation by owner | Threshold may be too tight (not catching soon enough). Loosen. |
| Exception is always immediately dismissed | Detection rule is wrong. Remove or rewrite. |
| Exception always requires human input to resolve | This is correct behavior — do not automate. |

---

### 2.5 Audit History

The `agent_activity_feed` and `agent_action_log` tables provide a longitudinal view of agent behavior.

**Use audit history to answer:**
- Which agent creates the most noise (high exception creation, high dismissal rate)?
- Which orders appear most frequently in exceptions (systemic problem or data quality issue)?
- Which scan checks are never triggered (rule may be unreachable or not calibrated correctly)?
- What was the system state at any point in time (for retrospective analysis)?

**30-day lookback review (periodic):**
- For each agent: count exceptions created, resolved, dismissed
- Calculate signal-to-noise ratio: `resolved / (resolved + dismissed + still_open)`
- If signal-to-noise < 0.5 → that agent's detection logic needs review
- If signal-to-noise > 0.9 → that agent is well-calibrated

---

### 2.6 Owner-Confirmed Exception List

Some business realities are permanent exceptions to detection rules. These must be explicitly documented so they are not repeatedly flagged:

**Format (to be maintained as a list in this section or a separate file):**

```
Entity: [catalog_item: item_id or name]
Rule: [which detection rule would fire]
Exception reason: [why this is intentional]
Confirmed by: [owner]
Confirmed date: [date]
Expires: [never / specific date]
```

**Implementation:** Add an `agent_exception_whitelist` table (Phase 2), or initially handle via explicit skip conditions in scan logic keyed by entity ID with a dated comment.

---

## 3. Source of Truth Hierarchy

When an agent encounters conflicting information — or must decide what is "true" — apply this hierarchy from highest to lowest authority:

| Priority | Source | Notes |
|---|---|---|
| 1 | **Owner-confirmed business rule** | Explicit approval by owner in Command Center, or written in docs/agents/ knowledge base |
| 2 | **Production DB current state** | What the system's authoritative tables say right now — not cached, not computed |
| 3 | **Approved catalog** | `catalog_items` where `is_active = true` — the agreed-upon product definition |
| 4 | **Immutable inventory ledger** | `inventory_movements` — append-only, never overwritten; authoritative for stock quantities |
| 5 | **Approved company price list** | **Requires owner clarification: does this exist? Where?** If it does, it ranks above order history |
| 6 | **Historical order data** | What has been ordered in the past — useful as a signal, not as a fact |
| 7 | **Agent suggestion** | Output of a scan rule — a hypothesis, not a fact. Must not be applied without human approval. |

**Conflict resolution rule:**
If two sources at the same priority level conflict (e.g., two DB columns contradict each other), the agent must surface the conflict as an exception and ask for human resolution. It must never silently choose one over the other.

**Example conflicts and resolutions:**
- `catalog_items.reserved_quantity` ≠ `SUM(inventory_reservations.quantity WHERE status='active')` → inventory-agent surfaces this as exception (reserved_cache_mismatch) — this is already implemented
- `work_orders.warehouse_status = 'ready'` but inventory-agent has a critical exception on stock for items in that order → coordination-qa-agent should surface the conflict (Phase 2)
- A catalog item has `defaultPrice=0` and the owner-confirmed exception list says this is intentional → agent skips Rule 6 for that item

---

## 4. What Must Be Blocked Until Better Training/Data Exists

Each agent has a set of actions that are blocked until specific preconditions are met. These are not permanent restrictions — they are training gates. Once the condition is satisfied, the action can be enabled.

### 4.1 Catalog Agent

| Blocked action | Precondition to unblock |
|---|---|
| Suggesting a specific price value for a missing-price item | Owner-confirmed price list is available in the system |
| Auto-applying a suggested correction | 20+ human-approved corrections have been accumulated in `agent_approvals` with consistent patterns |
| Detecting type-category mismatches reliably | Owner-confirmed category tree is documented and encoded |
| Near-duplicate detection beyond basic prefix matching | Owner-confirmed naming convention is documented |

### 4.2 Coordination & QA Agent

| Blocked action | Precondition to unblock |
|---|---|
| Confirming order readiness | Never — this is always a human decision |
| Suggesting a specific scheduled_date | Never — scheduling is always a human decision |
| Cross-checking customer coordination | `customers` table must have contact data fields integrated into order coordination workflow |

### 4.3 Graphics Agent

| Blocked action | Precondition to unblock |
|---|---|
| Flagging a "customer approval delay" as a breach | Owner must confirm which order types always require customer approval |
| Recommending a bypass of customer approval | Never automatic — always requires owner decision |
| Detecting repeat-slow customers | 3+ months of approval turnaround data must be accumulated per customer |

### 4.4 Fabrication Agent

| Blocked action | Precondition to unblock |
|---|---|
| Flagging stuck in_progress as a breach | Owner-confirmed normal fabrication duration per order type must be documented |
| Detecting production capacity conflicts | Production queue data must be tracked in the system (not currently implemented) |

### 4.5 CFO Agent

| Blocked action | Precondition to unblock |
|---|---|
| Recommending billing amount changes based on margin | Confidence level must be "high" (not medium or low) — never recommend financial changes on incomplete data |
| Flagging a customer as "chronic loss" | At least 3 completed orders with negative margin must exist for that customer |
| Forecasting next-week revenue | At least 12 weeks of diary data must exist in the system |

### 4.6 All Agents

| Blocked action | Blocked until |
|---|---|
| Any write to production data other than: agent_tasks, agent_exceptions, agent_approvals, agent_activity_feed, agent_action_log | Owner approval for that specific agent + specific action type |
| Any communication to external parties (email, WhatsApp, supplier systems) | System-level constraint — permanently blocked regardless of training |
| Invoice generation | System-level constraint — permanently blocked |
| Direct modification of financial records | System-level constraint — permanently blocked |

---

## 5. How to Add Knowledge to an Agent

Follow this sequence when adding new knowledge to any agent. Do not skip steps.

### Step 1 — Document the rule
Write the rule in the agent's knowledge base doc (`docs/agents/`):
- What condition triggers the rule
- What evidence supports the rule (why is this actually a problem?)
- What the agent should surface (exception? task? both?)
- What the correct resolution is
- Is owner approval required for the resolution?

### Step 2 — Define QA test cases
Before writing any code, define:
- 2–3 "should detect" scenarios
- 2–3 "should not detect" scenarios
- 1–2 edge cases (boundary conditions)

### Step 3 — Implement in scan route
Add the detection logic to the agent's scan route following the patterns in `scan-utils.ts`. Use the established `dedupeKey`, `upsertException`, and `upsertTask` functions.

### Step 4 — Run against test data
Verify that all QA test cases from Step 2 pass. Do not deploy to production until they do.

### Step 5 — Deploy and run scan
Run the scan manually from the Agent Command Center. Review the output: are the new exceptions accurate? Are there false positives?

### Step 6 — Owner review
Owner reviews the first scan output containing the new rule. Owner approves or dismisses each flagged item. Record the outcome in `agent_approvals`.

### Step 7 — Calibrate
Based on owner feedback:
- If 0 false positives: rule is well-calibrated
- If >25% false positives: adjust threshold or detection condition; return to Step 1
- If all flags were dismissed: remove the rule or rewrite it fundamentally

### Step 8 — Add to exception whitelist (if needed)
If owner dismisses specific items as "intentionally this way," add them to the owner-confirmed exception list.

---

## 6. Evaluation Criteria

An agent is considered well-calibrated when all of these are true:

| Criterion | Target |
|---|---|
| Signal-to-noise ratio | >75% of exceptions created are resolved (not dismissed) |
| False positive rate per category | <25% per detection rule |
| Approval rate on tasks | >80% of tasks created are completed (not dismissed) by humans |
| Auto-resolution rate | >60% of exceptions auto-resolve on next scan after condition clears |
| Threshold stability | No threshold changes needed for 30+ days of operation |
| Duplicate exception rate | <5% (same condition creating two exceptions for the same entity) |

An agent that consistently fails these criteria needs rule-level review, not more scanning frequency.

---

## 7. Cross-Agent Training Dependencies

Some detection rules in one agent depend on data quality that another agent improves. These dependencies must be understood to sequence training correctly:

| Dependent agent | Depends on | Why |
|---|---|---|
| billing-collections-agent | inventory-agent | Billing verification requires reconciliation data that inventory-agent maintains |
| billing-collections-agent | field-ops-agent | Billing requires diary approval, which field-ops-agent monitors |
| cfo-agent | catalog-pricing-agent | Profitability confidence improves as catalog-agent ensures costPrice is populated |
| coordination-qa-agent | inventory-agent + fabrication-agent | Pre-dispatch QA depends on warehouse_status and fabrication_status being accurate |
| ceo | all agents | System health view depends on all agents producing accurate exceptions |

**Training order recommendation (Phase 1 → Phase 2):**
1. Train inventory-agent first (most comprehensive data, direct impact on billing and scheduling)
2. Train billing-collections-agent (depends on inventory, already implemented)
3. Train catalog-pricing-agent (improves profitability confidence for cfo-agent)
4. Train graphics-production-agent (improves scheduling accuracy)
5. Train coordination-qa-agent (uses output from warehouse + fabrication as inputs)
6. Train fabrication-agent (provides gate data for coordination-qa-agent)
7. Train ceo to aggregate cross-agent awareness (Phase 2)

---

## 8. Agent Improvement Signals — What to Watch

After each monthly review, look for these signals to determine where training effort should be directed:

| Signal | Meaning | Action |
|---|---|---|
| High dismissal rate in one agent | Rules are too sensitive or detecting non-problems | Review detection logic; tighten thresholds |
| No exceptions created in a domain | Rules may be too tight, or data quality is genuinely good | Verify with manual check; don't assume it's good |
| Same order appearing in 5+ exceptions from different agents | The order has a genuine systemic problem | Investigate the order; consider a root-cause fix |
| Owner never reviews pending approvals | Process is not embedded in daily workflow | Adjust task assignment; consider different notification channel |
| Exceptions created but never auto-resolved | Either condition never clears, or auto-resolve logic is broken | Check the auto-resolve condition in `autoResolveStaleExceptions` |
| Agent scan time increasing | Data volume growing; consider indexing or query optimization | Profile the scan query; optimize before adding more rules |

---

## 9. Phase Milestones for Agent Training

### Phase 1 — Foundation (current target)
- ✅ Ops-orchestrator scan: 8 checks implemented
- ✅ Billing scan: billing delay + reconciliation checks
- ✅ CFO scan: profitability snapshots + margin exceptions
- ✅ Field-ops scan: diary completeness + approval overdue
- ✅ Inventory scan: 27 checks (UI bug: not in SCANNABLE_AGENTS)
- 🔲 Catalog scan: 5 MVP rules (pilot to implement)
- 🔲 SCANNABLE_AGENTS bug fix: add inventory-agent

### Phase 2 — Expansion
- 🔲 Graphics-production scan: SLA + customer approval checks
- 🔲 Fabrication scan: issue + stuck + gate bypass checks
- 🔲 Coordination-QA scan: gate failure checks
- 🔲 Cross-agent exception deduplication
- 🔲 Threshold DB config table (agent_config)
- 🔲 Owner exception whitelist DB table
- 🔲 Approval feedback review cadence established

### Phase 3 — Intelligence
- 🔲 Customer-level chronic loss detection (CFO + billing)
- 🔲 Catalog auto-suggestion calibration (based on 20+ approved corrections)
- 🔲 Cross-agent pre-dispatch checklist (coordination-QA reads all agent exceptions for an order before dispatch)
- 🔲 Threshold auto-calibration suggestions (read from approval history, suggest threshold changes for owner review)

---

*Last updated: 2026-05-17 | Source: Elkayam business context + codebase audit + agent operating model*
*Companion documents: agent-capability-audit.md, agent-operating-model.md, catalog-agent-pilot.md*
