"use client";

/**
 * V01 hero — wraps the existing committed /holographic-catalog page.
 * v01 IS the Gemini Reference direction, so the hero is the existing implementation
 * (with a tiny back-to-lab chrome). No duplication.
 */
import { HolographicCatalogPage } from "../../HolographicCatalogPage";
import { HeroChrome } from "./HeroChrome";

export function V01GeminiHero() {
  return (
    <>
      <HeroChrome label="V01 · Gemini Reference" />
      <HolographicCatalogPage />
    </>
  );
}
