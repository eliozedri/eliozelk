"use client";

import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HoloProduct } from "./types";

interface Props {
  products: HoloProduct[];
  activeId: string;
  onSelect: (id: string) => void;
}

function getCardProps(offset: number) {
  const abs = Math.abs(offset);
  if (abs === 0) return { scale: 1.32, opacity: 1,    y: -24, brightness: 1.15 };
  if (abs === 1) return { scale: 0.90, opacity: 0.90, y:  -8, brightness: 0.85 };
  if (abs === 2) return { scale: 0.75, opacity: 0.68, y:   2, brightness: 0.65 };
  if (abs === 3) return { scale: 0.62, opacity: 0.42, y:   8, brightness: 0.45 };
  return              { scale: 0.50, opacity: 0.22, y:  12, brightness: 0.28 };
}

const VISIBLE = 9;
const HALF    = Math.floor(VISIBLE / 2);

export function ProductCarousel({ products, activeId, onSelect }: Props) {
  const activeIndex   = products.findIndex((p) => p.id === activeId);
  const activeProduct = products[activeIndex];
  const accent        = activeProduct?.accentColor ?? "#06b6d4";

  const prev = useCallback(() =>
    onSelect(products[(activeIndex - 1 + products.length) % products.length].id),
    [activeIndex, products, onSelect],
  );
  const next = useCallback(() =>
    onSelect(products[(activeIndex + 1) % products.length].id),
    [activeIndex, products, onSelect],
  );

  const visible = Array.from({ length: VISIBLE }, (_, i) => {
    const offset = i - HALF;
    const idx    = (activeIndex + offset + products.length) % products.length;
    return { product: products[idx], offset };
  });

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: 6 }}>

      {/* ── 3D disc platform — very prominent curved rim like the reference ── */}
      <div style={{ position: "absolute", inset: 0, perspective: "230px", perspectiveOrigin: "50% 100%", pointerEvents: "none", zIndex: 0 }}>

        {/* outer ellipse — the curved rim the reference shows clearly */}
        <div style={{
          position: "absolute",
          bottom: 0, left: "0.5%", right: "0.5%",
          height: "100%",
          transform: "rotateX(78deg)",
          transformOrigin: "50% 100%",
          borderRadius: "50%",
          border: `2.5px solid ${accent}90`,
          background: `radial-gradient(ellipse 88% 65% at 50% 62%, ${accent}22 0%, ${accent}0c 50%, transparent 80%)`,
          boxShadow: `0 0 72px 14px ${accent}22, inset 0 0 50px ${accent}0c`,
        }} />

        {/* inner bright ring */}
        <div style={{
          position: "absolute",
          bottom: 0, left: "19%", right: "19%",
          height: "68%",
          transform: "rotateX(78deg)",
          transformOrigin: "50% 100%",
          borderRadius: "50%",
          border: `1.5px solid ${accent}ee`,
          boxShadow: `0 0 30px 7px ${accent}55`,
        }} />

        {/* center glow spot on disc */}
        <div style={{
          position: "absolute",
          bottom: 0, left: "37%", right: "37%",
          height: "38%",
          transform: "rotateX(78deg)",
          transformOrigin: "50% 100%",
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${accent}66 0%, ${accent}28 50%, transparent 78%)`,
          filter: "blur(4px)",
        }} />
      </div>

      {/* ── items layer — slight forward tilt so they sit ON the disc ── */}
      <div style={{ perspective: "680px", perspectiveOrigin: "50% 120%", position: "relative", zIndex: 10 }}>
        <div style={{
          transform: "rotateX(8deg)",
          transformOrigin: "50% 100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: "clamp(3px, 0.6vw, 8px)",
          padding: "8px clamp(30px, 4.5vw, 58px) 14px",
        }}>
          <AnimatePresence initial={false}>
            {visible.map(({ product, offset }) => {
              const { scale, opacity, y, brightness } = getCardProps(offset);
              const isActive   = offset === 0;
              const cardAccent = product.accentColor ?? "#06b6d4";

              return (
                <motion.button
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.45 }}
                  animate={{ scale, opacity, y }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ type: "spring", stiffness: 270, damping: 26 }}
                  onClick={() => onSelect(product.id)}
                  style={{
                    position: "relative", flexShrink: 0,
                    display: "flex", flexDirection: "column", alignItems: "center",
                    cursor: "pointer", background: "none", border: "none", padding: 0,
                  }}
                  aria-label={product.title}
                >
                  <div
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      width:        isActive ? 118 : Math.abs(offset) === 1 ? 84 : 68,
                      height:       isActive ? 102 : Math.abs(offset) === 1 ? 72 : 58,
                      borderRadius: isActive ? 14 : 10,
                      background:   isActive
                        ? `linear-gradient(145deg, ${cardAccent}28 0%, rgba(3,12,34,0.94) 100%)`
                        : "rgba(4,12,32,0.72)",
                      backdropFilter:       "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      /* active = PINK/MAGENTA border (matches reference) */
                      border: isActive
                        ? "2px solid rgba(168,85,247,0.85)"
                        : "1px solid rgba(6,182,212,0.20)",
                      boxShadow: isActive
                        ? "0 0 40px 10px rgba(168,85,247,0.55), 0 0 16px 4px rgba(168,85,247,0.40), inset 0 1px 0 rgba(255,255,255,0.10)"
                        : "inset 0 1px 0 rgba(255,255,255,0.04)",
                      transition: "width 0.3s, height 0.3s, border-radius 0.3s",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      style={{
                        width: "100%", height: "100%",
                        objectFit: "contain",
                        padding: isActive ? 9 : 6,
                        filter: isActive
                          ? `drop-shadow(0 0 14px rgba(168,85,247,0.8)) brightness(${brightness})`
                          : `brightness(${brightness})`,
                      }}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        img.style.display = "none";
                        const fb = img.nextElementSibling as HTMLElement | null;
                        if (fb) fb.style.display = "flex";
                      }}
                    />
                    <div style={{ display: "none", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontSize: isActive ? 24 : 16, opacity: brightness }}>
                      🚧
                    </div>

                    {/* shimmer sweep on active */}
                    {isActive && (
                      <motion.div
                        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                        animate={{ opacity: [0, 0.5, 0] }}
                        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 0.8 }}
                      >
                        <div style={{ width: "100%", height: "100%", background: "linear-gradient(130deg, transparent 28%, rgba(168,85,247,0.55) 55%, transparent 80%)" }} />
                      </motion.div>
                    )}

                    {/* top glow bar on active */}
                    {isActive && (
                      <div style={{
                        position: "absolute", top: 0, left: "8%", right: "8%",
                        height: 2, borderRadius: 2,
                        background: "rgba(168,85,247,1)",
                        boxShadow: "0 0 14px 3px rgba(168,85,247,0.80)",
                      }} />
                    )}
                  </div>

                  {isActive && (
                    <motion.p
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      style={{
                        marginTop: 4, fontSize: 9, fontWeight: 600,
                        color: "rgba(168,85,247,0.90)",
                        maxWidth: 112, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                        letterSpacing: "0.05em", textAlign: "center",
                      }}
                    >
                      {product.title}
                    </motion.p>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* ── navigation arrows ── */}
      <button
        onClick={prev}
        aria-label="הקודם"
        style={{
          position: "absolute", right: 3, top: "38%", transform: "translateY(-50%)",
          zIndex: 20, width: 36, height: 36, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(3,12,32,0.85)",
          border: `1.5px solid ${accent}55`,
          boxShadow: `0 0 16px ${accent}28`,
          cursor: "pointer", transition: "transform 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-50%) scale(1.12)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-50%) scale(1)"; }}
      >
        <ChevronRight size={15} color={accent} />
      </button>
      <button
        onClick={next}
        aria-label="הבא"
        style={{
          position: "absolute", left: 3, top: "38%", transform: "translateY(-50%)",
          zIndex: 20, width: 36, height: 36, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(3,12,32,0.85)",
          border: `1.5px solid ${accent}55`,
          boxShadow: `0 0 16px ${accent}28`,
          cursor: "pointer", transition: "transform 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-50%) scale(1.12)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-50%) scale(1)"; }}
      >
        <ChevronLeft size={15} color={accent} />
      </button>
    </div>
  );
}
