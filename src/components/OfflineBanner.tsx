"use client";

import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline  = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online",  goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online",  goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white no-print"
      style={{ backgroundColor: "#b45309" }}
    >
      <span aria-hidden>⚠</span>
      אין חיבור לאינטרנט — המערכת אינה זמינה ללא רשת. בדוק את החיבור ורענן.
    </div>
  );
}
