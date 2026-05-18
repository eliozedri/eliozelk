# Orders Table V2 — Executive Management View

**Date:** 2026-05-19  
**Status:** Approved  
**Files created:** `src/components/OrdersTable/OrdersTableV2.tsx`  
**Files modified:** `src/app/orders/page.tsx` (one line added)

---

## Goal

A second live view of operational orders optimized for CEO/management/TV-monitor use. Appears below the existing OrdersTable. Uses real data. Inline row expansion — no blocking side drawer.

---

## Architecture

### New file: `OrdersTableV2.tsx`
Standalone `"use client"` component. Imports same data hooks as existing table. No shared state with existing `OrdersTable`.

### Modified file: `orders/page.tsx`
Only addition: `<OrdersTableV2 />` below `<OrdersTable />`. One line.

---

## Data Source

`useOrdersContext()` — identical to existing table.  
Filter: operational statuses only (`graphics_pending`, `graphics_active`, `graphics_done`, `production`, `ready_installation`).  
Sort: critical urgency first → warning → ok; within group, oldest stage age first.

---

## Derived Display Helpers (frontend-only, no DB)

| Function | Output | Logic |
|---|---|---|
| `getUrgencyLevel(order, slaColor)` | `"critical" \| "warning" \| "ok"` | urgent priority OR red SLA → critical; yellow SLA OR open problems → warning |
| `getNextAction(order)` | `{ label: string; cls: string }` | Derived from `status` + `customerApprovalStatus` |
| `getBillingReady(order)` | `boolean` | `status === "completed"` + `accountingStatus` pending/verified |

---

## Row Layout (RTL, flex-based)

```
[right border urgency strip] [order identity flex-1] [progress dots] [status chip] [next action] [SLA age] [billing badge] [chevron]
```

Right border strip = urgency signal (red/amber/transparent).  
Row background tint per urgency (red-50/30, amber-50/20, white).

### Inline expansion
`useState<string | null>(expandedId)` in main component.  
Row click toggles. Expanded panel renders below clicked row inside same container.  
No overlay. No drawer. Table scrolls normally while panel is open.

---

## Expanded Panel Content

- Location (MapPin icon)
- Scheduled date
- Fabrication status (if `fabricationRequired`)
- Warehouse status (if `warehouseRequired`)
- Open problems count (AlertTriangle icon, if any)
- Notes (`generalNotes || notes`)
- Link to edit order: `/new-order?edit={id}`

---

## Visual Language

- Section header: gold left-strip + bold uppercase label
- Container: white, rounded-2xl, border-gray-100, shadow-sm
- Urgency right border: 4px red/amber/transparent
- Status chips: reuse `STATUS_COLORS` from `@/types/workOrder`
- Next action: color-coded border pill (amber/blue/purple/teal)
- Progress: 5-dot linear indicator using `getProgressState`
- SLA dot: green/amber/red colored dot + hours label
- Billing badge: ek-gold tint + Receipt icon
- lucide-react icons: ChevronDown, ChevronUp, MapPin, AlertTriangle, Wrench, Package, Receipt, CheckCircle2, ArrowLeft

---

## Constraints

- Zero changes to `OrdersTable/index.tsx`
- No new npm packages
- No database changes
- No Supabase changes
- No API changes
- No business logic changes
- Hebrew RTL preserved (`dir="rtl"` on html element)
- No framer-motion
