"use client";

import dynamic from "next/dynamic";

const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] w-full rounded-b-xl bg-navy-800/40 flex items-center justify-center">
      <p className="text-white/30 text-sm">טוען מפה...</p>
    </div>
  ),
});

export function ProjectMap() {
  return <MapInner />;
}
