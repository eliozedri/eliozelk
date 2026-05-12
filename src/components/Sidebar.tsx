"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canAccessTab, canPerformAction, ROLE_LABELS } from "@/types/auth";
import type { TabId } from "@/types/auth";

const NAVY = "#0d1b2e";
const NAVY_MID = "#1a2d4a";
const EK_BLUE = "#1d6fd8";
const EK_GOLD = "#f59e0b";

function OrderIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
}
function TableIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /></svg>;
}
function CustomersIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
function GraphicsIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>;
}
function CatalogIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>;
}
function SafetyIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
}
function AccountingIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
}
function MapIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></svg>;
}
function CalendarIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
}
function CrewsIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><line x1="19" y1="8" x2="23" y2="8" /><line x1="21" y1="6" x2="21" y2="10" /></svg>;
}
function DiaryIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>;
}
function AccessIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="12" y1="9" x2="12" y2="15" /></svg>;
}
function LogoutIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
}

interface NavItem { tabId: TabId; href: string; label: string; icon: React.ReactNode; matchFn: (p: string) => boolean; }
interface NavSection { label: string; items: NavItem[]; }

const NAV_SECTIONS: NavSection[] = [
  {
    label: "ניהול",
    items: [
      { tabId: "dashboard", href: "/", label: "הזמנה", icon: <OrderIcon />, matchFn: (p) => p === "/" },
      { tabId: "orders", href: "/orders", label: "טבלת הזמנות", icon: <TableIcon />, matchFn: (p) => p.startsWith("/orders") },
      { tabId: "customers", href: "/customers", label: "לקוחות", icon: <CustomersIcon />, matchFn: (p) => p.startsWith("/customers") },
    ],
  },
  {
    label: "מחלקות",
    items: [
      { tabId: "graphics", href: "/graphics", label: "מחלקת גרפיקה", icon: <GraphicsIcon />, matchFn: (p) => p.startsWith("/graphics") },
      { tabId: "catalog", href: "/catalog", label: "מוצרים ושירותים", icon: <CatalogIcon />, matchFn: (p) => p.startsWith("/catalog") },
      { tabId: "safety", href: "/safety", label: "אביזרי בטיחות", icon: <SafetyIcon />, matchFn: (p) => p.startsWith("/safety") },
      { tabId: "accounting", href: "/accounting", label: "הנהלת חשבונות", icon: <AccountingIcon />, matchFn: (p) => p.startsWith("/accounting") },
    ],
  },
  {
    label: "בקרת שטח",
    items: [
      { tabId: "workmap", href: "/workmap", label: "מפת עבודות", icon: <MapIcon />, matchFn: (p) => p.startsWith("/workmap") },
      { tabId: "schedule", href: "/schedule", label: "סידור שבועי", icon: <CalendarIcon />, matchFn: (p) => p.startsWith("/schedule") },
      { tabId: "crews", href: "/crews", label: "צוותי שטח", icon: <CrewsIcon />, matchFn: (p) => p.startsWith("/crews") },
      { tabId: "work-diary", href: "/work-diary", label: "יומן עבודה", icon: <DiaryIcon />, matchFn: (p) => p.startsWith("/work-diary") },
    ],
  },
];

function SidebarLink({ href, label, active, icon, onClick }: { href: string; label: string; active: boolean; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick}
      style={active
        ? { backgroundColor: "rgba(255,255,255,0.10)", color: "#ffffff", fontWeight: 600, borderLeftColor: EK_GOLD, borderLeftWidth: 2, borderLeftStyle: "solid" }
        : { color: "rgba(255,255,255,0.55)", borderLeftColor: "transparent", borderLeftWidth: 2, borderLeftStyle: "solid" }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group hover:bg-white/10 hover:!text-white">
      <span style={{ color: active ? EK_GOLD : "rgba(255,255,255,0.35)" }} className="shrink-0 group-hover:!text-white/70 transition-colors">{icon}</span>
      <span className="truncate flex-1">{label}</span>
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <span className="block px-3 pt-4 pb-1 text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.25)" }}>{label}</span>;
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { profile, loading, logout } = useAuth();

  const showAll = loading || !profile;
  const canSeeTab = (tabId: TabId) => showAll || canAccessTab(profile!, tabId);
  const canManageAccess = showAll || canPerformAction(profile!, "manage_access");

  const handleNavClick = () => { onClose?.(); };

  return (
    <aside className="w-64 md:w-52 h-full min-h-screen flex flex-col shrink-0"
      style={{ backgroundColor: NAVY, borderLeft: `1px solid ${NAVY_MID}` }}>

      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg" style={{ backgroundColor: EK_BLUE }}>
            <span className="text-white font-black text-base leading-none select-none">א</span>
          </div>
          <div className="min-w-0">
            <div className="text-white font-black text-sm leading-tight tracking-tight">אלקיים</div>
            <div className="text-[10px] font-semibold leading-tight truncate" style={{ color: EK_GOLD }}>סימון כבישים בע״מ</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors p-1 rounded" aria-label="סגור תפריט">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col p-2.5 flex-1 overflow-y-auto">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => canSeeTab(item.tabId));
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.label}>
              <SectionLabel label={section.label} />
              {visibleItems.map((item) => (
                <SidebarLink key={item.tabId} href={item.href} label={item.label}
                  active={item.matchFn(pathname)} icon={item.icon} onClick={handleNavClick} />
              ))}
            </div>
          );
        })}

        {canManageAccess && (
          <>
            <SectionLabel label="מערכת" />
            <SidebarLink href="/access" label="הרשאות גישה" active={pathname.startsWith("/access")} icon={<AccessIcon />} onClick={handleNavClick} />
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3" style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }}>
        {profile && (
          <div className="mb-2">
            <p className="text-white text-xs font-semibold truncate">{profile.name}</p>
            <p className="text-[10px] truncate" style={{ color: EK_GOLD }}>{ROLE_LABELS[profile.role] ?? profile.role}</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-[9px] select-none" style={{ color: "rgba(255,255,255,0.15)" }}>מערכת פנימית · v1.0</p>
          <button onClick={logout} title="יציאה" className="flex items-center gap-1 text-[10px] transition-opacity hover:opacity-80" style={{ color: "rgba(255,255,255,0.35)" }}>
            <LogoutIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}
