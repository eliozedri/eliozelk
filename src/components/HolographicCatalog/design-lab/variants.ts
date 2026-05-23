/**
 * Design-lab variants registry.
 * Each entry references one self-contained variant component.
 * Order is the display order in the grid.
 */
import type { ComponentType } from "react";
import type { TileMeta } from "./shared/TileFrame";

import { V01GeminiReference }    from "./variants/v01-gemini-reference";
import { V02CommandCenter }      from "./variants/v02-command-center";
import { V03PremiumShowcase }    from "./variants/v03-premium-showcase";
import { V04TacticalField }      from "./variants/v04-tactical-field";
import { V05NeonIndustrial }     from "./variants/v05-neon-industrial";
import { V06BlueprintCad }       from "./variants/v06-blueprint-cad";
import { V07TrafficControl }     from "./variants/v07-traffic-control";
import { V08MinimalGlass }       from "./variants/v08-minimal-glass";
import { V09Editorial }          from "./variants/v09-editorial";
import { V10TerminalCore }       from "./variants/v10-terminal-core";
import { V11CinematicDark }      from "./variants/v11-cinematic-dark";
import { V12AgenticDepartments } from "./variants/v12-agentic-departments";

export interface VariantEntry extends TileMeta {
  Component: ComponentType;
}

export const VARIANTS: VariantEntry[] = [
  {
    num: 1, slug: "v01-gemini-reference",
    name: "Gemini Reference",                  hebrew: "קטלוג הולוגרפי קלאסי",
    blurb: "Baseline — the original Gemini target distilled.",
    breaks: [], Component: V01GeminiReference,
  },
  {
    num: 2, slug: "v02-command-center",
    name: "Operational Command Center",        hebrew: "מרכז שליטה תפעולי",
    blurb: "Live-ops dashboard: agent rail, telemetry ticker, warehouse heat-map.",
    breaks: ["container soup"], Component: V02CommandCenter,
  },
  {
    num: 3, slug: "v03-premium-showcase",
    name: "Premium Product Showcase",          hebrew: "תצוגת פרימיום",
    blurb: "Apple-keynote: huge product, near-empty chrome, single spec strip.",
    breaks: ["blinking dot", "3-col grid", "container soup"], Component: V03PremiumShowcase,
  },
  {
    num: 4, slug: "v04-tactical-field",
    name: "Tactical Field Equipment",          hebrew: "ציוד שטח טקטי",
    blurb: "Safety-orange + olive, crosshair targeting, GPS readouts.",
    breaks: ["teal everywhere", "accent bars"], Component: V04TacticalField,
  },
  {
    num: 5, slug: "v05-neon-industrial",
    name: "Neon Industrial",                    hebrew: "תעשייתי ניאון",
    blurb: "Black + amber neon, brutalist oversized numerals, monospace.",
    breaks: ["teal everywhere", "3-col grid"], Component: V05NeonIndustrial,
  },
  {
    num: 6, slug: "v06-blueprint-cad",
    name: "Blueprint / CAD Scanner",            hebrew: "תוכנית הנדסית",
    blurb: "Technical drawing on blueprint blue, dimension lines, BOM table.",
    breaks: ["teal everywhere", "Lucide icons"], Component: V06BlueprintCad,
  },
  {
    num: 7, slug: "v07-traffic-control",
    name: "Traffic Control Room",                hebrew: "חדר בקרת תנועה",
    blurb: "Red/amber/green palette, signal-light status, lane dividers.",
    breaks: ["teal everywhere", "accent bars", "Lucide icons"], Component: V07TrafficControl,
  },
  {
    num: 8, slug: "v08-minimal-glass",
    name: "Minimal Premium Glass",               hebrew: "זכוכית מינימליסטית",
    blurb: "Barely-there UI, one glass card, lots of negative space.",
    breaks: ["blinking dot", "accent bars", "container soup"], Component: V08MinimalGlass,
  },
  {
    num: 9, slug: "v09-editorial",
    name: "Editorial Catalog",                   hebrew: "כתבה עריכתית",
    blurb: "Magazine spread, big serif title, polaroid product photo.",
    breaks: ["teal everywhere", "blinking dot", "accent bars", "3-col grid", "container soup"],
    Component: V09Editorial,
  },
  {
    num: 10, slug: "v10-terminal-core",
    name: "Terminal-Core Catalog",                hebrew: "טרמינל פוספור",
    blurb: "ASCII frames, phosphor green, blinking cursor, CLI energy.",
    breaks: ["teal everywhere", "Lucide icons"], Component: V10TerminalCore,
  },
  {
    num: 11, slug: "v11-cinematic-dark",
    name: "Cinematic Dark",                       hebrew: "קולנועי",
    blurb: "Film-grade gradients, anamorphic flare, letterbox, huge type.",
    breaks: ["3-col grid"], Component: V11CinematicDark,
  },
  {
    num: 12, slug: "v12-agentic-departments",
    name: "Agentic Department Catalog",           hebrew: "מחלקות אגנטיות",
    blurb: "Product hub linked to Inventory / Procurement / Field / Coordination.",
    breaks: [], Component: V12AgenticDepartments,
  },
];
