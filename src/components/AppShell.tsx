"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/context/AuthContext";
import { GlobalFloatingChatProvider, GlobalChatMount } from "@/context/GlobalFloatingChatContext";
import { GlobalChatLauncher } from "@/components/AgentChat/GlobalChatLauncher";
import { OfflineBanner } from "@/components/OfflineBanner";
import { NavigationGuardProvider, useNavigationGuard } from "@/context/NavigationGuardContext";
import { DraftProtectionModal } from "@/components/ui/DraftProtectionModal";
import { NotificationProvider } from "@/context/NotificationContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CriticalAlertGate } from "@/components/notifications/CriticalAlertGate";
import { NotificationSetupGate } from "@/components/notifications/NotificationSetupGate";

const AUTH_PATHS = ["/login", "/setup"];

const NAVY = "#0d1b2e";

// Inner shell — sits inside NavigationGuardProvider so it can consume the guard context
function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { guard, showModal, pendingHref, confirmSaveDraft, confirmDiscard, confirmStay, clearGuard } = useNavigationGuard();

  // Close sidebar on navigation
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Lock background scroll while the mobile/tablet drawer is open. Plain
  // `overflow:hidden` on <body> does NOT stop touch-scroll on iOS Safari, so the
  // page behind the drawer kept scrolling instead of the sidebar nav. The reliable
  // fix is to pin <body> with position:fixed, preserving and restoring scrollY.
  // Only below lg (≥1024px the sidebar is a persistent part of the layout).
  useEffect(() => {
    if (!sidebarOpen) return;
    if (typeof window === "undefined" || window.innerWidth >= 1024) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [sidebarOpen]);

  async function handleSaveDraft() {
    await confirmSaveDraft();
    // After draft saved, navigate to the pending href
    if (pendingHref) {
      clearGuard();
      router.push(pendingHref);
    }
  }

  function handleDiscard() {
    confirmDiscard();
    if (pendingHref) {
      router.push(pendingHref);
    }
  }

  return (
    <>
      <OfflineBanner />
      <GlobalFloatingChatProvider>
        {/* Operations-center scene grid + glow, fixed behind all content */}
        <div className="scene-overlay no-print" aria-hidden />

        {/* Mobile/tablet hamburger — persistent sidebar only kicks in at lg (≥1024px) */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-3 right-3 z-30 flex items-center justify-center w-10 h-10 rounded-xl shadow-md lg:hidden no-print"
          style={{ backgroundColor: NAVY }}
          aria-label="פתח תפריט"
        >
          <Menu className="w-5 h-5 text-white" />
        </button>

        {/* Notification bell (fixed, opens the מרכז התראות drawer) */}
        <NotificationBell />

        <div className="relative z-10 flex min-h-screen">
          {/* Mobile/tablet backdrop — kept INSIDE this stacking context (alongside the
              z-50 drawer) on purpose. If it lived outside the `relative z-10` wrapper,
              its z-40 would paint above the whole wrapper — including the drawer whose
              z-50 is trapped in the wrapper's context — so the backdrop would intercept
              every touch over the sidebar and the gesture would scroll the page behind.
              Here the drawer (z-50) correctly sits above the backdrop (z-40). */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <div
            className={`
              fixed inset-y-0 right-0 z-50
              transition-transform duration-300 ease-in-out
              lg:sticky lg:top-0 lg:inset-auto lg:z-auto lg:translate-x-0 lg:h-screen
              ${sidebarOpen ? "translate-x-0" : "translate-x-full"}
            `}
          >
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>

          <main className="flex-1 min-w-0">{children}</main>
        </div>

        {/* Global floating chat */}
        <GlobalChatMount />
        <GlobalChatLauncher />

        {/* Draft protection modal — renders globally when any form is dirty + user tries to leave */}
        {showModal && (
          <DraftProtectionModal
            onStay={confirmStay}
            onSaveDraft={handleSaveDraft}
            onDiscard={handleDiscard}
            {...(guard?.modalOverride ?? {})}
          />
        )}

        {/* Blocking gate for critical (blocking + requires_ack) notifications */}
        <CriticalAlertGate />
      </GlobalFloatingChatProvider>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.includes(pathname);

  if (isAuthPage) {
    return (
      <>
        <OfflineBanner />
        <AuthProvider>{children}</AuthProvider>
      </>
    );
  }

  return (
    <AuthProvider>
      <NotificationProvider>
        <NavigationGuardProvider>
          <AppShellInner>{children}</AppShellInner>
          <NotificationSetupGate />
        </NavigationGuardProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
