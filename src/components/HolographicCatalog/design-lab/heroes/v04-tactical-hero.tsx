"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { catalogItemsToHoloProducts } from "../../data";
import type { HoloProduct } from "../../types";
import { useCatalogContext } from "@/context/CatalogContext";
import { HeroChrome } from "./HeroChrome";

/**
 * V04 hero — Tactical Field Equipment, polished.
 * Safety-orange + olive palette, crosshair targeting, GPS readouts, stencil monospace.
 * Polished: animated scanline + radar sweep, stock-health badge, due-soon highlighting,
 * recent-movements log, refined glass blocks, live clock, richer header chrome.
 */
const ORANGE = "#f97316";
const OLIVE  = "#3f4a2a";
const SAND   = "#e7e1cf";
const GREEN  = "#22c55e";
const AMBER  = "#f59e0b";
const RED    = "#ef4444";
const SPRING = { stiffness: 90, damping: 18, mass: 1 };

/* ============================================================ */
/* MAIN                                                         */
/* ============================================================ */

export function V04TacticalHero() {
  const { items } = useCatalogContext();
  // Live catalog (active items only) — no mock data, no fabricated inventory.
  const products = useMemo(
    () => catalogItemsToHoloProducts(items.filter((i) => i.isActive)),
    [items],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const product = products.find((p) => p.id === activeId) ?? products[0] ?? null;
  const idx = Math.max(0, products.findIndex((p) => p.id === product?.id));

  const stageRef = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, SPRING);
  const sy = useSpring(py, SPRING);
  const rY = useTransform(sx, [0, 1], [-6, 6]);
  const rX = useTransform(sy, [0, 1], [4, -4]);

  const prev = useCallback(() => {
    if (products.length === 0) return;
    setActiveId(products[(idx - 1 + products.length) % products.length].id);
  }, [idx, products]);
  const next = useCallback(() => {
    if (products.length === 0) return;
    setActiveId(products[(idx + 1) % products.length].id);
  }, [idx, products]);

  // keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next]);

  // Empty / loading — catalog not yet loaded or no active items.
  if (!product) {
    return (
      <div dir="rtl" style={{ width: "100%", height: "100vh", background: "#0a0b07", color: SAND, fontFamily: "'Menlo','JetBrains Mono','Consolas',monospace", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ fontSize: 48 }}>📦</div>
        <p style={{ color: ORANGE, fontSize: 13, letterSpacing: "0.2em", margin: 0 }}>טוען קטלוג…</p>
        <p style={{ color: SAND, opacity: 0.55, fontSize: 11, margin: 0 }}>אם אין פריטים פעילים, הוסף פריטים במסך הקטלוג.</p>
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
        background: "#0a0b07",
        color: SAND,
        fontFamily: "'Menlo','JetBrains Mono','Consolas',monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <HeroChrome label="V04 · Tactical Field Equipment" />

      <TacticalBackdrop />
      <TopHeader idx={idx} total={products.length} product={product} />

      <main
        style={{
          position: "relative",
          zIndex: 4,
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(240px, 280px) 1fr minmax(260px, 300px)",
          gap: 14,
          padding: "14px 16px 0",
          minHeight: 0,
        }}
      >
        {/* LEFT */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", scrollbarWidth: "thin" }}>
          <Block label="ASSET CLASS">
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.15 }}>
              {product.category}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: SAND, opacity: 0.75 }}>{product.title}</p>
          </Block>

          <Block label="DESCRIPTION">
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.65, color: SAND, opacity: 0.85 }}>
              {product.description}
            </p>
          </Block>

          <Block label="SPEC · OPERATIONAL">
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {product.specs.map((s) => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: `1px dashed ${OLIVE}` }}>
                  <span style={{ opacity: 0.65 }}>{s.label}</span>
                  <span style={{ fontWeight: 700, color: "#fff" }}>{s.value}</span>
                </div>
              ))}
            </div>
          </Block>

          {product.inventory?.recentMovement && (
            <Block label="LAST MOVEMENT">
              <MovementRow m={product.inventory.recentMovement} unit={product.unit} />
            </Block>
          )}
        </aside>

        {/* CENTER — targeting frame */}
        <section
          ref={stageRef}
          onPointerMove={(e) => {
            const r = stageRef.current?.getBoundingClientRect();
            if (!r) return;
            px.set((e.clientX - r.left) / r.width);
            py.set((e.clientY - r.top) / r.height);
          }}
          onPointerLeave={() => { px.set(0.5); py.set(0.5); }}
          style={{
            position: "relative",
            border: `1px dashed ${ORANGE}66`,
            background:
              "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(249,115,22,0.06), transparent 75%), rgba(15,18,10,0.30)",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          {/* tactical sub-grid inside target frame */}
          <div style={{ position: "absolute", inset: 0, opacity: 0.4, pointerEvents: "none",
            backgroundImage:
              "linear-gradient(rgba(231,225,207,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(231,225,207,0.04) 1px,transparent 1px)",
            backgroundSize: "20px 20px",
          }} />

          {/* radar sweep behind product */}
          <RadarSweep />

          {/* crosshair lines */}
          <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: `${ORANGE}44` }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: `${ORANGE}44` }} />
          {/* tick marks on crosshair */}
          {[20, 40, 60, 80].map((v) => (
            <span key={`v${v}`} style={{ position: "absolute", left: `${v}%`, top: "calc(50% - 4px)", width: 1, height: 8, background: `${ORANGE}88` }} />
          ))}
          {[20, 40, 60, 80].map((v) => (
            <span key={`h${v}`} style={{ position: "absolute", top: `${v}%`, left: "calc(50% - 4px)", width: 8, height: 1, background: `${ORANGE}88` }} />
          ))}

          {/* 4 corner brackets — animated */}
          <CornerBracket pos={{ top: 14, left: 14 }}   sides={["top","left"]} />
          <CornerBracket pos={{ top: 14, right: 14 }}  sides={["top","right"]} />
          <CornerBracket pos={{ bottom: 14, left: 14 }} sides={["bottom","left"]} />
          <CornerBracket pos={{ bottom: 14, right: 14 }} sides={["bottom","right"]} />

          {/* animated horizontal scanline */}
          <motion.div
            initial={{ top: "8%", opacity: 0 }}
            animate={{ top: ["8%","92%","8%"], opacity: [0, 0.9, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }}
            style={{
              position: "absolute", left: 14, right: 14, height: 2,
              background: `linear-gradient(to right, transparent, ${ORANGE}, transparent)`,
              boxShadow: `0 0 12px ${ORANGE}`,
              pointerEvents: "none",
            }}
          />

          {/* labels around target */}
          <span style={{ position: "absolute", top: 18, left: 52, fontSize: 10, color: ORANGE, letterSpacing: "0.18em", fontWeight: 700 }}>
            TGT · {product.id.toUpperCase()}
          </span>
          <span style={{ position: "absolute", top: 18, right: 52, fontSize: 10, color: ORANGE, letterSpacing: "0.18em", fontWeight: 700 }}>
            CLS · {String(product.category).slice(0, 16)}
          </span>
          <span style={{ position: "absolute", bottom: 18, left: 52, fontSize: 10, color: SAND, opacity: 0.7 }}>
            {product.specs[0]?.value}
          </span>
          <span style={{ position: "absolute", bottom: 18, right: 52, fontSize: 10, color: SAND, opacity: 0.7 }}>
            {product.specs[1]?.value}
          </span>

          {/* target-lock indicator */}
          <motion.div
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
              fontSize: 9, color: GREEN, letterSpacing: "0.3em",
              padding: "2px 10px", border: `1px solid ${GREEN}55`,
              background: "rgba(34,197,94,0.05)",
            }}
          >
            ● LOCK · ACQUIRED
          </motion.div>

          {/* product — pointer tilt + idle float */}
          <motion.div
            style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              rotateX: rX, rotateY: rY, transformStyle: "preserve-3d",
              perspective: 800,
              zIndex: 5,
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.78, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -20 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ProductGlyph product={product} />
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* range tick on right edge */}
          <div style={{ position: "absolute", right: 4, top: "10%", bottom: "10%", width: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", color: ORANGE, fontSize: 9, opacity: 0.85 }}>
            {["100","75","50","25","0"].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 6, height: 1, background: ORANGE }} />
                <span>{t}</span>
              </div>
            ))}
          </div>

          {/* range tick on left edge — kg / load */}
          <div style={{ position: "absolute", left: 4, top: "10%", bottom: "10%", width: 18, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", color: SAND, opacity: 0.55, fontSize: 9 }}>
            {["T","75","50","25","0"].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span>{t}</span>
                <span style={{ width: 6, height: 1, background: SAND }} />
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", scrollbarWidth: "thin" }}>
          {/* Inventory is not managed in the system yet — show the truth, never fabricate. */}
          <Block label="STOCK">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: SAND, opacity: 0.75 }} dir="rtl">לא מנוהל כרגע</span>
              <span style={{ fontSize: 10, color: SAND, opacity: 0.4 }}>N/A</span>
            </div>
          </Block>
          {product.inventory && (
            <StockHealthBadge inv={product.inventory} unit={product.unit} />
          )}

          <Block label="TARGET ID">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: ORANGE, letterSpacing: "0.16em" }}>
                EK·{product.id.toUpperCase()}
              </p>
              <span style={{ fontSize: 9, color: SAND, opacity: 0.5 }}>REV.04</span>
            </div>
            {product.tags[0] && (
              <p style={{ margin: "5px 0 0", fontSize: 10, color: SAND, opacity: 0.65, letterSpacing: "0.04em" }}>
                {product.tags[0]}
              </p>
            )}
          </Block>

          {product.inventory && (
            <Block label="STOCK · BREAKDOWN">
              <StockBreakdown inv={product.inventory} unit={product.unit} />
            </Block>
          )}

          {product.inventory?.reservations && product.inventory.reservations.length > 0 && (
            <Block label={`RESERVED · ${product.inventory.reservations.length} JOBS`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {product.inventory.reservations.map((r) => (
                  <ReservationCell key={r.orderId} r={r} unit={product.unit} />
                ))}
              </div>
            </Block>
          )}

          <Block label="OPS · STATUS">
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11 }}>
              <Row label="STATE"  value={<><Pulse color={ORANGE} /> ACQUIRED</>} valueColor={ORANGE} />
              <Row label="UNIT"   value={product.unit} />
              <Row label="LINK"   value={<><Pulse color={GREEN} /> SECURE</>}    valueColor={GREEN} />
              {product.inventory?.usagePerMonth !== undefined && (
                <Row label="USAGE/MO" value={`${product.inventory.usagePerMonth} ${product.unit}`} />
              )}
              {product.inventory?.nextReorder && (
                <Row label="REORDER" value={`${product.inventory.nextReorder.qty} · ${product.inventory.nextReorder.date.slice(5)}`} />
              )}
            </div>
          </Block>
        </aside>
      </main>

      {/* bottom — recent movements + carousel */}
      <footer style={{ position: "relative", zIndex: 5, padding: "10px 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 12 }}>
          <span style={{ fontSize: 10, color: ORANGE, letterSpacing: "0.18em" }}>
            EQUIPMENT MANIFEST · {products.length} UNITS
          </span>
          <span style={{ fontSize: 10, color: SAND, opacity: 0.5 }} dir="ltr">
            ←  ARROW KEYS · CLICK TO TARGET  →
          </span>
          <span style={{ fontSize: 10, color: SAND, opacity: 0.6 }}>
            SLOT {String(idx + 1).padStart(2, "0")} / {String(products.length).padStart(2, "0")}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <NavBtn onClick={prev} label="‹" />
          <div style={{ flex: 1, display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
            {products.map((p, i) => {
              const isActive = i === idx;
              const inv = p.inventory;
              const underMin = inv ? inv.total < inv.minimum : false;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  title={p.title}
                  style={{
                    flex: "0 0 96px", height: 70,
                    background: isActive ? "rgba(249,115,22,0.12)" : "rgba(15,18,10,0.7)",
                    border: isActive ? `2px solid ${ORANGE}` : `1px solid ${OLIVE}`,
                    position: "relative", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, color: SAND, padding: 0,
                    boxShadow: isActive ? `0 0 14px ${ORANGE}66, inset 0 0 16px rgba(249,115,22,0.10)` : "none",
                    transition: "all 0.18s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.borderColor = `${ORANGE}88`;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.borderColor = OLIVE;
                  }}
                >
                  <ProductGlyph product={p} size={32} />
                  <span style={{ position: "absolute", top: 2, right: 4, fontSize: 8, color: ORANGE, fontFamily: "monospace" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {inv && (
                    <span style={{
                      position: "absolute", bottom: 2, left: 4,
                      fontSize: 8, fontFamily: "monospace",
                      color: underMin ? RED : SAND, opacity: underMin ? 1 : 0.7,
                      fontWeight: underMin ? 700 : 400,
                    }}>
                      {underMin ? "⚠ " : ""}{inv.total}
                    </span>
                  )}
                  {isActive && (
                    <motion.span
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      style={{
                        position: "absolute", top: 0, left: "10%", right: "10%",
                        height: 2, background: ORANGE,
                        boxShadow: `0 0 8px ${ORANGE}`,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <NavBtn onClick={next} label="›" />
        </div>
      </footer>
    </div>
  );
}

/* ============================================================ */
/* SUB-COMPONENTS                                               */
/* ============================================================ */

function TacticalBackdrop() {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, opacity: 0.55, pointerEvents: "none", zIndex: 1,
        backgroundImage:
          "linear-gradient(rgba(231,225,207,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(231,225,207,0.05) 1px,transparent 1px)",
        backgroundSize: "32px 32px",
      }} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.10, pointerEvents: "none", zIndex: 1,
        background: "repeating-linear-gradient(0deg, rgba(231,225,207,0.18) 0 1px, transparent 1px 4px)",
      }} />
      {/* corner stencil hash */}
      {(["top-left","top-right","bottom-left","bottom-right"] as const).map((corner) => (
        <div key={corner} style={{
          position: "absolute",
          width: 64, height: 64,
          opacity: 0.35,
          background: `repeating-linear-gradient(45deg, ${ORANGE} 0 1px, transparent 1px 6px)`,
          pointerEvents: "none", zIndex: 1,
          ...(corner.startsWith("top")    ? { top: 56 }      : { bottom: 92 }),
          ...(corner.endsWith("left")     ? { left: 6 }       : { right: 6 }),
          maskImage: `linear-gradient(${cornerMaskAngle(corner)}, black, transparent)`,
          WebkitMaskImage: `linear-gradient(${cornerMaskAngle(corner)}, black, transparent)`,
        }} />
      ))}
    </>
  );
}
function cornerMaskAngle(c: "top-left"|"top-right"|"bottom-left"|"bottom-right") {
  return c === "top-left" ? "135deg" : c === "top-right" ? "-135deg" : c === "bottom-left" ? "45deg" : "-45deg";
}

function TopHeader({ idx, total, product }: { idx: number; total: number; product: HoloProduct }) {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const h = String(d.getUTCHours()).padStart(2, "0");
      const m = String(d.getUTCMinutes()).padStart(2, "0");
      const s = String(d.getUTCSeconds()).padStart(2, "0");
      setNow(`${h}:${m}:${s}Z`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      style={{
        position: "relative",
        zIndex: 5,
        height: 44,
        display: "flex",
        alignItems: "center",
        paddingInline: 16,
        gap: 14,
        fontSize: 10,
        background: "linear-gradient(180deg, #131410 0%, #1a1c14 100%)",
        borderBottom: `1px solid ${OLIVE}`,
      }}
    >
      {/* brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 24, height: 24, borderRadius: 4,
          background: `${ORANGE}22`, border: `1px solid ${ORANGE}`,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: ORANGE, fontWeight: 900, fontFamily: "system-ui",
        }}>א</span>
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ color: ORANGE, fontWeight: 700, letterSpacing: "0.22em", fontSize: 10 }}>ELKAYAM · TAC-OPS</div>
          <div style={{ color: SAND, opacity: 0.55, fontSize: 8, letterSpacing: "0.15em" }}>FIELD EQUIPMENT COMMAND</div>
        </div>
      </div>

      <span style={{ width: 1, height: 22, background: OLIVE }} />

      {/* operator + mission */}
      <span dir="ltr" style={{ color: SAND, opacity: 0.85 }}>OPR <b style={{ color: "#fff" }}>EZ-001</b></span>
      <span dir="ltr" style={{ color: SAND, opacity: 0.85 }}>MSN <b style={{ color: "#fff" }}>ROAD-26-05</b></span>

      <span style={{ width: 1, height: 22, background: OLIVE }} />

      {/* geo */}
      <span dir="ltr" style={{ color: SAND, opacity: 0.85 }}>GPS 32.0853°N · 34.7818°E</span>
      <span dir="ltr" style={{ color: SAND, opacity: 0.85 }}>HDG 047°</span>

      <span style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 14 }}>
        {/* signal bars */}
        <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 1 }}>
          {[3,5,7,9,11].map((h) => <span key={h} style={{ width: 2, height: h, background: GREEN, opacity: 0.85 }} />)}
        </span>
        <span dir="ltr" style={{ color: GREEN, fontWeight: 700, letterSpacing: "0.18em" }}>● LINK SECURE</span>
        <span dir="ltr" style={{ color: SAND, opacity: 0.85 }}>BAT 87%</span>
        <span dir="ltr" style={{ color: ORANGE, fontWeight: 700, letterSpacing: "0.2em", fontFamily: "monospace", minWidth: 80, textAlign: "right" }}>
          {now || "—"}
        </span>
        <span dir="ltr" style={{ color: SAND, opacity: 0.55 }}>
          SLOT {String(idx + 1).padStart(2, "0")}/{String(total).padStart(2, "0")} · {product.id.toUpperCase()}
        </span>
      </span>
    </header>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "10px 12px",
      border: `1px solid ${OLIVE}`,
      background: "linear-gradient(145deg, rgba(63,74,42,0.22) 0%, rgba(15,18,10,0.45) 100%)",
      boxShadow: "inset 0 1px 0 rgba(231,225,207,0.04)",
    }}>
      <p style={{ margin: "0 0 6px", fontSize: 9, color: ORANGE, letterSpacing: "0.22em", display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: SAND, opacity: 0.4 }}>▮</span>
      </p>
      {children}
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: `1px dashed ${OLIVE}` }}>
      <span style={{ opacity: 0.65 }}>{label}</span>
      <span style={{ fontWeight: 700, color: valueColor ?? "#fff", display: "inline-flex", alignItems: "center", gap: 4 }}>{value}</span>
    </div>
  );
}

function Pulse({ color }: { color: string }) {
  return (
    <motion.span
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

function NavBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 40, height: 70,
        border: `1px solid ${ORANGE}`,
        background: "rgba(249,115,22,0.10)",
        color: ORANGE, fontSize: 20, cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(249,115,22,0.22)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(249,115,22,0.10)"; }}
    >
      {label}
    </button>
  );
}

/* ============================================================ */
/* TARGETING                                                    */
/* ============================================================ */

function CornerBracket({ pos, sides }: { pos: React.CSSProperties; sides: ("top"|"bottom"|"left"|"right")[] }) {
  const s: React.CSSProperties = {
    position: "absolute",
    width: 28, height: 28,
    borderStyle: "solid", borderWidth: 0, borderColor: ORANGE,
    ...pos,
  };
  if (sides.includes("top"))    s.borderTopWidth = 3;
  if (sides.includes("bottom")) s.borderBottomWidth = 3;
  if (sides.includes("left"))   s.borderLeftWidth = 3;
  if (sides.includes("right"))  s.borderRightWidth = 3;
  return (
    <motion.div
      style={s}
      animate={{ opacity: [0.75, 1, 0.75] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function RadarSweep() {
  return (
    <div style={{ position: "absolute", inset: "10%", borderRadius: "50%", pointerEvents: "none", overflow: "hidden", opacity: 0.35 }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute", inset: 0,
          background: `conic-gradient(from 0deg, ${ORANGE} 0deg, transparent 60deg, transparent 360deg)`,
          mixBlendMode: "screen",
        }}
      />
      {/* concentric rings */}
      {[20, 40, 60, 80].map((p) => (
        <span key={p} style={{
          position: "absolute",
          inset: `${(100 - p) / 2}%`,
          borderRadius: "50%",
          border: `1px solid ${ORANGE}33`,
        }} />
      ))}
    </div>
  );
}

/* ============================================================ */
/* STOCK PANELS                                                 */
/* ============================================================ */

function StockHealthBadge({ inv, unit }: { inv: NonNullable<HoloProduct["inventory"]>; unit: string }) {
  const health = stockHealth(inv);
  const colors = {
    critical: { c: RED,    label: "CRITICAL · ACTION", icon: "⚠" },
    low:      { c: AMBER,  label: "LOW · MONITOR",     icon: "▲" },
    ok:       { c: GREEN,  label: "STOCK NOMINAL",     icon: "●" },
  } as const;
  const { c, label, icon } = colors[health];
  const daysLeft = inv.usagePerMonth ? Math.round((inv.available / inv.usagePerMonth) * 30) : null;

  return (
    <div style={{
      padding: "10px 12px",
      border: `1.5px solid ${c}`,
      background: `linear-gradient(145deg, ${c}18 0%, rgba(15,18,10,0.55) 100%)`,
      boxShadow: `0 0 18px ${c}33, inset 0 1px 0 rgba(255,255,255,0.04)`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: c, fontWeight: 800, letterSpacing: "0.18em", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Pulse color={c} />
          {icon} {label}
        </span>
        <span style={{ fontSize: 22, color: "#fff", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {inv.available}
          <span style={{ fontSize: 10, opacity: 0.6, marginInlineStart: 4 }}>{unit}</span>
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: SAND, opacity: 0.7, display: "flex", justifyContent: "space-between" }} dir="rtl">
        <span>זמין כעת</span>
        {daysLeft !== null && <span style={{ color: daysLeft < 14 ? AMBER : SAND, opacity: 1 }}>~{daysLeft} ימים</span>}
      </div>
    </div>
  );
}

function stockHealth(inv: NonNullable<HoloProduct["inventory"]>): "critical"|"low"|"ok" {
  if (inv.total < inv.minimum) return "critical";
  if (inv.available < inv.minimum * 0.8) return "low";
  return "ok";
}

function StockBreakdown({ inv, unit }: { inv: NonNullable<HoloProduct["inventory"]>; unit: string }) {
  const underMin = inv.total < inv.minimum;
  const pctTotalVsMin = Math.min(100, Math.round((inv.total / Math.max(1, inv.minimum)) * 100));

  const rows: { label: string; en: string; value: number; color: string }[] = [
    { label: "AVAIL",   en: "זמין",           value: inv.available,    color: GREEN },
    { label: "RESVD",   en: "שמור לעבודות",   value: inv.reserved,     color: ORANGE },
    { label: "PROD",    en: "בייצור",          value: inv.inProduction, color: "#a855f7" },
    { label: "TRANS",   en: "במשלוח",          value: inv.inTransit,    color: "#facc15" },
  ];

  return (
    <div>
      {/* total vs min meter */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: SAND, opacity: 0.7 }}>TOTAL · MIN {inv.minimum}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: underMin ? RED : "#fff", fontVariantNumeric: "tabular-nums" }}>
          {inv.total}
          <span style={{ fontSize: 10, opacity: 0.7, marginInlineStart: 4 }}>{unit}</span>
        </span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.05)", marginBottom: 8, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: `${pctTotalVsMin}%`, background: underMin ? RED : GREEN, boxShadow: `0 0 6px ${underMin ? RED : GREEN}` }} />
        <div style={{ position: "absolute", top: -2, bottom: -2, left: "100%", width: 1, background: SAND, opacity: 0.5 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
            <span style={{ flex: "0 0 44px", color: r.color, fontWeight: 700, letterSpacing: "0.1em" }}>{r.label}</span>
            <span style={{ flex: 1, color: SAND, opacity: 0.7 }} dir="rtl">{r.en}</span>
            <div style={{ flex: "0 0 70px", height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 1, overflow: "hidden", position: "relative" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pctV(r.value, inv.total)}%` }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                style={{ position: "absolute", top: 0, bottom: 0, left: 0, background: r.color, boxShadow: `0 0 4px ${r.color}` }}
              />
            </div>
            <span style={{ flex: "0 0 36px", textAlign: "left", color: "#fff", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
          </div>
        ))}
      </div>

      {underMin && (
        <div style={{ marginTop: 8, padding: "4px 8px", border: `1px solid ${RED}`, color: RED, fontSize: 9, textAlign: "center", letterSpacing: "0.18em", background: "rgba(239,68,68,0.10)" }}>
          ⚠ BELOW MINIMUM · REORDER REQUIRED
        </div>
      )}
    </div>
  );
}

function ReservationCell({ r, unit }: { r: NonNullable<HoloProduct["inventory"]>["reservations"] extends (infer U)[] | undefined ? U : never; unit: string }) {
  const days = r.due ? daysUntil(r.due) : null;
  const urgent = days !== null && days <= 3;
  const soon   = days !== null && days > 3 && days <= 7;
  const accent = urgent ? RED : soon ? AMBER : ORANGE;

  return (
    <div style={{
      padding: "7px 9px",
      border: `1px solid ${urgent ? RED : OLIVE}`,
      background: urgent ? "rgba(239,68,68,0.08)" : "rgba(15,18,10,0.50)",
      position: "relative",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{r.site ?? r.orderId}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>
          {r.qty}<span style={{ fontSize: 9, opacity: 0.7, marginInlineStart: 2 }}>{unit}</span>
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: SAND, opacity: 0.65, marginTop: 3 }}>
        <span dir="ltr">{r.orderId} · {r.customer ?? "—"}</span>
        {r.due && (
          <span style={{ color: urgent ? RED : soon ? AMBER : SAND, fontWeight: urgent || soon ? 700 : 400 }}>
            הספקה {r.due.slice(5)}{days !== null && ` · ${days >= 0 ? days : 0}י׳`}
          </span>
        )}
      </div>
      {urgent && (
        <div style={{ position: "absolute", top: 0, left: 0, width: 3, bottom: 0, background: RED, boxShadow: `0 0 8px ${RED}` }} />
      )}
    </div>
  );
}

function daysUntil(iso: string) {
  const d = new Date(iso + "T00:00:00").getTime();
  const now = new Date().getTime();
  return Math.round((d - now) / 86400000);
}

function MovementRow({ m, unit }: { m: NonNullable<NonNullable<HoloProduct["inventory"]>["recentMovement"]>; unit: string }) {
  const isIn = m.type === "in";
  const c = isIn ? GREEN : ORANGE;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: c, fontWeight: 700, fontSize: 14 }}>{isIn ? "↓" : "↑"}</span>
        <span style={{ color: "#fff", fontWeight: 700 }}>{m.qty}<span style={{ fontSize: 9, marginInlineStart: 2, opacity: 0.7 }}>{unit}</span></span>
        <span style={{ color: c, fontSize: 9, letterSpacing: "0.18em" }}>{isIn ? "IN" : "OUT"}</span>
      </span>
      <span style={{ fontSize: 10, color: SAND, opacity: 0.6 }} dir="ltr">{m.date} {m.ref ? `· ${m.ref}` : ""}</span>
    </div>
  );
}

function pctV(part: number, whole: number) {
  return whole ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}

/* ============================================================ */
/* PRODUCT GLYPH                                                */
/* ============================================================ */

function ProductGlyph({ product, size }: { product: HoloProduct; size?: number }) {
  const map: Record<string, string> = {
    "speed-bump": "🟨", "cat-eyes": "👁️", "cones": "🚧", "cone-sleeves": "🟧",
    "arrow-board": "➡️", "sign": "🛑", "jersey-barrier": "🟥",
    "marking-machine": "🛞", "thermoplastic": "🟧",
    "flashing-light": "🔆", "safety-rail": "🚂",
  };
  const glyph = map[product.id] ?? "📦";
  const px = size ?? 200;
  return (
    <div style={{
      fontSize: px,
      lineHeight: 1,
      filter: `drop-shadow(0 0 ${px / 6}px rgba(249,115,22,0.55)) drop-shadow(0 ${px / 10}px ${px / 4}px rgba(0,0,0,0.90))`,
    }}>{glyph}</div>
  );
}
