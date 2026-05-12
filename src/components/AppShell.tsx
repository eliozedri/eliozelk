"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/context/AuthContext";
import { Sidebar } from "@/components/Sidebar";

const AUTH_PATHS = ["/login", "/setup"];
const NAVY = "#0d1b2e";
const EK_GOLD = "#f59e0b";

function HamburgerIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAuthPage = AUTH_PATHS.includes(pathname);

  if (isAuthPage) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  return (
    <AuthProvider>
      <div className="flex min-h-screen">
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — fixed overlay on mobile, static on desktop */}
        <div
          className={`fixed md:relative inset-y-0 right-0 z-50 md:z-auto transition-transform duration-300 ease-in-out md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
          }`}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Mobile top bar */}
          <div
            className="md:hidden flex items-center justify-between px-4 py-3 shrink-0"
            style={{ backgroundColor: NAVY, borderBottom: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#1d6fd8" }}>
              <span className="text-white font-black text-sm leading-none select-none">א</span>
            </div>
            <span className="text-white font-black text-sm" style={{ color: EK_GOLD }}>אלקיים</span>
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-white/70 hover:text-white transition-colors p-1"
              aria-label="פתח תפריט"
            >
              <HamburgerIcon />
            </button>
          </div>

          {/* Page content */}
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </AuthProvider>
  );
}
