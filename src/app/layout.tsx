import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { OrdersProvider } from "@/components/OrdersProvider";
import { CatalogProvider } from "@/components/CatalogProvider";
import { CrewsProvider } from "@/components/CrewsProvider";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "אלקיים סימון כבישים | הזמנת שילוט",
  description: "מערכת פנימית - פתיחת הזמנת שילוט",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-[family-name:var(--font-heebo)] antialiased bg-gray-50 min-h-screen">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <CatalogProvider>
              <OrdersProvider>
                <CrewsProvider>
                  {children}
                </CrewsProvider>
              </OrdersProvider>
            </CatalogProvider>
          </main>
        </div>
      </body>
    </html>
  );
}
