"use client";

import { CheckCircle2, EyeOff, Clock } from "lucide-react";
import { SalesGlassPanel } from "./SalesGlassPanel";

export function SalesStatsCards({
  sellable,
  hidden,
  awaitingReview,
}: {
  sellable: number;
  hidden: number;
  awaitingReview: number;
}) {
  const stats = [
    { label: "מוכנים לפרסום", value: sellable, Icon: CheckCircle2, accent: "text-emerald-300", ring: "ring-emerald-400/20" },
    { label: "לא יופיעו באתר", value: hidden, Icon: EyeOff, accent: "text-white/50", ring: "ring-white/10" },
    { label: "ממתינים לבדיקה", value: awaitingReview, Icon: Clock, accent: "text-amber-300", ring: "ring-amber-400/20" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map(({ label, value, Icon, accent, ring }) => (
        <SalesGlassPanel key={label} className={`p-5 ring-1 ${ring}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">{label}</span>
            <Icon className={`h-5 w-5 ${accent}`} />
          </div>
          <div className={`mt-3 text-3xl font-bold ${accent}`}>{value}</div>
        </SalesGlassPanel>
      ))}
    </div>
  );
}
