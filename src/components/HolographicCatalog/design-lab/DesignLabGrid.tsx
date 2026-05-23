"use client";

import { TileFrame } from "./shared/TileFrame";
import { VARIANTS } from "./variants";
import { HERO_SLUGS } from "./heroes";

const HERO_SET = new Set(HERO_SLUGS);

export function DesignLabGrid() {
  return (
    <main
      dir="ltr"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg,#020617 0%,#050b1a 100%)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        padding: "28px 24px 80px",
      }}
    >
      {/* page header */}
      <header style={{ maxWidth: 1480, margin: "0 auto 28px" }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.3em", color: "#38bdf8", textTransform: "uppercase" }}>
          Elkayam · Holographic Catalog
        </p>
        <h1 style={{ margin: "6px 0 0", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: "#f8fafc" }}>
          Design Lab — 12 Mid-Fidelity Directions
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#94a3b8", maxWidth: 740, lineHeight: 1.5 }}>
          Each tile shows a distinct visual direction for the holographic catalog. Same product, same data — only
          the design language changes. Tiles marked <span style={{ color: "#86efac", fontWeight: 700 }}>★ Open full</span> have a real full-page hero with the live carousel.
        </p>
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11, color: "#64748b" }}>
          <Tag>RTL · Hebrew</Tag>
          <Tag>{VARIANTS.length} variants</Tag>
          <Tag>{HERO_SET.size} full-page heroes</Tag>
          <Tag>same sample product across all tiles</Tag>
          <Tag>pink chips = anti-slop patterns broken</Tag>
          <Tag>local only · not committed</Tag>
        </div>
      </header>

      {/* grid */}
      <section
        style={{
          maxWidth: 1480,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 720px)",
          gap: 22,
          justifyContent: "center",
        }}
      >
        {VARIANTS.map((v) => {
          const { Component } = v;
          return (
            <TileFrame key={v.slug} meta={v} hasHero={HERO_SET.has(v.slug)}>
              <Component />
            </TileFrame>
          );
        })}
      </section>

      {/* footer */}
      <footer style={{ maxWidth: 1480, margin: "40px auto 0", paddingTop: 18, borderTop: "1px solid rgba(148,163,184,0.15)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 11, color: "#64748b" }}>
        <span>
          Inspiration: <a href="https://github.com/rohitg00/awesome-claude-design" style={{ color: "#38bdf8" }} target="_blank" rel="noreferrer">awesome-claude-design</a> — 9 aesthetic families + anti-slop list.
        </span>
        <span>
          Active route: <code style={{ color: "#e2e8f0", background: "rgba(56,189,248,0.10)", padding: "2px 6px", borderRadius: 4 }}>/holographic-catalog/design-lab</code>
        </span>
      </footer>
    </main>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: "3px 9px",
      borderRadius: 999,
      border: "1px solid rgba(148,163,184,0.20)",
      background: "rgba(148,163,184,0.06)",
    }}>
      {children}
    </span>
  );
}
