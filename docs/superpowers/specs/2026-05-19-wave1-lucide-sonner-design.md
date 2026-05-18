# Wave 1 UI Upgrade — lucide-react + sonner

**Date:** 2026-05-19  
**Status:** Approved  
**Scope:** Narrow — icon library + toast provider only

---

## Goal

Replace hand-written inline SVG icon functions in `Sidebar.tsx` and `AppShell.tsx` with `lucide-react` components, and add a `sonner` toast provider to the root layout with a single safe integration point (logout feedback).

No architectural changes. No new patterns. No redesign.

---

## Packages

| Package | Version constraint | Purpose |
|---|---|---|
| `lucide-react` | latest | Icon components replacing inline SVGs |
| `sonner` | latest | Toast notification system |

React 19 and Tailwind v4 compatibility confirmed for both.

---

## lucide-react Changes

### `src/components/AppShell.tsx`
- Remove `HamburgerIcon()` function (~5 lines of inline SVG)
- Import `Menu` from `lucide-react`
- Replace `<HamburgerIcon />` usage with `<Menu className="w-5 h-5 text-white" />`

### `src/components/Sidebar.tsx`
Remove all inline SVG icon functions and replace with lucide equivalents:

| Removed function | lucide replacement |
|---|---|
| `OrderIcon` | `FileText` |
| `TableIcon` | `Table2` |
| `ControlCenterIcon` | `LayoutDashboard` |
| `CustomersIcon` | `Users` |
| `GraphicsIcon` | `Palette` |
| `FabricationIcon` | `Wrench` |
| `CatalogIcon` | `Database` |
| `SafetyIcon` | `ShieldCheck` |
| `WarehouseIcon` | `Warehouse` |
| `AccountingIcon` | `DollarSign` |
| `MapIcon` | `Map` |
| `CalendarIcon` | `Calendar` |
| `CrewsIcon` | `UsersRound` |
| `DiaryIcon` | `BookOpen` |
| `ProfitabilityIcon` | `TrendingUp` |
| `AgentsIcon` | `Bot` |
| `SettingsIcon` | `Settings` |
| `AccessIcon` | `ShieldPlus` |
| `LogoutIcon` | `LogOut` |

All replacements use `className="w-4 h-4 shrink-0"` to match existing pattern exactly.

### Files NOT touched
Every other component file. Dashboard, orders, work-log, fabrication, catalog, agents, billing — all untouched.

---

## sonner Changes

### `src/app/layout.tsx`
- Import `Toaster` from `sonner`
- Add `<Toaster position="bottom-left" dir="rtl" richColors />` inside the body, after `AppShell` children
- `bottom-left` renders as bottom-right in RTL — correct Hebrew position
- `richColors` uses semantic green/red for success/error automatically

### `src/components/Sidebar.tsx`
- Import `toast` from `sonner`
- Add `toast.success("התנתקת בהצלחה")` call immediately before or after the existing logout/signOut call
- This is the only toast integration in Wave 1

### Files NOT touched for sonner
No other component files. No API routes. No database logic. No order or work-log logic.

---

## Constraints

- RTL layout preserved — `dir="rtl"` on Toaster, position left = right in Hebrew
- Tailwind v4 setup untouched — `globals.css`, `@theme` tokens unchanged
- Design tokens unchanged — navy, ek-blue, ek-gold palette untouched
- Dashboard structure unchanged
- No shadcn, no Radix, no framer-motion, no other packages
- Diff is small: 2 files modified for icons, 2 files modified for sonner (layout + sidebar logout)

---

## Success Criteria

1. `npm run build` passes with no new errors
2. `npm run lint` passes or has no new warnings beyond pre-existing
3. Sidebar icons render visually at same size and position as before
4. Toast appears in bottom-right on Hebrew screens after logout
5. No regressions in any other module
