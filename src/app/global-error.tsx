"use client";

import { useEffect } from "react";

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";

// global-error.tsx replaces the root layout — no Tailwind, no fonts, no providers.
// Must include its own <html> and <body>.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, backgroundColor: "#f4f7fb", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "24rem",
              padding: "0 1rem",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "4rem",
                height: "4rem",
                borderRadius: "1rem",
                backgroundColor: NAVY,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.5rem",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              <span
                style={{
                  color: "white",
                  fontWeight: 900,
                  fontSize: "1.875rem",
                  lineHeight: 1,
                }}
              >
                א
              </span>
            </div>

            <h1
              style={{
                color: NAVY,
                fontSize: "1.25rem",
                fontWeight: 900,
                margin: "0 0 0.5rem",
              }}
            >
              המערכת נתקלה בבעיה
            </h1>

            <p
              style={{
                color: "#6b7280",
                fontSize: "0.875rem",
                margin: "0 0 1.5rem",
                lineHeight: 1.5,
              }}
            >
              לחץ על רענן לחזרה למערכת.
              <br />
              אם הבעיה חוזרת, פנה למנהל המערכת.
            </p>

            <button
              onClick={() => window.location.reload()}
              style={{
                width: "100%",
                padding: "0.625rem 0",
                borderRadius: "0.5rem",
                backgroundColor: EK_BLUE,
                color: "white",
                fontWeight: 700,
                fontSize: "0.875rem",
                border: "none",
                cursor: "pointer",
              }}
            >
              רענן את המערכת
            </button>

            {error.digest && (
              <p
                style={{
                  color: "#d1d5db",
                  fontSize: "0.75rem",
                  marginTop: "1rem",
                }}
              >
                קוד שגיאה: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
