"use client";

import { useEffect } from "react";

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f4f7fb" }}>
      <div className="w-full max-w-sm px-4 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-6 mx-auto"
          style={{ backgroundColor: NAVY }}
        >
          <span className="text-white font-black text-3xl leading-none select-none">א</span>
        </div>
        <h1 className="text-xl font-black mb-2" style={{ color: NAVY }}>
          אירעה שגיאה במערכת
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          העמוד נתקל בבעיה בלתי צפויה. נסה לרענן או לטעון שוב.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full py-2.5 rounded-lg font-bold text-sm text-white transition-all hover:opacity-90"
            style={{ backgroundColor: EK_BLUE }}
          >
            נסה שוב
          </button>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 rounded-lg font-bold text-sm transition-all border"
            style={{ color: NAVY, borderColor: "#d1d5db" }}
          >
            רענן עמוד
          </button>
        </div>
        {error.digest && (
          <p className="text-xs text-gray-300 mt-4">קוד שגיאה: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
