"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getUserByEmail, touchLastLogin } from "@/lib/auth/store";
import { verifyPassword } from "@/lib/auth/crypto";
import { createSession } from "@/lib/auth/session";

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";
const EK_GOLD = "#f59e0b";

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

    const user = getUserByEmail(email);
    if (!user) {
      setError("אימייל או סיסמה שגויים. נסה שנית.");
      setLoading(false);
      return;
    }

    if (!user.is_active) {
      setError("חשבון זה אינו פעיל. פנה למנהל המערכת.");
      setLoading(false);
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      setError("אימייל או סיסמה שגויים. נסה שנית.");
      setLoading(false);
      return;
    }

    touchLastLogin(user.id);
    createSession(user.id);
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f4f7fb" }}>
      <div className="w-full max-w-sm px-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-4" style={{ backgroundColor: NAVY }}>
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
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none"
                style={{ borderColor: "#d1d5db" }} placeholder="name@company.co.il" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: NAVY }}>סיסמה</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none"
                style={{ borderColor: "#d1d5db" }} placeholder="••••••••" />
            </div>
            {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200"><p className="text-sm text-red-700">{error}</p></div>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg font-bold text-sm text-white"
              style={{ backgroundColor: loading ? "#9ca3af" : EK_BLUE }}>
              {loading ? "מתחבר..." : "כניסה למערכת"}
            </button>
          </form>
        </div>
        <p className="text-center text-xs mt-6 text-gray-400">אין לך גישה? פנה למנהל המערכת</p>
      </div>
    </div>
  );
}
