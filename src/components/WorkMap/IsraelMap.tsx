"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { WorkOrder } from "@/types/workOrder";
import { STATUS_LABELS } from "@/types/workOrder";
import { getSlaColor, SLA_HEX, SLA_COLORS, formatWaitingDuration } from "@/lib/slaUtils";
import { extractCityCoordinates, ISRAEL_CENTER, ISRAEL_DEFAULT_ZOOM } from "@/lib/cityCoordinates";

function createSlaMarkerIcon(color: string, isScheduled: boolean) {
  const border = isScheduled ? "#3b82f6" : "white";
  const borderWidth = isScheduled ? "3px" : "2.5px";
  return L.divIcon({
    className: "",
    html: `<div style="
      width:22px;height:22px;
      background:${color};
      border:${borderWidth} solid ${border};
      border-radius:50%;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

function FitBoundsOnOrders({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 12);
      return;
    }
    map.fitBounds(positions, { padding: [40, 40] });
  }, [map, positions]);
  return null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface IsraelMapProps {
  orders: WorkOrder[];
  onOpenOrder?: (id: string) => void;
}

export default function IsraelMap({ orders, onOpenOrder }: IsraelMapProps) {
  const positioned = orders
    .map((o) => {
      const coords = extractCityCoordinates(o.city || o.location);
      return coords ? { order: o, coords } : null;
    })
    .filter((x): x is { order: WorkOrder; coords: [number, number] } => x !== null);

  const positions = positioned.map((p) => p.coords);

  return (
    <MapContainer
      center={ISRAEL_CENTER}
      zoom={ISRAEL_DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%" }}
      className="rounded-xl"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FitBoundsOnOrders positions={positions} />
      {positioned.map(({ order, coords }) => {
        const slaColor = getSlaColor(order.readyForExecutionAt);
        const hexColor = SLA_HEX[slaColor];
        const slaInfo = SLA_COLORS[slaColor];
        const isScheduled = !!order.scheduledDate;
        const signCount = order.signRows.filter((r) => r.signNumber).length;
        const miscCount = order.miscRows.filter((r) => r.description).length;

        return (
          <Marker
            key={order.id}
            position={coords}
            icon={createSlaMarkerIcon(hexColor, isScheduled)}
          >
            <Popup minWidth={240} maxWidth={280}>
              <div dir="rtl" style={{ fontFamily: "Heebo, sans-serif", fontSize: "13px", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px", color: "#111" }}>
                  {order.orderNumber}
                </div>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "8px" }}>
                  {order.customer || "—"} · {order.location || "—"}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "8px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "#aaa" }}>סטטוס הזמנה</div>
                    <div style={{ fontWeight: 600, color: "#333", fontSize: "11px" }}>{STATUS_LABELS[order.status]}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#aaa" }}>ממתין</div>
                    <div style={{ fontWeight: 600, fontSize: "11px" }}>
                      <span style={{ color: hexColor }}>{formatWaitingDuration(order.readyForExecutionAt)}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#aaa" }}>סטטוס SLA</div>
                    <div>
                      <span style={{
                        display: "inline-block",
                        padding: "1px 6px",
                        borderRadius: "99px",
                        fontSize: "10px",
                        fontWeight: 600,
                        background: hexColor + "22",
                        color: hexColor,
                      }}>{slaInfo.label}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#aaa" }}>זמן ביצוע משוער</div>
                    <div style={{ fontWeight: 600, color: "#333", fontSize: "11px" }}>
                      {order.estimatedExecutionHours ? `${order.estimatedExecutionHours} שע׳` : "לא הוזן"}
                    </div>
                  </div>
                  {order.scheduledDate && (
                    <div>
                      <div style={{ fontSize: "10px", color: "#aaa" }}>תאריך מתוכנן</div>
                      <div style={{ fontWeight: 600, color: "#3b82f6", fontSize: "11px" }}>{formatDate(order.scheduledDate)}</div>
                    </div>
                  )}
                  {signCount + miscCount > 0 && (
                    <div>
                      <div style={{ fontSize: "10px", color: "#aaa" }}>פריטים</div>
                      <div style={{ fontWeight: 600, color: "#333", fontSize: "11px" }}>
                        {[signCount > 0 && `${signCount} תמרורים`, miscCount > 0 && `${miscCount} שונות`].filter(Boolean).join(" + ")}
                      </div>
                    </div>
                  )}
                </div>

                {onOpenOrder && (
                  <button
                    onClick={() => onOpenOrder(order.id)}
                    style={{
                      width: "100%",
                      padding: "6px 12px",
                      background: "#2563eb",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: "pointer",
                      marginTop: "4px",
                    }}
                  >
                    פתח הזמנה
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
