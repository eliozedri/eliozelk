"use client";

import { useState } from "react";

export default function MigratePage() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [results, setResults] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("running");
    setError(null);
    try {
      const data = {
        customers: JSON.parse(localStorage.getItem("elkayam_customers") ?? "[]"),
        orders: JSON.parse(localStorage.getItem("elkayam_orders") ?? "[]"),
        catalog: JSON.parse(localStorage.getItem("elkayam_catalog") ?? "[]"),
        crews: JSON.parse(localStorage.getItem("elkayam_crews") ?? "[]"),
        diaries: JSON.parse(localStorage.getItem("elkayam_work_diaries") ?? "[]"),
        costRates: JSON.parse(localStorage.getItem("elkayam_cost_rates") ?? "null"),
      };

      const res = await fetch("/api/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: "elkayam-migrate-2026", data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "שגיאה");
      setResults(json.results);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
      setStatus("error");
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full">
        <h1 className="text-2xl font-black text-gray-900 mb-2">העברת נתונים ל-Supabase</h1>
        <p className="text-sm text-gray-500 mb-6">
          פעולה זו תעלה את כל הנתונים השמורים בדפדפן (הזמנות, לקוחות, קטלוג, צוותים, יומנים, תעריפים)
          אל מסד הנתונים בענן. ניתן להריץ אותה פעם אחת בלבד.
        </p>

        {status === "idle" && (
          <button
            onClick={run}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors"
          >
            התחל העברה
          </button>
        )}

        {status === "running" && (
          <div className="text-center py-4 text-gray-500 text-sm">מעלה נתונים...</div>
        )}

        {status === "done" && results && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold">✓</div>
              <p className="font-bold text-green-700">ההעברה הושלמה בהצלחה</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-sm font-mono space-y-1">
              {Object.entries(results).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-gray-800">{String(v)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4">כעת ניתן לנווט חזרה לאפליקציה. הנתונים מסונכרנים עם הענן.</p>
          </div>
        )}

        {status === "error" && (
          <div>
            <p className="text-red-700 font-semibold mb-2">שגיאה: {error}</p>
            <button onClick={run} className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm">
              נסה שוב
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
