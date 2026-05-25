"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileText, Table2, LayoutDashboard, Users, Palette, Wrench,
  Database, ShieldCheck, Warehouse, DollarSign, Map, Calendar,
  UsersRound, BookOpen, TrendingUp, Bot, Settings, ShieldPlus,
  LogOut, X, Cable, ScanLine, ScanText, LayoutGrid, Send, Store, Truck, Wallet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { canAccessTab, canPerformAction, ROLE_LABELS } from "@/types/auth";
import type { TabId } from "@/types/auth";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigationGuard } from "@/context/NavigationGuardContext";

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

const ICON_CLS = "w-[18px] h-[18px] shrink-0";

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
      { tabId: "financial-management", href: "/financial-management", label: "הנהלת כספים", icon: <Wallet className={ICON_CLS} />, matchFn: (p) => p.startsWith("/financial-management"), noBadge: true },
      { tabId: "customers", href: "/customers", label: "לקוחות", icon: <Users className={ICON_CLS} />, matchFn: (p) => p.startsWith("/customers") },
    ],
  },
  {
    label: "ניהול",
    items: [
      { tabId: "orders", href: "/new-order", label: "הזמנה חדשה", icon: <FileText className={ICON_CLS} />, matchFn: (p) => p === "/new-order", noBadge: true },
      { tabId: "work-diary", href: "/work-diary", label: "יומן עבודה חדש", icon: <BookOpen className={ICON_CLS} />, matchFn: (p) => p.startsWith("/work-diary") },
      { tabId: "team-bot-orders", href: "/team-bot-orders", label: "הזמנות מהבוט", icon: <Send className={ICON_CLS} />, matchFn: (p) => p.startsWith("/team-bot-orders"), noBadge: true, title: "טיוטות הזמנה שהתקבלו דרך בוט הטלגרם" },
      { tabId: "supplier-documents", href: "/supplier-documents", label: "סריקת מסמך", icon: <ScanLine className={ICON_CLS} />, matchFn: (p) => p.startsWith("/supplier-documents"), noBadge: true },
    ],
  },
  {
    label: "מחלקות",
    items: [
      { tabId: "graphics", href: "/graphics", label: "מחלקת גרפיקה", icon: <Palette className={ICON_CLS} />, matchFn: (p) => p.startsWith("/graphics") },
      { tabId: "warehouse", href: "/warehouse", label: "מחלקת מחסן", icon: <Warehouse className={ICON_CLS} />, matchFn: (p) => p.startsWith("/warehouse") },
      { tabId: "fabrication", href: "/fabrication", label: "מחלקת מסגריה", icon: <Wrench className={ICON_CLS} />, matchFn: (p) => p.startsWith("/fabrication") },
      { tabId: "fleet", href: "/fleet", label: "צי רכב ומכונות", icon: <Truck className={ICON_CLS} />, matchFn: (p) => p.startsWith("/fleet"), noBadge: true },
    ],
  },
  {
    label: "בנוסף",
    items: [
      { tabId: "catalog", href: "/catalog", label: "קטלוג מוצרים ופריטים", icon: <Database className={ICON_CLS} />, matchFn: (p) => p === "/catalog" || (p.startsWith("/catalog") && !p.startsWith("/catalog-showcase")) },
      { tabId: "catalog", href: "/catalog-showcase", label: "קטלוג חזותי", icon: <LayoutGrid className={ICON_CLS} />, matchFn: (p) => p.startsWith("/catalog-showcase"), noBadge: true },
      { tabId: "catalog", href: "/sales-site", label: "אתר מכירה", icon: <Store className={ICON_CLS} />, matchFn: (p) => p.startsWith("/sales-site"), noBadge: true },
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
  const cls = `ek-nav-item${active ? " is-active" : ""}`;
  const inner = (
    <>
      <span className="ek-nav-icon">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && <NavBadge count={badge} variant={badgeVariant} />}
    </>
  );

  if (onGuardedNavigate) {
    return (
      <button type="button" title={title} className={cls}
        onClick={() => { onGuardedNavigate(href); onClick?.(); }}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={href} onClick={onClick} title={title} className={cls}>
      {inner}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <span className="ek-nav-label">{label}</span>;
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
    <aside className="ek-sidebar w-64 md:w-56 h-full min-h-screen flex flex-col shrink-0">

      {/* Header — brand logo with gold glow halo */}
      <div className="px-3 pt-5 pb-4 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid rgba(148,197,255,0.12)` }}>
        <div className="flex-1 min-w-0 flex justify-center">
          <div className="ek-logo-plate">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/elkayam-logo.png"
              alt="אלקיים — סימון כבישים בע״מ"
              className="w-full max-w-[200px] h-auto select-none"
              draggable={false}
            />
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors p-1 rounded shrink-0" aria-label="סגור תפריט">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col p-2.5 flex-1 overflow-y-auto">
        {/* Primary entry point — standalone top-level, visually separated from sections */}
        {canSeeTab(AGENTS_NAV_ITEM.tabId) && (
          <div className="pb-2 mb-1" style={{ borderBottom: "1px solid rgba(148,197,255,0.12)" }}>
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
        {canManageAccess && (
          <SidebarLink href="/team-bot-users" label="גישת בוט טלגרם" active={pathname.startsWith("/team-bot-users")} icon={<Send className={ICON_CLS} />} onClick={handleNavClick}
            onGuardedNavigate={isDirtyGuard ? guardedNavigate : undefined} />
        )}
        {canSeeTab("integrations") && (
          <SidebarLink href="/integrations" label="אינטגרציות" active={pathname.startsWith("/integrations")} icon={<Cable className={ICON_CLS} />} onClick={handleNavClick}
            onGuardedNavigate={isDirtyGuard ? guardedNavigate : undefined} />
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3" style={{ borderTop: `1px solid rgba(148,197,255,0.12)` }}>
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
