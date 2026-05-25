"use client";

import { useState } from "react";
import { useCostRatesContext } from "@/context/CostRatesContext";
import { COST_RATE_LABELS, DEFAULT_COST_RATES } from "@/types/costRates";
import type { CostRates } from "@/types/costRates";

type RateKey = keyof Omit<CostRates, "updatedAt">;

const SECTIONS: { label: string; fields: RateKey[] }[] = [
  {
    label: "עלויות עבודה",
    fields: ["workerDailyCost", "teamLeaderDailyCost", "workerHourlyCost"],
  },
  {
    label: "עלויות רכב ודלק",
    fields: ["vehicleDailyCost", "fuelCostPerDay", "vehicleCostPerKm"],
  },
  {
    label: "עלויות ציוד",
    fields: ["equipmentDailyCost"],
  },
  {
    label: "תקורות",
    fields: ["overheadPercentage", "fixedDailyOverhead"],
  },
  {
    label: "סף ניהולי ויעדים",
    fields: ["minDailyBillingAmount", "targetMarginPercentage", "warningMarginPercentage", "lossThresholdPercentage"],
  },
];

function isPercentField(key: RateKey): boolean {
  return key.toLowerCase().includes("percentage");
}

export function CostSettingsPage() {
  const { rates, updateRates, resetRates } = useCostRatesContext();
  const [draft, setDraft] = useState<Omit<CostRates, "updatedAt">>({ ...rates });
  const [saved, setSaved] = useState(false);

  function handleChange(key: RateKey, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value === "" ? 0 : parseFloat(value) }));
    setSaved(false);
  }

  function handleSave() {
    updateRates(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleReset() {
    if (!confirm("לאפס את כל התעריפים לברירת המחדל?")) return;
    resetRates();
    const { updatedAt: _updatedAt, ...defaults } = DEFAULT_COST_RATES; // eslint-disable-line @typescript-eslint/no-unused-vars
    setDraft(defaults);
    setSaved(false);
  }

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="scene-header px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold scene-title">תעריפי עלות</h1>
              <p className="text-xs scene-subtitle">בסיס לחישוב רווחיות יומי · עודכן {new Date(rates.updatedAt).toLocaleDateString("he-IL")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 border border-white/15 hover:bg-white/10 transition-colors"
            >
              אפס לברירת מחדל
            </button>
            <button
              type="button"
              onClick={handleSave}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${saved ? "bg-green-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
            >
              {saved ? "✓ נשמר" : "שמור שינויים"}
            </button>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="max-w-2xl mx-auto px-4 mt-4 space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.label} className="glass-card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-bold text-gray-700">{section.label}</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {section.fields.map((key) => {
                const isPct = isPercentField(key);
                const def = DEFAULT_COST_RATES[key] as number;
                const current = draft[key] as number;
                const changed = current !== def;
                return (
                  <div key={key} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">{COST_RATE_LABELS[key]}</span>
                        {changed && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-600">שונה</span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400">ברירת מחדל: {def}{isPct ? "%" : "₪"}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="0"
                        step={isPct ? "0.5" : "10"}
                        value={current}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="w-24 px-2 py-1.5 rounded-lg border border-gray-300 text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        dir="ltr"
                      />
                      <span className="text-xs text-gray-400 w-5 text-center">{isPct ? "%" : "₪"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Info note */}
        <div className="px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700 leading-relaxed">
          <strong>שים לב:</strong> שינוי תעריפים משפיע על כל חישובי הרווחיות החדשים — יומנים קיימים שנשמרו לא ישתנו עד לחישוב מחדש.
          תעריפים נשמרים בדפדפן זה בלבד.
        </div>
      </div>
    </div>
  );
}
