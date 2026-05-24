"use client";

import { Store } from "lucide-react";

export function SalesHero({ sellableCount }: { sellableCount: number }) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950 px-6 py-12 md:px-10 md:py-16">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-ek-blue/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-ek-gold/20 blur-3xl" />
      <div className="relative max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur">
          <Store className="h-3.5 w-3.5 text-ek-gold" />
          קטלוג מכירה דיגיטלי
        </div>
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-white md:text-5xl">אתר מכירה</h1>
        <p className="mt-4 text-base leading-relaxed text-white/70 md:text-lg">
          נקודת הפתיחה לחוויית מכירה דיגיטלית פרימיום. כאן ינוהלו המוצרים שיוצגו וימכרו באתר —
          רק מוצרים פעילים מופיעים כמוכנים לפרסום.
        </p>
        <div className="mt-7 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-xl">
          <span className="text-3xl font-bold text-white">{sellableCount}</span>
          <span className="text-sm leading-tight text-white/60">
            מוצרים פעילים
            <br />
            מוכנים לפרסום
          </span>
        </div>
      </div>
    </header>
  );
}
