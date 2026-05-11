"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function DashboardIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function OrderIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function CustomersIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function GraphicsIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
    </svg>
  );
}

function CatalogIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function AccountingIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CrewsIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <line x1="19" y1="8" x2="23" y2="8" />
      <line x1="21" y1="6" x2="21" y2="10" />
    </svg>
  );
}

interface SidebarLinkProps {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
  badge?: number;
}

function SidebarLink({ href, label, active, icon, badge }: SidebarLinkProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group ${
        active
          ? "bg-white/10 text-white font-semibold border-l-2 border-ek-gold"
          : "text-white/55 hover:text-white hover:bg-white/6 border-l-2 border-transparent"
      }`}
    >
      <span className={`shrink-0 transition-colors ${active ? "text-ek-gold" : "text-white/40 group-hover:text-white/70"}`}>
        {icon}
      </span>
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-ek-gold text-navy-900 leading-none">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <span className="block px-3 pt-4 pb-1 text-[9px] font-bold text-white/25 uppercase tracking-[0.15em]">
      {label}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 min-h-screen bg-navy-900 flex flex-col shrink-0 no-print border-l border-navy-800">
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-ek-blue flex items-center justify-center shrink-0 shadow-lg">
            <span className="text-white font-black text-base leading-none select-none">א</span>
          </div>
          <div className="min-w-0">
            <div className="text-white font-black text-sm leading-tight tracking-tight">אלקיים</div>
            <div className="text-ek-gold text-[10px] font-semibold leading-tight opacity-90 truncate">
              סימון כבישים בע״מ
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-3">
        <SidebarLink href="/" label="הזמנה" active={pathname === "/"} icon={<OrderIcon />} />
        <SidebarLink href="/customers" label="לקוחות" active={pathname.startsWith("/customers")} icon={<CustomersIcon />} />
        <SidebarLink href="/graphics" label="מחלקת גרפיקה" active={pathname.startsWith("/graphics")} icon={<GraphicsIcon />} />
        <SidebarLink href="/orders" label="טבלת הזמנות" active={pathname.startsWith("/orders")} icon={<TableIcon />} />
        <SidebarLink href="/catalog" label="מוצרים ושירותים" active={pathname.startsWith("/catalog")} icon={<CatalogIcon />} />
        <SidebarLink href="/accounting" label="הנהלת חשבונות" active={pathname.startsWith("/accounting")} icon={<AccountingIcon />} />

        <div className="my-2 border-t border-gray-100" />

        <div className="px-3 py-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">בקרת שטח</span>
        </div>
        <SidebarLink href="/workmap" label="מפת עבודות" active={pathname.startsWith("/workmap")} icon={<MapIcon />} />
        <SidebarLink href="/schedule" label="סידור שבועי" active={pathname.startsWith("/schedule")} icon={<CalendarIcon />} />
        <SidebarLink href="/crews" label="צוותי שטח" active={pathname.startsWith("/crews")} icon={<CrewsIcon />} />
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/6">
        <p className="text-[9px] text-white/15 select-none">מערכת פנימית · אלקיים v1.0</p>
      </div>
    </aside>
  );
}
