"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export interface TileMeta {
  num: number;
  slug: string;
  name: string;
  hebrew: string;
  blurb: string;
  /** anti-slop fingerprints this variant breaks */
  breaks: string[];
  /** background to paint behind the inner canvas */
  bg?: string;
}

export function TileFrame({
  meta,
  children,
  hasHero = false,
}: {
  meta: TileMeta;
  children: ReactNode;
  hasHero?: boolean;
}) {
  return (
    <article
      style={{
        width: 720,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(148,163,184,0.18)",
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
      }}
    >
      {/* header band */}
      <header
        dir="ltr"
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(148,163,184,0.15)",
          background: "rgba(15,23,42,0.65)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            style={{
              flexShrink: 0,
              width: 26,
              height: 26,
              borderRadius: 6,
              background: "rgba(56,189,248,0.14)",
              border: "1px solid rgba(56,189,248,0.35)",
              color: "#38bdf8",
              fontSize: 11,
              fontFamily: "monospace",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            V{String(meta.num).padStart(2, "0")}
          </span>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                color: "#f1f5f9",
                fontSize: 13,
                fontWeight: 700,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {meta.name}
              <span
                style={{
                  marginLeft: 8,
                  color: "rgba(148,163,184,0.6)",
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
                dir="rtl"
              >
                {meta.hebrew}
              </span>
            </p>
            <p
              style={{
                margin: "2px 0 0",
                color: "rgba(148,163,184,0.85)",
                fontSize: 11,
                lineHeight: 1.35,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {meta.blurb}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end", alignItems: "center", maxWidth: 280 }}>
          {meta.breaks.map((b) => (
            <span
              key={b}
              title={`breaks: ${b}`}
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(244,114,182,0.10)",
                border: "1px solid rgba(244,114,182,0.30)",
                color: "rgba(244,114,182,0.95)",
                whiteSpace: "nowrap",
              }}
            >
              ✕ {b}
            </span>
          ))}
          {hasHero && (
            <Link
              href={`/holographic-catalog/design-lab/${meta.slug}`}
              style={{
                marginInlineStart: 4,
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: 999,
                background: "rgba(34,197,94,0.14)",
                border: "1px solid rgba(34,197,94,0.45)",
                color: "#86efac",
                textDecoration: "none",
                whiteSpace: "nowrap",
                letterSpacing: "0.04em",
              }}
              title="Open full-page hero"
            >
              ★ Open full →
            </Link>
          )}
        </div>
      </header>

      {/* inner canvas — fixed honest size, RTL for product content */}
      <div
        dir="rtl"
        style={{
          width: 720,
          height: 440,
          position: "relative",
          overflow: "hidden",
          background: meta.bg ?? "#020617",
        }}
      >
        {children}
      </div>
    </article>
  );
}
