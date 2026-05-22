"use client";

import { useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { HoloProduct } from "./types";

const SPRING = { stiffness: 110, damping: 20, mass: 0.9 };

interface Props { product: HoloProduct }

export function HolographicStage({ product }: Props) {
  const accent = product.accentColor ?? "#06b6d4";
  const containerRef = useRef<HTMLDivElement>(null);

  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const smoothX = useSpring(pointerX, SPRING);
  const smoothY = useSpring(pointerY, SPRING);
  const rotateY = useTransform(smoothX, [0, 1], [-6, 6]);
  const rotateX = useTransform(smoothY, [0, 1], [4, -4]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: "9%",
        userSelect: "none",
      }}
      onPointerMove={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        pointerX.set((e.clientX - rect.left) / rect.width);
        pointerY.set((e.clientY - rect.top)  / rect.height);
      }}
      onPointerLeave={() => { pointerX.set(0.5); pointerY.set(0.5); }}
    >
      {/* ── orbit rings ── */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 1 }}>
        <div className="holo-orbit holo-orbit-a" style={{ color: accent, width: "74%", height: "74%" }} />
        <div className="holo-orbit holo-orbit-b" style={{ width: "50%", height: "50%" }} />
      </div>

      {/* ── upward light beams from platform center ── */}
      {([
        { x:   0, h: "58%", w: 3, a: "cc", blur:  5, angle:  0 },
        { x: -42, h: "42%", w: 2, a: "66", blur:  9, angle: -8 },
        { x:  42, h: "42%", w: 2, a: "66", blur:  9, angle:  8 },
        { x: -20, h: "33%", w: 2, a: "44", blur: 11, angle: -4 },
        { x:  20, h: "33%", w: 2, a: "44", blur: 11, angle:  4 },
      ] as { x: number; h: string; w: number; a: string; blur: number; angle: number }[]).map((b, i) => (
        <div key={i} style={{
          position: "absolute",
          bottom: "6%",
          left: `calc(50% + ${b.x}px)`,
          width: b.w,
          height: b.h,
          background: `linear-gradient(to top, ${accent}${b.a} 0%, ${accent}33 55%, transparent 88%)`,
          filter: `blur(${b.blur}px)`,
          transform: `translateX(-50%) rotate(${b.angle}deg)`,
          transformOrigin: "bottom center",
          zIndex: 2,
          pointerEvents: "none",
        }} />
      ))}

      {/* ── floating product with pointer-driven 2.5D tilt ── */}
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d", position: "relative", zIndex: 10 }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={product.id}
            initial={{ opacity: 0, scale: 0.72, y: 50 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{ opacity: 0,   scale: 0.82,  y: -28 }}
            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* idle float */}
            <motion.div
              animate={{ y: [0, -15, 0] }}
              transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* perspective tilt to look 3-D like the reference */}
              <div style={{ perspective: "880px" }}>
                <div style={{ transform: "rotateX(15deg) rotateY(-12deg)", transformStyle: "preserve-3d" }}>

                  {/* shimmer sweep */}
                  <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 11 }}>
                    <motion.div
                      animate={{ x: ["-120%", "160%"] }}
                      transition={{ duration: 4.2, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                      style={{
                        position: "absolute", top: 0, bottom: 0, width: "45%",
                        background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`,
                      }}
                    />
                  </div>

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    style={{
                      width:  "clamp(300px, 42vw, 580px)",
                      height: "clamp(240px, 30vw, 460px)",
                      objectFit: "contain",
                      display: "block",
                      filter: [
                        `drop-shadow(0 0 80px ${accent}cc)`,
                        `drop-shadow(0 0 40px ${accent}99)`,
                        `drop-shadow(0 0 18px ${accent}66)`,
                        "drop-shadow(0 36px 54px rgba(0,0,0,0.90))",
                      ].join(" "),
                    }}
                    onError={(e) => {
                      const img = e.currentTarget as HTMLImageElement;
                      img.style.display = "none";
                      const fb = img.nextElementSibling as HTMLElement | null;
                      if (fb) fb.style.display = "flex";
                    }}
                  />

                  {/* fallback */}
                  <div style={{
                    display: "none",
                    width:  "clamp(300px, 42vw, 580px)",
                    height: "clamp(240px, 30vw, 460px)",
                    flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
                    filter: `drop-shadow(0 0 40px ${accent}66)`,
                  }}>
                    <div style={{ fontSize: "clamp(72px, 11vw, 130px)", lineHeight: 1 }}>🚧</div>
                    <p style={{ color: `${accent}99`, fontSize: 11, fontFamily: "monospace", letterSpacing: "0.12em", textAlign: "center" }}>{product.title}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* ── holographic platform (elliptical disc) ── */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width:  "clamp(270px, 60%, 520px)",
        height: "clamp(78px, 14vh, 140px)",
        zIndex: 5,
        pointerEvents: "none",
      }}>
        {/* soft glowing surface fill */}
        <div style={{
          position: "absolute",
          inset: "6% 0",
          borderRadius: "50%",
          background: `radial-gradient(ellipse 86% 64% at 50% 56%, ${accent}44 0%, ${accent}22 40%, ${accent}08 68%, transparent 84%)`,
          filter: "blur(5px)",
        }} />

        {/* bright center floor spot */}
        <div style={{
          position: "absolute",
          bottom: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width:  "clamp(90px, 22%, 165px)",
          height: "clamp(26px,  5vh,  52px)",
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${accent}ee 0%, ${accent}77 38%, transparent 72%)`,
          filter: "blur(4px)",
        }} />

        {/* main cyan ellipse ring */}
        <div style={{
          position: "absolute",
          inset: "5% 0",
          borderRadius: "50%",
          border: `2.5px solid ${accent}dd`,
          boxShadow: `0 0 24px 6px ${accent}66, 0 0 8px 2px ${accent}99, inset 0 0 26px ${accent}22`,
        }} />

        {/* magenta secondary ring */}
        <div style={{
          position: "absolute",
          inset: "18% 14%",
          borderRadius: "50%",
          border: "1.5px solid rgba(168,85,247,0.62)",
          boxShadow: "0 0 16px 3px rgba(168,85,247,0.28)",
        }} />
      </div>
    </div>
  );
}
