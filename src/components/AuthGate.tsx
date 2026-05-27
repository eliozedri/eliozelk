"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";

// Renders controlled, full-screen states for auth conditions that must NOT
// collapse into a silent logout:
//   error      — profile query failed (transient): offer retry, keep session
//   no-profile — authenticated but no profile row: tell the user, offer logout
//   inactive   — account disabled: tell the user, offer logout
// authenticated / loading pass straight through to the app (per-page loaders
// keep working). unauthenticated → genuine logout, send to /login.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, retry, logout } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated" && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, [status]);

  if (status === "error" || status === "no-profile" || status === "inactive") {
    return <BlockedScreen status={status} retry={retry} logout={logout} />;
  }

  // unauthenticated → redirect effect above is firing; render nothing meanwhile.
  if (status === "unauthenticated") return null;

  return <>{children}</>;
}

function BlockedScreen({
  status,
  retry,
  logout,
}: {
  status: "error" | "no-profile" | "inactive";
  retry: () => Promise<void>;
  logout: () => Promise<void>;
}) {
  const copy = {
    error: {
      title: "בעיה בטעינת ההרשאות",
      body: "לא הצלחנו לטעון את פרטי המשתמש כרגע. ייתכן שזו תקלת רשת זמנית — החיבור שלך עדיין פעיל.",
      primary: "נסה שוב",
    },
    "no-profile": {
      title: "לא נמצא פרופיל משתמש",
      body: "החשבון מחובר אך לא נמצאה רשומת משתמש תואמת במערכת. פנה למנהל המערכת כדי שיגדיר את ההרשאות שלך.",
      primary: null,
    },
    inactive: {
      title: "החשבון מושבת",
      body: "החשבון שלך הושבת על ידי מנהל המערכת. פנה למנהל כדי להפעיל אותו מחדש.",
      primary: null,
    },
  }[status];

  return (
    <div dir="rtl" className="min-h-[100dvh] flex items-center justify-center px-4" style={{ backgroundColor: "#f4f7fb" }}>
      <div className="w-full max-w-sm text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-6 mx-auto"
          style={{ backgroundColor: NAVY }}
        >
          <span className="text-white font-black text-3xl leading-none select-none">א</span>
        </div>
        <h1 className="text-xl font-black mb-2" style={{ color: NAVY }}>{copy.title}</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">{copy.body}</p>
        <div className="flex flex-col gap-3">
          {copy.primary && (
            <button
              onClick={() => retry()}
              className="w-full py-2.5 rounded-lg font-bold text-sm text-white transition-all hover:opacity-90"
              style={{ backgroundColor: EK_BLUE }}
            >
              {copy.primary}
            </button>
          )}
          <button
            onClick={() => logout()}
            className="w-full py-2.5 rounded-lg font-bold text-sm transition-all border"
            style={{ color: NAVY, borderColor: "#d1d5db" }}
          >
            התנתק
          </button>
        </div>
      </div>
    </div>
  );
}
