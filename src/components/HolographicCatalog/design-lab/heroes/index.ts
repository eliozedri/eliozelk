/**
 * Hero registry — slug → full-page component.
 * Only the 3 user-selected directions (v01, v04, v11) currently have heroes.
 */
import type { ComponentType } from "react";
import { V01GeminiHero }    from "./v01-gemini-hero";
import { V04TacticalHero }  from "./v04-tactical-hero";
import { V11CinematicHero } from "./v11-cinematic-hero";

export const HEROES: Record<string, { Component: ComponentType; name: string }> = {
  "v01-gemini-reference":  { Component: V01GeminiHero,    name: "V01 · Gemini Reference"  },
  "v04-tactical-field":    { Component: V04TacticalHero,  name: "V04 · Tactical Field"    },
  "v11-cinematic-dark":    { Component: V11CinematicHero, name: "V11 · Cinematic Dark"    },
};

export const HERO_SLUGS = Object.keys(HEROES);
