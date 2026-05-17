"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/context/AuthContext";
import { GlobalFloatingChatProvider, GlobalChatMount } from "@/context/GlobalFloatingChatContext";

const AUTH_PATHS = ["/login", "/setup"];

const NAVY = "#0d1b2e";

function HamburgerIcon() {
  return (
    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.includes(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on navigation
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (isAuthPage) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  return (
    <AuthProvider>
      <GlobalFloatingChatProvider>
        {/* Mobile hamburger button — visible only on small screens */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-3 right-3 z-30 flex items-center justify-center w-10 h-10 rounded-xl shadow-md md:hidden no-print"
          style={{ backgroundColor: NAVY }}
          aria-label="פתח תפריט"
        >
          <HamburgerIcon />
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
      </GlobalFloatingChatProvider>
    </AuthProvider>
  );
}
