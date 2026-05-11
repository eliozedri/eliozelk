"use client";

import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function MapInner() {
  return (
    <MapContainer
      center={[31.5, 34.85]}
      zoom={7}
      scrollWheelZoom={false}
      zoomControl={true}
      style={{ height: "280px", width: "100%", borderRadius: "0 0 0.75rem 0.75rem" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
    </MapContainer>
  );
}
