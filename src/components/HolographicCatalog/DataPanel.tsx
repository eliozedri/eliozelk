"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { HoloProduct } from "./types";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:   { label: "פעיל",       color: "#22c55e" },
  inactive: { label: "לא פעיל",    color: "#94a3b8" },
  limited:  { label: "מלאי מוגבל", color: "#f59e0b" },
};

function GlassPanel({
  children,
  style = {},
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: "1px solid rgba(6,182,212,0.28)",
        background: "linear-gradient(145deg, rgba(5,18,52,0.84) 0%, rgba(3,10,28,0.90) 100%)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: [
          "0 8px 48px rgba(0,0,0,0.65)",
          "inset 0 1px 0 rgba(255,255,255,0.09)",
          "inset 0 -1px 0 rgba(6,182,212,0.08)",
          "0 0 0 1px rgba(6,182,212,0.06)",
        ].join(", "),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(6,182,212,0.14)", margin: "10px 0" }} />;
}

/* Spinning ring status indicator */
function SpinRing({ color }: { color: string }) {
  return (
    <span
      className="holo-status-ring"
      style={{ color, borderTopColor: color, borderLeftColor: color, borderBottomColor: color }}
    />
  );
}

interface LeftPanelProps { product: HoloProduct }

export function LeftPanel({ product }: LeftPanelProps) {
  const accent = product.accentColor ?? "#06b6d4";
  const status = STATUS_LABELS[product.status] ?? STATUS_LABELS.active;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={product.id + "-left"}
        initial={{ opacity: 0, x: -22 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -14 }}
        transition={{ duration: 0.40, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        {/* upper: description card */}
        <GlassPanel style={{
          padding: "14px 16px",
          transform: "perspective(900px) rotateY(8deg) rotateX(-2deg)",
          boxShadow: [
            "0 8px 48px rgba(0,0,0,0.65)",
            "inset 0 1px 0 rgba(255,255,255,0.09)",
            `0 0 28px ${accent}18`,
          ].join(", "),
        }}>
          {/* product title as heading — matches reference's bold upper-left title */}
          <h3 style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "clamp(13px, 1.2vw, 17px)",
            lineHeight: 1.25,
            margin: "0 0 6px 0",
          }}>
            {product.title}
          </h3>
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.16em", textTransform: "uppercase", color: `${accent}99`, marginBottom: 8 }}>
            תיאור תפעולי
          </p>
          <Divider />
          <p style={{ color: "rgba(255,255,255,0.66)", fontSize: 11, lineHeight: 1.75, margin: 0 }}>
            {product.description}
          </p>

          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <SpinRing color={status.color} />
              <span style={{ fontSize: 10, color: status.color, fontWeight: 600 }}>{status.label}</span>
            </div>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", fontFamily: "monospace" }}>כפעולה</span>
          </div>
        </GlassPanel>

        {/* lower: specs card */}
        <GlassPanel style={{
          padding: "14px 16px",
          transform: "perspective(900px) rotateY(8deg) rotateX(2deg)",
          boxShadow: [
            "0 8px 48px rgba(0,0,0,0.65)",
            "inset 0 1px 0 rgba(255,255,255,0.09)",
            `0 0 24px ${accent}14`,
          ].join(", "),
        }}>
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.16em", textTransform: "uppercase", color: `${accent}99`, marginBottom: 8 }}>
            מפרט טכני
          </p>
          <Divider />
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
            {product.specs.map((s) => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.36)" }}>{s.label}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.82)", fontWeight: 600 }}>{s.value}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <SpinRing color={accent} />
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", fontFamily: "monospace" }}>כפעולה</span>
          </div>
        </GlassPanel>
      </motion.div>
    </AnimatePresence>
  );
}

interface RightPanelProps { product: HoloProduct }

export function RightPanel({ product }: RightPanelProps) {
  const accent = product.accentColor ?? "#06b6d4";
  const status = STATUS_LABELS[product.status] ?? STATUS_LABELS.active;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={product.id + "-right"}
        initial={{ opacity: 0, x: 22 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 14 }}
        transition={{ duration: 0.40, ease: [0.22, 1, 0.36, 1] }}
      >
        <GlassPanel style={{
          padding: "18px 20px",
          transform: "perspective(900px) rotateY(-8deg) rotateX(-1deg)",
          boxShadow: [
            "0 8px 48px rgba(0,0,0,0.65)",
            "inset 0 1px 0 rgba(255,255,255,0.09)",
            `0 0 32px ${accent}1a`,
          ].join(", "),
        }}>

          {/* title block */}
          <div style={{ marginBottom: 10 }}>
            <h3 style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "clamp(14px, 1.4vw, 20px)",
              lineHeight: 1.2,
              margin: "0 0 3px 0",
            }}>
              {product.title}
            </h3>
            <p style={{ color: "rgba(255,255,255,0.36)", fontSize: 11, margin: 0 }}>
              {product.category}
            </p>
          </div>

          {/* prominent badge — like "Advanced Marking Solutions" in the reference */}
          {product.tags[0] && (
            <div style={{ marginBottom: 12 }}>
              <span style={{
                display: "inline-block",
                fontSize: 10,
                padding: "4px 14px",
                borderRadius: 999,
                border: `1.5px solid ${accent}88`,
                color: accent,
                background: `${accent}18`,
                letterSpacing: "0.06em",
                fontWeight: 700,
                boxShadow: `0 0 14px ${accent}22`,
              }}>
                {product.tags[0]}
              </span>
            </div>
          )}

          <Divider />

          {/* status row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <SpinRing color={status.color} />
            <span style={{ fontSize: 10, color: status.color, fontWeight: 600 }}>{status.label}</span>
            <span style={{ marginRight: "auto", fontSize: 9, color: "rgba(255,255,255,0.20)", fontFamily: "monospace" }}>כפעולה</span>
          </div>

          {/* unit + availability */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.36)" }}>יחידת מידה</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.80)", fontWeight: 600 }}>{product.unit}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.36)" }}>זמינות</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.80)", fontWeight: 600 }}>{product.inventoryLabel}</span>
            </div>
            {/* extra specs rows */}
            {product.specs.slice(0, 2).map((s) => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.36)" }}>{s.label}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.80)", fontWeight: 600 }}>{s.value}</span>
              </div>
            ))}
          </div>

          <Divider />

          {/* INVENTORY BREAKDOWN — richer per-product stock view */}
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.16em", textTransform: "uppercase", color: `${accent}99`, marginBottom: 8 }}>
            פירוט מלאי
          </p>
          {product.inventory ? (
            <InventoryBreakdown inv={product.inventory} accent={accent} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {product.metrics.map((m) => (
                <MetricCell key={m.label} label={m.label} value={m.value} accent={accent} />
              ))}
            </div>
          )}

          {/* ACTIVE RESERVATIONS — visible operational data */}
          {product.inventory?.reservations && product.inventory.reservations.length > 0 && (
            <>
              <Divider />
              <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.16em", textTransform: "uppercase", color: `${accent}99`, marginBottom: 8 }}>
                שמור לעבודות פעילות
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {product.inventory.reservations.slice(0, 3).map((r) => (
                  <div
                    key={r.orderId}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 8,
                      border: `1px solid ${accent}22`,
                      background: "rgba(255,255,255,0.03)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{r.site ?? r.orderId}</span>
                      <span style={{ fontSize: 12, color: accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {r.qty}
                        <span style={{ fontSize: 8, marginInlineStart: 3, opacity: 0.6 }}>{product.unit}</span>
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.45)" }}>
                      <span style={{ fontFamily: "monospace" }}>{r.orderId}</span>
                      {r.due && <span>הספקה {r.due.slice(5)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </GlassPanel>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── small reusable inventory primitives ─────────────────────────── */

function MetricCell({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${accent}18`,
        background: `${accent}0a`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        alignItems: "flex-end",
      }}
    >
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.36)" }}>{label}</span>
      <strong style={{ fontSize: 17, color: "#fff", fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </strong>
    </div>
  );
}

function InventoryBreakdown({
  inv,
  accent,
}: {
  inv: NonNullable<HoloProduct["inventory"]>;
  accent: string;
}) {
  const lines: { label: string; value: number; color: string; pct: number }[] = [
    { label: "זמין",      value: inv.available,    color: "#22c55e", pct: pct(inv.available, inv.total) },
    { label: "שמור לעבודות", value: inv.reserved,  color: accent,    pct: pct(inv.reserved, inv.total) },
    { label: "בייצור",   value: inv.inProduction, color: "#a855f7", pct: pct(inv.inProduction, inv.total) },
    { label: "במשלוח",   value: inv.inTransit,    color: "#f59e0b", pct: pct(inv.inTransit, inv.total) },
  ];
  const underMin = inv.total < inv.minimum;
  return (
    <>
      {/* total + minimum line */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
          סה״כ במלאי · מינ׳ {inv.minimum}
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, color: underMin ? "#ef4444" : "#fff", fontVariantNumeric: "tabular-nums" }}>
          {inv.total}
        </span>
      </div>
      {/* stacked breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {lines.map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", flex: "0 0 84px" }}>{l.label}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, width: `${l.pct}%`, background: l.color, boxShadow: `0 0 6px ${l.color}80` }} />
            </div>
            <span style={{ fontSize: 11, color: "#fff", fontWeight: 700, fontVariantNumeric: "tabular-nums", flex: "0 0 32px", textAlign: "left" }}>
              {l.value}
            </span>
          </div>
        ))}
      </div>
      {/* footer line */}
      {inv.usagePerMonth !== undefined && (
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.42)" }}>
          <span>קצב חודשי · {inv.usagePerMonth}</span>
          {inv.nextReorder && (
            <span>הזמנה הבאה · {inv.nextReorder.qty} · {inv.nextReorder.date.slice(5)}</span>
          )}
        </div>
      )}
    </>
  );
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}
