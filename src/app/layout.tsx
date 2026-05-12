import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { OrdersProvider } from "@/components/OrdersProvider";
import { CatalogProvider } from "@/components/CatalogProvider";
import { CrewsProvider } from "@/components/CrewsProvider";
import { CostRatesProvider } from "@/components/CostRatesProvider";
import { WorkDiaryProvider } from "@/components/WorkDiaryProvider";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "אלקיים סימון כבישים | מרכז שליטה",
  description: "מערכת ניהול פנימית — אלקיים סימון כבישים בע״מ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-[family-name:var(--font-heebo)] antialiased bg-surface min-h-screen">
        <CostRatesProvider>
          <WorkDiaryProvider>
            <CatalogProvider>
              <OrdersProvider>
                <CrewsProvider>
                  <AppShell>{children}</AppShell>
                </CrewsProvider>
              </OrdersProvider>
            </CatalogProvider>
          </WorkDiaryProvider>
        </CostRatesProvider>
      </body>
    </html>
  );
}
