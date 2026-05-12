"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";
const EK_GOLD = "#f59e0b";

const CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("אימייל או סיסמה שגויים. נסה שנית.");
      setLoading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", user.id)
        .single();

      if (!profileData || !profileData.is_active) {
        await supabase.auth.signOut();
        setError("חשבון זה אינו פעיל. פנה למנהל המערכת.");
        setLoading(false);
        return;
      }
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "#f4f7fb" }}
    >
      <div className="w-full max-w-sm px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-4"
            style={{ backgroundColor: NAVY }}
          >
            <span className="text-white font-black text-3xl leading-none select-none">
              א
            </span>
          </div>
          <h1 className="text-2xl font-black" style={{ color: NAVY }}>
            אלקיים
          </h1>
          <p className="text-sm font-semibold mt-1" style={{ color: EK_GOLD }}>
            סימון כבישים בע״מ
          </p>
          <p className="text-xs mt-2 text-gray-400">מערכת ניהול פנימית</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {!CONFIGURED ? (
            <div
              className="text-center p-4 rounded-lg border"
              style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a" }}
            >
              <p className="text-sm font-bold text-amber-800">
                המערכת לא מוגדרת
              </p>
              <p className="text-xs text-amber-700 mt-1">
                יש להגדיר משתני סביבה של Supabase ב-Vercel
              </p>
              <p className="text-xs text-amber-600 mt-2 font-mono">
                NEXT_PUBLIC_SUPABASE_URL
                <br />
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </p>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label
                  className="block text-sm font-semibold mb-1.5"
                  style={{ color: NAVY }}
                >
                  אימייל
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 transition-all"
                  style={{
                    borderColor: "#d1d5db",
                    direction: "ltr",
                    textAlign: "left",
                  }}
                  placeholder="name@company.co.il"
                  dir="ltr"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-semibold mb-1.5"
                  style={{ color: NAVY }}
                >
                  סיסמה
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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
          )}
        </div>

        <p className="text-center text-xs mt-6 text-gray-400">
          אין לך גישה? פנה למנהל המערכת
        </p>
      </div>
    </div>
  );
}
