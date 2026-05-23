"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileText, Table2, LayoutDashboard, Users, Palette, Wrench,
  Database, ShieldCheck, Warehouse, DollarSign, Map, Calendar,
  UsersRound, BookOpen, TrendingUp, Bot, Settings, ShieldPlus,
  LogOut, X, Cable, ScanLine, ScanText, LayoutGrid, Layers,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { canAccessTab, canPerformAction, ROLE_LABELS } from "@/types/auth";
import type { TabId } from "@/types/auth";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigationGuard } from "@/context/NavigationGuardContext";

const NAVY = "#0d1b2e";
const NAVY_MID = "#1a2d4a";
const EK_BLUE = "#1d6fd8";
const EK_GOLD = "#f59e0b";

function NavBadge({ count, variant = "amber" }: { count: number; variant?: "amber" | "red" | "blue" | "teal" }) {
  if (count === 0) return null;
  const styles: Record<string, { bg: string; text: string }> = {
    amber: { bg: "rgba(245,158,11,0.25)", text: "#fbbf24" },
    red:   { bg: "rgba(239,68,68,0.25)",  text: "#f87171" },
    blue:  { bg: "rgba(59,130,246,0.25)", text: "#93c5fd" },
    teal:  { bg: "rgba(20,184,166,0.25)", text: "#5eead4" },
  };
  const { bg, text } = styles[variant] ?? styles.amber;
  return (
    <span
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none shrink-0"
      style={{ backgroundColor: bg, color: text }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface NavItem { tabId: TabId; href: string; label: string; icon: React.ReactNode; matchFn: (p: string) => boolean; noBadge?: boolean; title?: string; }
interface NavSection { label: string; items: NavItem[]; }

const ICON_CLS = "w-4 h-4 shrink-0";

const AGENTS_NAV_ITEM: NavItem = { tabId: "agents", href: "/agents", label: "מרכז הפיקוד הדיגיטלי", icon: <Bot className={ICON_CLS} />, matchFn: (p) => p.startsWith("/agents"), noBadge: true };

const NAV_SECTIONS: NavSection[] = [
  {
    label: "מרכז שליטה",
    items: [
      { tabId: "dashboard", href: "/", label: "מרכז שליטה", icon: <LayoutDashboard className={ICON_CLS} />, matchFn: (p) => p === "/", title: "בעיות פתוחות בהזמנות" },
      { tabId: "orders", href: "/orders", label: "טבלת הזמנות", icon: <Table2 className={ICON_CLS} />, matchFn: (p) => p.startsWith("/orders") },
      { tabId: "schedule", href: "/schedule", label: "סידור שבועי", icon: <Calendar className={ICON_CLS} />, matchFn: (p) => p.startsWith("/schedule") },
    ],
  },
  {
    label: "חשבונות",
    items: [
      { tabId: "accounting", href: "/accounting", label: "הנהלת חשבונות", icon: <DollarSign className={ICON_CLS} />, matchFn: (p) => p.startsWith("/accounting") },
      { tabId: "customers", href: "/customers", label: "לקוחות", icon: <Users className={ICON_CLS} />, matchFn: (p) => p.startsWith("/customers") },
    ],
  },
  {
    label: "ניהול",
    items: [
      { tabId: "orders", href: "/new-order", label: "הזמנה חדשה", icon: <FileText className={ICON_CLS} />, matchFn: (p) => p === "/new-order", noBadge: true },
      { tabId: "work-diary", href: "/work-diary", label: "יומן עבודה חדש", icon: <BookOpen className={ICON_CLS} />, matchFn: (p) => p.startsWith("/work-diary") },
      { tabId: "supplier-documents", href: "/supplier-documents", label: "סריקת מסמך", icon: <ScanLine className={ICON_CLS} />, matchFn: (p) => p.startsWith("/supplier-documents"), noBadge: true },
    ],
  },
  {
    label: "מחלקות",
    items: [
      { tabId: "graphics", href: "/graphics", label: "מחלקת גרפיקה", icon: <Palette className={ICON_CLS} />, matchFn: (p) => p.startsWith("/graphics") },
      { tabId: "warehouse", href: "/warehouse", label: "מחלקת מחסן", icon: <Warehouse className={ICON_CLS} />, matchFn: (p) => p.startsWith("/warehouse") },
      { tabId: "fabrication", href: "/fabrication", label: "מחלקת מסגריה", icon: <Wrench className={ICON_CLS} />, matchFn: (p) => p.startsWith("/fabrication") },
    ],
  },
  {
    label: "בנוסף",
    items: [
      { tabId: "catalog", href: "/catalog", label: "קטלוג מוצרים ופריטים", icon: <Database className={ICON_CLS} />, matchFn: (p) => p === "/catalog" || (p.startsWith("/catalog") && !p.startsWith("/catalog-showcase") && !p.startsWith("/catalog-holo")) },
      { tabId: "catalog", href: "/catalog-showcase", label: "קטלוג חזותי", icon: <LayoutGrid className={ICON_CLS} />, matchFn: (p) => p.startsWith("/catalog-showcase"), noBadge: true },
      { tabId: "catalog", href: "/holographic-catalog", label: "קטלוג תצוגה", icon: <Layers className={ICON_CLS} />, matchFn: (p) => p.startsWith("/holographic-catalog"), noBadge: true },
    ],
  },
  {
    label: "בקרת שטח",
    items: [
      { tabId: "workmap", href: "/workmap", label: "מפת עבודות", icon: <Map className={ICON_CLS} />, matchFn: (p) => p.startsWith("/workmap") },
      { tabId: "crews", href: "/crews", label: "צוותי שטח", icon: <UsersRound className={ICON_CLS} />, matchFn: (p) => p.startsWith("/crews") },
    ],
  },
  {
    label: "ניתוח",
    items: [
      { tabId: "profitability", href: "/profitability", label: "דשבורד רווחיות", icon: <TrendingUp className={ICON_CLS} />, matchFn: (p) => p.startsWith("/profitability") },
      { tabId: "cost-settings", href: "/cost-settings", label: "תעריפי עלות", icon: <Settings className={ICON_CLS} />, matchFn: (p) => p.startsWith("/cost-settings") },
    ],
  },
  {
    label: "מחקר ותכנון",
    items: [
      { tabId: "plan-scanner", href: "/plan-scanner", label: "סורק תוכניות", icon: <ScanText className={ICON_CLS} />, matchFn: (p) => p.startsWith("/plan-scanner"), noBadge: true },
    ],
  },
];

function SidebarLink({ href, label, active, icon, onClick, badge, badgeVariant, title, onGuardedNavigate }: {
  href: string; label: string; active: boolean; icon: React.ReactNode;
  onClick?: () => void; badge?: number; badgeVariant?: "amber" | "red" | "blue" | "teal"; title?: string;
  onGuardedNavigate?: (href: string) => void;
}) {
  const sharedStyle = active
    ? { backgroundColor: "rgba(255,255,255,0.10)", color: "#ffffff", fontWeight: 600, borderRightColor: EK_GOLD, borderRightWidth: 3, borderRightStyle: "solid" as const }
    : { color: "rgba(255,255,255,0.55)", borderRightColor: "transparent", borderRightWidth: 3, borderRightStyle: "solid" as const };
  const sharedCls = "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group hover:bg-white/10 hover:!text-white w-full text-right";
  const iconEl = <span style={{ color: active ? EK_GOLD : "rgba(255,255,255,0.35)" }} className="shrink-0 group-hover:!text-white/70 transition-colors">{icon}</span>;
  const inner = (
    <>
      {iconEl}
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && <NavBadge count={badge} variant={badgeVariant} />}
    </>
  );

  if (onGuardedNavigate) {
    return (
      <button type="button" title={title} style={sharedStyle} className={sharedCls}
        onClick={() => { onGuardedNavigate(href); onClick?.(); }}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={href} onClick={onClick} title={title} style={sharedStyle} className={sharedCls}>
      {inner}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <span className="block px-3 pt-4 pb-1 text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.25)" }}>{label}</span>;
}

// Per-tab badge config: which notification count + which colour variant
const TAB_BADGES: Partial<Record<TabId, { count: keyof ReturnType<typeof useNotifications>; variant: "amber" | "red" | "blue" | "teal" }>> = {
  dashboard:   { count: "dashboard",   variant: "red" },
  orders:      { count: "orders",      variant: "red" },
  graphics:    { count: "graphics",    variant: "amber" },
  warehouse:   { count: "warehouse",   variant: "teal" },
  fabrication: { count: "fabrication", variant: "amber" },
  accounting:  { count: "accounting",  variant: "blue" },
  schedule:    { count: "schedule",    variant: "teal" },
};

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading, logout } = useAuth();
  const notif = useNotifications();
  const { guard, requestNavigate } = useNavigationGuard();

  const showAll = loading || !profile;
  const canSeeTab = (tabId: TabId) => showAll || canAccessTab(profile!, tabId);
  const canManageAccess = showAll || canPerformAction(profile!, "manage_access");

  // When modal resolves with a pending href (and modal is now closed), navigate
  // This is handled in AppShellInner — here we just handle the guarded click
  function guardedNavigate(href: string) {
    onClose?.();
    if (guard?.isDirty) {
      requestNavigate(href);
    } else {
      router.push(href);
    }
  }

  const handleNavClick = () => { onClose?.(); };

  // Whether to use guarded navigation — only when a dirty form is registered
  const isDirtyGuard = guard?.isDirty ?? false;

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
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col p-2.5 flex-1 overflow-y-auto">
        {/* Primary entry point — standalone top-level, visually separated from sections */}
        {canSeeTab(AGENTS_NAV_ITEM.tabId) && (
          <div className="pb-2 mb-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <SidebarLink
              href={AGENTS_NAV_ITEM.href}
              label={AGENTS_NAV_ITEM.label}
              active={AGENTS_NAV_ITEM.matchFn(pathname)}
              icon={AGENTS_NAV_ITEM.icon}
              onClick={handleNavClick}
              onGuardedNavigate={isDirtyGuard ? guardedNavigate : undefined}
            />
          </div>
        )}

        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => canSeeTab(item.tabId));
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.label}>
              <SectionLabel label={section.label} />
              {visibleItems.map((item) => {
                const cfg = item.noBadge ? undefined : TAB_BADGES[item.tabId];
                return (
                  <SidebarLink key={item.href} href={item.href} label={item.label}
                    active={item.matchFn(pathname)} icon={item.icon} onClick={handleNavClick}
                    badge={cfg ? notif[cfg.count] : undefined}
                    badgeVariant={cfg?.variant} title={item.title}
                    onGuardedNavigate={isDirtyGuard ? guardedNavigate : undefined} />
                );
              })}
            </div>
          );
        })}

        {(canManageAccess || canSeeTab("integrations")) && (
          <SectionLabel label="מערכת" />
        )}
        {canManageAccess && (
          <SidebarLink href="/access" label="הרשאות גישה" active={pathname.startsWith("/access")} icon={<ShieldPlus className={ICON_CLS} />} onClick={handleNavClick}
            onGuardedNavigate={isDirtyGuard ? guardedNavigate : undefined} />
        )}
        {canSeeTab("integrations") && (
          <SidebarLink href="/integrations" label="אינטגרציות" active={pathname.startsWith("/integrations")} icon={<Cable className={ICON_CLS} />} onClick={handleNavClick}
            onGuardedNavigate={isDirtyGuard ? guardedNavigate : undefined} />
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
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
