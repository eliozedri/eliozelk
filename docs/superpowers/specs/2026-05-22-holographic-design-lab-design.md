# Spec: Holographic Catalog — Design Lab

**Date:** 2026-05-22
**Status:** Approved by user 2026-05-22, **not yet committed**
**Author:** brainstorming skill (assistant) + user

---

## 0. Why

The committed `/holographic-catalog` page (`be7675e`) does not match the user's Gemini reference, and several iterative refinement passes inside one design direction have failed to converge. Before more refinement, we must compare **distinctly different design directions** side-by-side so the user can pick a target.

This is **not a redesign** of `/holographic-catalog`. It is a **design lab** at a separate route that exists alongside the current page.

---

## 1. Goal

Build a local visual gallery at `/holographic-catalog/design-lab` that shows **12 mid-fidelity tiles**, each rendered in a different visual direction. The user scans them, picks the top 3 strongest directions, and then those 3 get full-page treatment in a later iteration.

---

## 2. Out of scope

- Production deploy
- Commit / push (current iteration is local-only)
- Touching `/catalog`, `/catalog-showcase`, current `/holographic-catalog`
- Supabase / DB connections (sample product is a static fixture)
- Sidebar nav entry (the user can navigate by URL during review)
- New heavy deps (only `framer-motion`, already installed)
- Real product images (use stylized fallback rendering inside each variant — `/catalog/transparent/` is empty)

---

## 3. Architecture

**Variant-per-file.** Each design direction is one self-contained React component under `design-lab/variants/`. Variants are free to differ in layout, carousel behavior, stage shape, typography, palette, atmosphere. A shared product fixture means all variants render the same data.

```
src/components/HolographicCatalog/design-lab/
├── DesignLabGrid.tsx           # grid page (renders 12 tiles)
├── variants.ts                 # config registry: { slug, name, hebrew, blurb, anti-slop-broken, Component }
├── shared/
│   ├── sampleProduct.ts        # one product fixture every variant uses
│   └── TileFrame.tsx           # outer chrome around each variant (label, blurb, anti-slop tag)
└── variants/
    ├── v01-gemini-reference.tsx
    ├── v02-command-center.tsx
    ├── v03-premium-showcase.tsx
    ├── v04-tactical-field.tsx
    ├── v05-neon-industrial.tsx
    ├── v06-blueprint-cad.tsx
    ├── v07-traffic-control.tsx
    ├── v08-minimal-glass.tsx
    ├── v09-editorial.tsx
    ├── v10-terminal-core.tsx
    ├── v11-cinematic-dark.tsx
    └── v12-agentic-departments.tsx
```

Route:
- `/holographic-catalog/design-lab` → `DesignLabGrid` (mid-fidelity grid)

Full-page hero variants get their own route in a **later iteration** once the user picks the 3 winners.

---

## 4. Variant list

| # | Slug | Name | Hebrew | Anti-slop broken |
|---|---|---|---|---|
| 1 | `v01-gemini-reference` | Gemini Reference | קטלוג הולוגרפי קלאסי | — (baseline) |
| 2 | `v02-command-center` | Operational Command Center | מרכז שליטה תפעולי | container soup → cleaner cells |
| 3 | `v03-premium-showcase` | Premium Product Showcase | תצוגת פרימיום | blinking dot, three-col grid, container soup |
| 4 | `v04-tactical-field` | Tactical Field Equipment | ציוד שטח טקטי | teal everywhere, accent bars |
| 5 | `v05-neon-industrial` | Neon Industrial | תעשייתי ניאון | teal everywhere, three-col grid |
| 6 | `v06-blueprint-cad` | Blueprint / CAD Scanner | תוכנית הנדסית | teal everywhere, generic Lucide |
| 7 | `v07-traffic-control` | Traffic Control Room | חדר בקרת תנועה | teal everywhere, accent bars, generic Lucide |
| 8 | `v08-minimal-glass` | Minimal Premium Glass | זכוכית מינימליסטית | blinking dot, accent bars, container soup |
| 9 | `v09-editorial` | Editorial Catalog | כתבה עריכתית | teal everywhere, blinking dot, accent bars, three-col grid, container soup |
| 10 | `v10-terminal-core` | Terminal-Core | טרמינל | teal everywhere, generic Lucide |
| 11 | `v11-cinematic-dark` | Cinematic Dark | קולנועי | three-col grid |
| 12 | `v12-agentic-departments` | Agentic Department Catalog | מחלקות אגנטיות | — (connects to agent framework) |

Each variant must show within its tile:
- background atmosphere (signature treatment)
- one product (sample fixture)
- at least one side panel
- a hint of carousel/strip
- the variant's signature pattern

---

## 5. Tile contract

- Each variant renders into a **720 × 440** inner canvas.
- The TileFrame adds a header band above with: variant number, name, hebrew name, one-line blurb, anti-slop tags.
- Tiles render at natural size in a CSS grid:
  - desktop (≥1280px): 3 columns
  - tablet (≥768px): 2 columns
  - mobile: 1 column

No transform-scale tricks — keep tiles at honest size so the user can read details.

---

## 6. Sample product fixture

```ts
{
  id: "speed-bump-70",
  title: "פס האטה גומי 70 ס״מ",
  category: "אביזרי כבישים",
  description: "פס האטה מגומי, מודולרי...",
  specs: 4 entries,
  metrics: 4 entries (158 / 15 / 19 / 329),
  tags: ["Advanced Marking Solutions", "ייצור עצמי"],
  status: "active",
  unit: "יחידה",
  inventoryLabel: "מלאי תקין",
  accent: "#06b6d4",  // overridden per variant
}
```

Image rendering is variant-specific — no shared image element. Each variant renders the product as a stylized box/silhouette/emoji appropriate to its aesthetic (since `/catalog/transparent/` is empty).

---

## 7. Files to create

| Path | Purpose |
|---|---|
| `src/app/holographic-catalog/design-lab/page.tsx` | Next.js route wrapper |
| `src/components/HolographicCatalog/design-lab/DesignLabGrid.tsx` | Grid page |
| `src/components/HolographicCatalog/design-lab/variants.ts` | Registry of 12 variants |
| `src/components/HolographicCatalog/design-lab/shared/sampleProduct.ts` | Fixture |
| `src/components/HolographicCatalog/design-lab/shared/TileFrame.tsx` | Tile chrome |
| `src/components/HolographicCatalog/design-lab/variants/v01-...v12-*.tsx` | 12 variant components |

Total: ~16 new files, all under `design-lab/`. **Zero edits** to any existing file.

---

## 8. Acceptance criteria

- [ ] `/holographic-catalog/design-lab` route loads
- [ ] All 12 variants render at honest size
- [ ] Each variant is visibly distinct in **layout or atmosphere**, not only color
- [ ] Sample product is the same fixture across all 12
- [ ] No edits to `HolographicCatalogPage.tsx`, `/catalog`, `/catalog-showcase`
- [ ] `npx tsc --noEmit --skipLibCheck` passes
- [ ] `npm run build` succeeds with the new route
- [ ] Dev server serves the lab without console errors
- [ ] Hebrew/RTL text renders correctly in every variant
- [ ] Nothing committed; nothing pushed; nothing deployed

---

## 9. After lab review (next iteration, separate spec)

User picks 3 hero variants. Those get:
- Full-page routes at `/holographic-catalog/design-lab/<slug>`
- Real product carousel using `HOLO_PRODUCTS`
- Real pointer-driven 3D tilt
- Polish pass before they could replace `/holographic-catalog`
