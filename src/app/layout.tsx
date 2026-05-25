import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { CustomersProvider } from "@/context/CustomersContext";
import { OrdersProvider } from "@/context/OrdersContext";
import { CatalogProvider } from "@/context/CatalogContext";
import { CrewsProvider } from "@/context/CrewsContext";
import { CostRatesProvider } from "@/context/CostRatesContext";
import { WorkDiaryProvider } from "@/context/WorkDiaryContext";
import { AgentProvider } from "@/components/AgentProvider";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "אלקיים סימון כבישים | מרכז שליטה",
  description: "מערכת ניהול פנימית — אלקיים סימון כבישים בע״מ",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "אלקיים", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-[family-name:var(--font-heebo)] antialiased min-h-screen">
        <CostRatesProvider>
          <WorkDiaryProvider>
            <CatalogProvider>
              <CustomersProvider>
                <OrdersProvider>
                  <CrewsProvider>
                    <AgentProvider>
                      <AppShell>{children}</AppShell>
                    </AgentProvider>
                  </CrewsProvider>
                </OrdersProvider>
              </CustomersProvider>
            </CatalogProvider>
          </WorkDiaryProvider>
        </CostRatesProvider>
        <Toaster position="bottom-left" dir="rtl" richColors />
      </body>
    </html>
  );
}
