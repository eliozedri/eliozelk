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
        {/* Mobile hamburger */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-3 right-3 z-30 flex items-center justify-center w-10 h-10 rounded-xl shadow-md md:hidden no-print"
          style={{ backgroundColor: NAVY }}
          aria-label="פתח תפריט"
        >
          <Menu className="w-5 h-5 text-white" />
        </button>

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex min-h-screen">
          <div
            className={`
              fixed inset-y-0 right-0 z-50
              transition-transform duration-300 ease-in-out
              md:relative md:inset-auto md:z-auto md:translate-x-0
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
      <NavigationGuardProvider>
        <AppShellInner>{children}</AppShellInner>
      </NavigationGuardProvider>
    </AuthProvider>
  );
}
