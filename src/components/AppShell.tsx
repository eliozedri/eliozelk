"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/context/AuthContext";
import { GlobalFloatingChatProvider, GlobalChatMount } from "@/context/GlobalFloatingChatContext";
import { GlobalChatLauncher } from "@/components/AgentChat/GlobalChatLauncher";
import { OfflineBanner } from "@/components/OfflineBanner";

const AUTH_PATHS = ["/login", "/setup"];

const NAVY = "#0d1b2e";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.includes(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on navigation
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

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
      <OfflineBanner />
      <GlobalFloatingChatProvider>
        {/* Mobile hamburger button — visible only on small screens */}
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
          {/* Sidebar: fixed overlay on mobile, static on desktop */}
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

        {/* Global floating chat — persists across all routes */}
        <GlobalChatMount />
        {/* Global chat launcher — floating buttons, permission-aware */}
        <GlobalChatLauncher />
      </GlobalFloatingChatProvider>
    </AuthProvider>
  );
}
