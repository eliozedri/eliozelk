"use client";

import { useState, useCallback, useMemo } from "react";
import { HolographicBackground } from "./HolographicBackground";
import { HolographicStage } from "./HolographicStage";
import { ProductCarousel } from "./ProductCarousel";
import { LeftPanel, RightPanel } from "./DataPanel";
import { catalogItemsToHoloProducts } from "./data";
import { useCatalogContext } from "@/context/CatalogContext";

export function HolographicCatalogPage() {
  const { items } = useCatalogContext();
  // Live catalog (active items only) — no mock data, no fabricated inventory.
  const products = useMemo(
    () => catalogItemsToHoloProducts(items.filter((i) => i.isActive)),
    [items],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const handleSelect = useCallback((id: string) => setActiveId(id), []);

  const activeProduct =
    products.find((p) => p.id === activeId) ?? products[0] ?? null;
  const accent = activeProduct?.accentColor ?? "#06b6d4";

  // Empty / loading state — catalog not yet loaded or no active items.
  if (!activeProduct) {
    return (
      <div
        dir="rtl"
        style={{
          position: "relative", width: "100%", height: "100vh", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 14, background: "#030b18",
        }}
      >
        <HolographicBackground />
        <div style={{ position: "relative", zIndex: 10, fontSize: 64, lineHeight: 1 }}>🗂️</div>
        <p style={{ position: "relative", zIndex: 10, color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 700 }}>
          הקטלוג נטען…
        </p>
        <p style={{ position: "relative", zIndex: 10, color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
          אם אין פריטים פעילים בקטלוג, הוסף פריטים במסך הקטלוג.
        </p>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "#030b18",
      }}
    >
      {/* ── background ── */}
      <HolographicBackground />

      {/* ── header — minimal, 40px ── */}
      <header
        style={{
          position: "relative",
          zIndex: 20,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 44,
          borderBottom: "1px solid rgba(6,182,212,0.11)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 900, flexShrink: 0,
            background: `${accent}1e`, border: `1px solid ${accent}44`, color: accent,
            boxShadow: `0 0 12px ${accent}30`,
          }}>
            א
          </div>
          <div>
            <p style={{ color: "#fff", fontWeight: 800, fontSize: 13, lineHeight: 1.2, margin: 0 }}>
              קטלוג הולוגרפי
            </p>
            <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase", margin: 0 }}>
              Elkayam Road Marking · Operations Catalog
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 12px", borderRadius: 999, border: `1px solid ${accent}28`, background: `${accent}0b` }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, animation: "pulse 2s infinite", display: "inline-block" }} />
          <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.14em", color: `${accent}bb` }}>
            {activeProduct.category}
          </span>
        </div>

        <p style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.15)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
          v1.0 · {products.length} פריטים
        </p>
      </header>

      {/* ── main 3-col grid — takes remaining space minus carousel ── */}
      <main
        style={{
          position: "relative",
          zIndex: 10,
          flex: 1,
          display: "grid",
          /* side panels fixed-width, center gets everything else */
          gridTemplateColumns: "clamp(188px, 21%, 256px) 1fr clamp(196px, 22%, 268px)",
          gap: "clamp(6px, 1vw, 14px)",
          padding: "clamp(6px, 0.8vh, 12px) clamp(10px, 1.5vw, 18px)",
          alignItems: "stretch",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {/* LEFT — stacked glass panels */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, overflow: "hidden" }}>
          <LeftPanel product={activeProduct} />
        </div>

        {/* CENTER — open holographic stage (no card, product floats free) */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden", paddingBottom: 8 }}>
          <HolographicStage product={activeProduct} />
        </div>

        {/* RIGHT — data panel */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden" }}>
          <RightPanel product={activeProduct} />
        </div>
      </main>

      {/* ── bottom carousel — flush, full-width, 3D disc look ── */}
      <footer
        style={{
          position: "relative",
          zIndex: 20,
          flexShrink: 0,
          paddingInline: "clamp(20px, 3vw, 48px)",
          paddingBottom: "clamp(4px, 0.8vh, 10px)",
          paddingTop: 0,
        }}
      >
        {/* top edge glow line */}
        <div style={{
          position: "absolute",
          top: 0,
          left: "6%",
          right: "6%",
          height: 2,
          borderRadius: 2,
          background: `linear-gradient(to right, transparent, ${accent}20 18%, ${accent}55 50%, ${accent}20 82%, transparent)`,
          boxShadow: `0 0 14px 3px ${accent}20`,
        }} />

        <ProductCarousel products={products} activeId={activeProduct.id} onSelect={handleSelect} />
      </footer>
    </div>
  );
}
