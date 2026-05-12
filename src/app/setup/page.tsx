"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hasMaster, createUser } from "@/lib/auth/store";

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";
const EK_GOLD = "#f59e0b";

export default function SetupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (hasMaster()) {
      setError("כבר קיים מנהל ראשי במערכת.");
      return;
    }
    setLoading(true);
    try {
      await createUser({ name, email, password, role: "master" });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f4f7fb" }}>
      <div className="w-full max-w-sm px-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-4" style={{ backgroundColor: NAVY }}>
            <span className="text-white font-black text-3xl leading-none select-none">א</span>
          </div>
          <h1 className="text-2xl font-black" style={{ color: NAVY }}>הגדרת המערכת</h1>
          <p className="text-sm font-semibold mt-1" style={{ color: EK_GOLD }}>יצירת מנהל ראשי</p>
          <p className="text-xs mt-2 text-gray-400 text-center">עמוד זה זמין פעם אחת בלבד</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {done ? (
            <div className="text-center">
              <p className="font-bold text-gray-800 mb-4">המנהל הראשי נוצר בהצלחה!</p>
              <button onClick={() => router.push("/login")}
                className="w-full py-2.5 rounded-lg font-bold text-sm text-white"
                style={{ backgroundColor: EK_BLUE }}>מעבר לדף הכניסה</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: NAVY }}>שם מלא</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "#d1d5db" }} placeholder="שם מלא" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: NAVY }}>אימייל</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "#d1d5db" }} dir="ltr" placeholder="admin@company.co.il" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: NAVY }}>סיסמה</label>
                <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "#d1d5db" }} placeholder="לפחות 8 תווים" />
              </div>
              {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200"><p className="text-sm text-red-700">{error}</p></div>}
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg font-bold text-sm text-white"
                style={{ backgroundColor: loading ? "#9ca3af" : EK_BLUE }}>
                {loading ? "יוצר..." : "יצירת מנהל ראשי"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
