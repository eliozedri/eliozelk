"use client";

import { useEffect, useState } from "react";
import { APIProvider, Map, Marker, InfoWindow } from "@vis.gl/react-google-maps";
import type { WorkOrder } from "@/types/workOrder";
import { STATUS_LABELS } from "@/types/workOrder";
import { getSlaColor, SLA_HEX, SLA_COLORS, formatWaitingDuration } from "@/lib/slaUtils";
import { extractCityCoordinates, ISRAEL_CENTER, ISRAEL_DEFAULT_ZOOM } from "@/lib/cityCoordinates";

function makeSvgIcon(fill: string, strokeColor: string, strokeWidth: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><circle cx='11' cy='11' r='9' fill='${fill}' stroke='${strokeColor}' stroke-width='${strokeWidth}'/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface MarkerData {
  order: WorkOrder;
  coords: [number, number];
}

interface IsraelMapGoogleProps {
  orders: WorkOrder[];
  onOpenOrder?: (id: string) => void;
}

export default function IsraelMapGoogle({ orders, onOpenOrder }: IsraelMapGoogleProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const positioned: MarkerData[] = orders
    .map((o) => {
      const coords = extractCityCoordinates(o.city || o.location || "");
      return coords ? { order: o, coords } : null;
    })
    .filter((x): x is MarkerData => x !== null);

  // Close info window if the selected order is no longer visible
  useEffect(() => {
    if (selectedId && !positioned.find((p) => p.order.id === selectedId)) {
      setSelectedId(null); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [positioned, selectedId]);

  const center = { lat: ISRAEL_CENTER[0], lng: ISRAEL_CENTER[1] };

  const selectedMarker = selectedId ? positioned.find((p) => p.order.id === selectedId) ?? null : null;

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        defaultCenter={center}
        defaultZoom={ISRAEL_DEFAULT_ZOOM}
        style={{ height: "100%", width: "100%" }}
        gestureHandling="greedy"
        disableDefaultUI={false}
      >
        {positioned.map(({ order, coords }) => {
          const slaColor = getSlaColor(order.readyForExecutionAt);
          const hex = SLA_HEX[slaColor];
          const isScheduled = !!order.scheduledDate;
          const strokeColor = isScheduled ? "#3b82f6" : "white";
          const strokeWidth = isScheduled ? 3 : 2;

          return (
            <Marker
              key={order.id}
              position={{ lat: coords[0], lng: coords[1] }}
              icon={{
                url: makeSvgIcon(hex, strokeColor, strokeWidth),
                scaledSize: new window.google.maps.Size(22, 22),
                anchor: new window.google.maps.Point(11, 11),
              }}
              onClick={() => setSelectedId(order.id)}
            />
          );
        })}

        {selectedMarker && (() => {
          const { order, coords } = selectedMarker;
          const slaColor = getSlaColor(order.readyForExecutionAt);
          const hex = SLA_HEX[slaColor];
          const slaInfo = SLA_COLORS[slaColor];
          const signCount = order.signRows.filter((r) => r.signNumber).length;
          const miscCount = order.miscRows.filter((r) => r.description).length;

          return (
            <InfoWindow
              position={{ lat: coords[0], lng: coords[1] }}
              onCloseClick={() => setSelectedId(null)}
              pixelOffset={[0, -14]}
            >
              <div dir="rtl" style={{ fontFamily: "Heebo, sans-serif", fontSize: "13px", lineHeight: 1.5, minWidth: "240px", maxWidth: "280px" }}>
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
                      <span style={{ color: hex }}>{formatWaitingDuration(order.readyForExecutionAt)}</span>
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
                        background: hex + "22",
                        color: hex,
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

                <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                  <a
                    href={`https://waze.com/ul?ll=${coords[0]},${coords[1]}&navigate=yes`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1, padding: "5px 8px", textAlign: "center",
                      background: "#05c3de", color: "white", borderRadius: "8px",
                      fontWeight: 700, fontSize: "11px", textDecoration: "none",
                    }}
                  >
                    Waze
                  </a>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${coords[0]},${coords[1]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1, padding: "5px 8px", textAlign: "center",
                      background: "#4285f4", color: "white", borderRadius: "8px",
                      fontWeight: 700, fontSize: "11px", textDecoration: "none",
                    }}
                  >
                    מפות
                  </a>
                  {onOpenOrder && (
                    <button
                      onClick={() => { setSelectedId(null); onOpenOrder(order.id); }}
                      style={{
                        flex: 2, padding: "5px 10px",
                        background: "#2563eb", color: "white",
                        border: "none", borderRadius: "8px",
                        fontWeight: 700, fontSize: "11px", cursor: "pointer",
                      }}
                    >
                      פתח הזמנה
                    </button>
                  )}
                </div>
              </div>
            </InfoWindow>
          );
        })()}
      </Map>
    </APIProvider>
  );
}
