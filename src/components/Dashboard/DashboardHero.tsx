"use client";

import Link from "next/link";

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function todayLabel(): string {
  return new Date().toLocaleDateString("he-IL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export function DashboardHero() {
  return (
    <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #05111f 0%, #0d1b2e 55%, #1a2d4a 100%)" }}>
      <div className="pointer-events-none absolute -top-24 right-1/4 w-[480px] h-[480px] rounded-full" style={{ background: "radial-gradient(circle, rgba(34,211,238,0.16), transparent 60%)", filter: "blur(20px)" }} />
      <div className="relative px-6 pt-14 pb-6 md:pt-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-ek-gold text-[9px] font-bold uppercase tracking-[0.25em] mb-2 opacity-80">
              ELKAYAM CONTROL CENTER
            </p>
            <h1 className="text-3xl font-black text-white leading-tight tracking-tight">
              מרכז שליטה אלקיים
            </h1>
            <p className="text-white/40 text-sm mt-1.5">{todayLabel()} · תמונת מצב תפעולית</p>
          </div>
          {/* ml-14 keeps these buttons clear of the fixed notification bell (top-left) */}
          <div className="flex items-center gap-2 flex-wrap ml-14">
            <Link
              href="/new-order"
              className="btn-glow text-sm"
            >
              <PlusIcon />
              הזמנה חדשה
            </Link>
            <Link
              href="/work-diary"
              className="btn-glow text-sm"
            >
              <PlusIcon />
              יומן חדש
            </Link>
            <Link
              href="/orders"
              className="btn-glass text-sm"
            >
              כל ההזמנות
            </Link>
          </div>
        </div>
        <div className="mt-5 h-px" style={{ background: "linear-gradient(to left, transparent, rgba(245,158,11,0.4), transparent)" }} />
      </div>
    </div>
  );
}
