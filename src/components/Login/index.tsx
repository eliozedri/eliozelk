"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";
const EK_GOLD = "#f59e0b";
const LOGIN_TIMEOUT_MS = 12000;

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timeout on unmount
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const stopLoading = (msg?: string) => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (msg) setError(msg);
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Safety net: if anything hangs beyond 12s, release the button
    timeoutRef.current = setTimeout(() => {
      stopLoading("הכניסה ארכה יותר מדי זמן. בדוק חיבור לאינטרנט ונסה שנית.");
    }, LOGIN_TIMEOUT_MS);

    try {
      const db = getSupabase();
      if (!db) {
        stopLoading("שגיאת תצורה — חסרים פרטי חיבור. פנה למנהל המערכת.");
        return;
      }

      // Primary path: Supabase Auth
      const { error: signInErr } = await db.auth.signInWithPassword({ email, password });

      if (!signInErr) {
        // Session is now in cookies (createBrowserClient) — middleware will pass.
        // Clear timeout but keep loading=true while Next.js navigates.
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        router.push("/");
        return;
      }

      // Map Supabase Auth error messages to user-friendly Hebrew
      if (
        signInErr.message.includes("Invalid login credentials") ||
        signInErr.message.includes("Email not confirmed")
      ) {
        stopLoading("אימייל או סיסמה שגויים. נסה שנית.");
        return;
      }

      const msg = signInErr.message.toLowerCase();
      if (msg.includes("too many requests") || msg.includes("rate limit")) {
        stopLoading("יותר מדי ניסיונות כניסה. המתן מספר דקות ונסה שנית.");
      } else if (msg.includes("network") || msg.includes("fetch")) {
        stopLoading("שגיאת רשת. בדוק חיבור לאינטרנט ונסה שנית.");
      } else {
        stopLoading("שגיאת כניסה. נסה שנית.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("network") || msg.includes("fetch") || msg.includes("Failed to fetch")) {
        stopLoading("שגיאת רשת. בדוק חיבור לאינטרנט ונסה שנית.");
      } else {
        stopLoading("שגיאה בלתי צפויה. נסה שנית.");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f4f7fb" }}>
      <div className="w-full max-w-sm px-4">
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-4"
            style={{ backgroundColor: NAVY }}
          >
            <span className="text-white font-black text-3xl leading-none select-none">א</span>
          </div>
          <h1 className="text-2xl font-black" style={{ color: NAVY }}>אלקיים</h1>
          <p className="text-sm font-semibold mt-1" style={{ color: EK_GOLD }}>סימון כבישים בע״מ</p>
          <p className="text-xs mt-2 text-gray-400">מערכת ניהול פנימית</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: NAVY }}>אימייל</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 transition-all"
                style={{ borderColor: "#d1d5db" }}
                placeholder="name@company.co.il"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: NAVY }}>סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 transition-all"
                style={{ borderColor: "#d1d5db" }}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-bold text-sm text-white transition-all hover:opacity-90"
              style={{ backgroundColor: loading ? "#9ca3af" : EK_BLUE }}
            >
              {loading ? "מתחבר..." : "כניסה למערכת"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6 text-gray-400">אין לך גישה? פנה למנהל המערכת</p>
      </div>
    </div>
  );
}
