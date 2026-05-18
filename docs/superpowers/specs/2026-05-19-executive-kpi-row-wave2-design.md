# ExecutiveKpiRow — Wave 2 Visual Upgrade

**Date:** 2026-05-19  
**Status:** Approved  
**File:** `src/components/Dashboard/ExecutiveKpiRow.tsx`

---

## Goal

Elevate the KPI row from a plain white card grid to a premium, control-center-quality metric display. Improve information hierarchy, add icon identity per card, expose state-aware background tinting for critical conditions, and refine spacing/hover behavior.

---

## What Changes

### KpiCard structure (before → after)

**Before:**
```
label (11px gray-500)
value (2xl bold, accent color)
context (10px gray-400)
[3px bottom border]
```

**After:**
```
[label (12px semibold gray-600)]  [icon 16px, accent color, top-right]
value (3xl font-black, accent color)
context (11px gray-400)
[4px bottom border]
```

### Icon per card (lucide-react — already installed)

| Card | Icon |
|---|---|
| הזמנות פעילות | `ClipboardList` |
| ממתינות לחיוב | `Receipt` |
| חריגות SLA | `TriangleAlert` |
| יומני שדה היום | `BookOpen` |
| יומנים לאישור | `Clock` |
| ניצולת צוותים | `Gauge` |

### Conditional background tinting (CSS inline, no new classes)

| Condition | Background tint |
|---|---|
| `criticalAlerts > 0` | `#fef2f2` (red-50) |
| `diariesPending > 0` | `#f5f3ff` (violet-50) |
| `capacityUtilizationPct > 90` | `#fef2f2` |
| Default | `white` |

### Hover behavior

Replace `hover:shadow-md` with `hover:-translate-y-px transition-all duration-150` — subtle lift, no shadow jump.

---

## What Does NOT Change

- All props, data types, callback signatures — unchanged
- All KPI values, calculations — untouched
- All color semantics (criticalAlerts red, capacity threshold colors) — untouched
- RTL layout — preserved (flex justify-between in RTL context = label right, icon left)
- No new npm packages
- No framer-motion
- No font changes
- No Tailwind config changes

---

## Success Criteria

1. TypeScript clean — zero new errors
2. Build passes
3. Icons render correctly per card
4. Background tint visible only when condition is met
5. No KPI value or calculation changed
6. RTL layout correct (icon appears on left in Hebrew interface)
