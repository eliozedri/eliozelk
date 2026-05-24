"use client";

import { LayoutTemplate, Tags, PackageCheck, Eye, Settings2 } from "lucide-react";

const MODULES = [
  { label: "ניהול תצוגת אתר", Icon: LayoutTemplate },
  { label: "קטגוריות מכירה", Icon: Tags },
  { label: "מוצרים לפרסום", Icon: PackageCheck },
  { label: "תצוגה מקדימה", Icon: Eye },
  { label: "הגדרות אתר", Icon: Settings2 },
];

export function SalesFutureModules() {
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-white">מודולים עתידיים</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {MODULES.map(({ label, Icon }) => (
          <div
            key={label}
            aria-disabled
            className="relative cursor-not-allowed rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
          >
            <Icon className="h-6 w-6 text-white/40" />
            <div className="mt-4 text-sm font-medium text-white/70">{label}</div>
            <span className="mt-2 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">בקרוב</span>
          </div>
        ))}
      </div>
    </section>
  );
}
