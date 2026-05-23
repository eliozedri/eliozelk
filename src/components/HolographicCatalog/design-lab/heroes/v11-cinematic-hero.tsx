"use client";

import { useState, useCallback, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { HOLO_PRODUCTS } from "../../data";
import type { HoloProduct } from "../../types";
import { HeroChrome } from "./HeroChrome";

/**
 * V11 hero — Cinematic Dark, full page.
 * Film-grade gradients, anamorphic lens flare, letterbox bars, huge editorial type.
 * Slim film-strip carousel at bottom.
 */
const SPRING = { stiffness: 90, damping: 20, mass: 1 };

export function V11CinematicHero() {
  const [activeId, setActiveId] = useState<string>(HOLO_PRODUCTS[0].id);
  const product = HOLO_PRODUCTS.find((p) => p.id === activeId) ?? HOLO_PRODUCTS[0];
  const idx = HOLO_PRODUCTS.findIndex((p) => p.id === activeId);

  const stageRef = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, SPRING);
  const sy = useSpring(py, SPRING);
  const rY = useTransform(sx, [0, 1], [-10, 10]);
  const rX = useTransform(sy, [0, 1], [6, -6]);

  const prev = useCallback(() => setActiveId(HOLO_PRODUCTS[(idx - 1 + HOLO_PRODUCTS.length) % HOLO_PRODUCTS.length].id), [idx]);
  const next = useCallback(() => setActiveId(HOLO_PRODUCTS[(idx + 1) % HOLO_PRODUCTS.length].id), [idx]);

  return (
    <div
      dir="rtl"
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: "#000",
        color: "#fff",
        fontFamily: "ui-sans-serif, system-ui",
      }}
    >
      <HeroChrome label="V11 · Cinematic Dark" />

      {/* film gradient backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 75% 65% at 62% 48%, #2b1a3e 0%, #0c0814 50%, #000 92%)" }} />

      {/* secondary cool flare bloom */}
      <div style={{ position: "absolute", top: "12%", left: "48%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle,rgba(167,139,250,0.20),transparent 65%)", filter: "blur(40px)" }} />

      {/* warm corner accent */}
      <div style={{ position: "absolute", bottom: "-10%", right: "-10%", width: 540, height: 540, borderRadius: "50%", background: "radial-gradient(circle,rgba(244,114,182,0.10),transparent 70%)", filter: "blur(60px)" }} />

      {/* anamorphic horizontal flare */}
      <div style={{ position: "absolute", top: "45%", left: "-10%", right: "-10%", height: 6, background: "linear-gradient(to right,transparent,rgba(120,189,255,0.5) 28%,rgba(120,189,255,0.95) 50%,rgba(120,189,255,0.5) 72%,transparent)", filter: "blur(5px)" }} />
      <div style={{ position: "absolute", top: "calc(45% - 1px)", left: "28%", right: "28%", height: 1, background: "rgba(255,255,255,0.85)", filter: "blur(1px)" }} />

      {/* film grain (subtle) */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.05, mixBlendMode: "overlay", backgroundImage: "radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "3px 3px", pointerEvents: "none" }} />

      {/* letterbox bars */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 44, background: "#000", zIndex: 5 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 44, background: "#000", zIndex: 5 }} />

      {/* film labels top */}
      <div dir="ltr" style={{ position: "absolute", top: 14, left: 200, right: 18, display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.55)", letterSpacing: "0.32em", zIndex: 6 }}>
        <span>ELKAYAM · OP/CINEMA</span>
        <span>REC ● 24FPS · 4K · ANAMORPHIC 2.39:1</span>
        <span>TC 01:14:08:22</span>
      </div>

      {/* stage — pointer tilt */}
      <div
        ref={stageRef}
        onPointerMove={(e) => {
          const r = stageRef.current?.getBoundingClientRect();
          if (!r) return;
          px.set((e.clientX - r.left) / r.width);
          py.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => { px.set(0.5); py.set(0.5); }}
        style={{ position: "absolute", top: 44, bottom: 196, left: 0, right: 0, zIndex: 3 }}
      >
        {/* product — off-axis, large */}
        <motion.div
          style={{
            position: "absolute",
            top: "8%",
            right: "8%",
            width: "52%",
            height: "82%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            rotateX: rX,
            rotateY: rY,
            transformStyle: "preserve-3d",
            zIndex: 4,
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={product.id}
              initial={{ opacity: 0, scale: 0.78, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -20 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
                <ProductGlyph product={product} />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* huge editorial title */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 60, paddingInline: "clamp(28px, 4vw, 60px)" }} dir="rtl">
          <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.45em", color: "rgba(255,255,255,0.42)", textTransform: "uppercase" }}>
            A · R · O · A · D · S · P · E · C
          </p>
          <AnimatePresence mode="wait">
            <motion.h1
              key={product.id + "-title"}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 14 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ margin: "8px 0 0", fontSize: "clamp(40px, 5vw, 78px)", fontWeight: 200, letterSpacing: "-0.025em", lineHeight: 0.96, color: "#fff", maxWidth: "62%" }}
            >
              {product.title}
            </motion.h1>
          </AnimatePresence>
        </div>

        {/* slim spec rail — left side */}
        <div dir="rtl" style={{ position: "absolute", top: "10%", left: "clamp(28px, 4vw, 60px)", width: 260, fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
          <p style={{ margin: 0, fontSize: 9, letterSpacing: "0.3em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
            {product.category}
          </p>
          <div style={{ marginTop: 14 }}>
            {product.specs.slice(0, 4).map((s) => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid rgba(255,255,255,0.10)" }}>
                <span style={{ opacity: 0.55 }}>{s.label}</span>
                <span style={{ fontWeight: 500 }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* inventory micro-readout — fits cinematic aesthetic */}
          {product.inventory && <CinemaInventory inv={product.inventory} unit={product.unit} />}
        </div>
      </div>

      {/* discreet operational readout strip — above carousel, fits letterbox */}
      {product.inventory && (
        <div style={{ position: "absolute", left: "clamp(28px, 4vw, 60px)", right: "clamp(28px, 4vw, 60px)", bottom: 196, zIndex: 5, display: "flex", gap: 22, alignItems: "center", justifyContent: "flex-end", paddingBottom: 8 }}>
          <ReadoutItem label="זמין"     value={product.inventory.available} unit={product.unit} dim />
          <Dot />
          <ReadoutItem label="שמור לעבודות" value={product.inventory.reserved} unit={product.unit} accent />
          <Dot />
          <ReadoutItem label="בייצור"   value={product.inventory.inProduction} unit={product.unit} dim />
          <Dot />
          <ReadoutItem label="במשלוח"   value={product.inventory.inTransit} unit={product.unit} dim />
          <Dot />
          <ReadoutItem label="מינימום"  value={product.inventory.minimum}    unit={product.unit} dim />
          {/* top reservation highlight, if any */}
          {product.inventory.reservations?.[0] && (
            <>
              <span style={{ flex: 1 }} />
              <div dir="rtl" style={{ textAlign: "right", color: "rgba(255,255,255,0.55)", fontSize: 10, lineHeight: 1.3 }}>
                <div style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontSize: 8, color: "rgba(255,255,255,0.35)" }}>הזמנה ראשית</div>
                <div style={{ color: "#fff", fontWeight: 500 }}>
                  {product.inventory.reservations[0].qty}{" "}{product.unit} · {product.inventory.reservations[0].site}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* film-strip carousel above bottom letterbox */}
      <footer style={{ position: "absolute", left: 0, right: 0, bottom: 44, height: 152, zIndex: 6, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingInline: "clamp(28px, 4vw, 60px)", paddingBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.5)", letterSpacing: "0.18em" }}>
          <span>SHOT {String(idx + 1).padStart(2, "0")} / {String(HOLO_PRODUCTS.length).padStart(2, "0")}</span>
          <span>FILM STRIP</span>
          <span>NEXT →</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NavArrow onClick={prev} dir="‹" />
          <div style={{ flex: 1, display: "flex", gap: 4, overflowX: "auto" }}>
            {HOLO_PRODUCTS.map((p, i) => {
              const isActive = i === idx;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  title={p.title}
                  style={{
                    flex: "0 0 96px", height: 78,
                    position: "relative",
                    background: "#0a0a0a",
                    border: isActive ? "2px solid rgba(255,255,255,0.85)" : "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 3,
                    cursor: "pointer",
                    padding: 0,
                    overflow: "hidden",
                    opacity: isActive ? 1 : 0.55,
                    transition: "opacity 0.2s",
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.opacity = "0.55"; }}
                >
                  {/* sprocket holes top/bottom — film strip detail */}
                  <div style={{ position: "absolute", top: 2, left: 0, right: 0, height: 6, display: "flex", justifyContent: "space-around" }}>
                    {[0, 1, 2, 3].map((k) => <span key={k} style={{ width: 4, height: 4, background: "#000", borderRadius: 1, border: "1px solid rgba(255,255,255,0.10)" }} />)}
                  </div>
                  <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, height: 6, display: "flex", justifyContent: "space-around" }}>
                    {[0, 1, 2, 3].map((k) => <span key={k} style={{ width: 4, height: 4, background: "#000", borderRadius: 1, border: "1px solid rgba(255,255,255,0.10)" }} />)}
                  </div>
                  <div style={{ position: "absolute", top: 10, bottom: 10, left: 4, right: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ProductGlyph product={p} size={34} />
                  </div>
                </button>
              );
            })}
          </div>
          <NavArrow onClick={next} dir="›" />
        </div>
      </footer>
    </div>
  );
}

function CinemaInventory({ inv, unit }: { inv: NonNullable<HoloProduct["inventory"]>; unit: string }) {
  return (
    <div style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "rgba(255,255,255,0.42)", textTransform: "uppercase" }}>מלאי כולל</span>
        <span style={{ fontSize: 36, fontWeight: 200, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{inv.total}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
        <CinemaLine label="זמין"        value={inv.available}    unit={unit} bar="#cbd5e1" pct={pctC(inv.available, inv.total)} />
        <CinemaLine label="שמור לעבודות" value={inv.reserved}     unit={unit} bar="#a78bfa" pct={pctC(inv.reserved, inv.total)} highlight />
        <CinemaLine label="בייצור"      value={inv.inProduction} unit={unit} bar="#94a3b8" pct={pctC(inv.inProduction, inv.total)} />
        <CinemaLine label="במשלוח"      value={inv.inTransit}    unit={unit} bar="#94a3b8" pct={pctC(inv.inTransit, inv.total)} />
      </div>
    </div>
  );
}

function CinemaLine({ label, value, unit, bar, pct, highlight }: { label: string; value: number; unit: string; bar: string; pct: number; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
      <span style={{ flex: "0 0 90px", color: highlight ? "#fff" : "rgba(255,255,255,0.55)", fontWeight: highlight ? 600 : 400 }}>{label}</span>
      <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: bar, opacity: highlight ? 0.95 : 0.55 }} />
      </div>
      <span style={{ flex: "0 0 50px", textAlign: "left", color: "#fff", fontWeight: highlight ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>
        {value}<span style={{ fontSize: 9, marginInlineStart: 3, opacity: 0.5 }}>{unit}</span>
      </span>
    </div>
  );
}

function ReadoutItem({ label, value, unit, accent, dim }: { label: string; value: number; unit: string; accent?: boolean; dim?: boolean }) {
  return (
    <div dir="rtl" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0 }}>
      <span style={{ fontSize: 8, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>{label}</span>
      <span style={{ fontSize: accent ? 18 : 14, fontWeight: accent ? 600 : 300, color: accent ? "#a78bfa" : dim ? "rgba(255,255,255,0.80)" : "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {value}<span style={{ fontSize: 9, marginInlineStart: 3, opacity: 0.5 }}>{unit}</span>
      </span>
    </div>
  );
}

function Dot() {
  return <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />;
}

function pctC(part: number, whole: number) { return whole ? Math.min(100, Math.round((part / whole) * 100)) : 0; }

function NavArrow({ onClick, dir }: { onClick: () => void; dir: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 36, height: 78,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.18)",
        color: "rgba(255,255,255,0.85)",
        fontSize: 20, cursor: "pointer", borderRadius: 3,
      }}
    >
      {dir}
    </button>
  );
}

function ProductGlyph({ product, size }: { product: HoloProduct; size?: number }) {
  const map: Record<string, string> = {
    "speed-bump": "🟨", "cat-eyes": "👁️", "cones": "🚧", "cone-sleeves": "🟧",
    "arrow-board": "➡️", "sign": "🛑", "jersey-barrier": "🟥",
    "marking-machine": "🛞", "thermoplastic": "🟧",
    "flashing-light": "🔆", "safety-rail": "🚂",
  };
  const glyph = map[product.id] ?? "📦";
  const px = size ?? 240;
  return (
    <div style={{
      fontSize: px,
      lineHeight: 1,
      filter: `drop-shadow(0 30px 50px rgba(0,0,0,0.85)) drop-shadow(0 0 ${px / 5}px rgba(167,139,250,0.45))`,
    }}>{glyph}</div>
  );
}
