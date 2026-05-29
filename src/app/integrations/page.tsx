"use client";

import { useState, useCallback } from "react";
import { authedFetch } from "@/lib/clientApi";

type HealthResult = {
  mode: string;
  env_vars_present: boolean;
  url_reachable: boolean | null;
  login_success: boolean | null;
  sample_read_success: boolean | null;
  sample_entity: string | null;
  sample_count: number | null;
  checked_at: string;
  error: string | null;
};

type DryRunResult = {
  entity: string;
  total_fetched: number;
  sample: Array<{ sap_raw: unknown; normalized: unknown }>;
  unmapped_fields: string[];
  future_sync: {
    target_table: string;
    conflict_key: string;
    source_of_truth: string;
    split_note: string | null;
    phase: number;
  } | null;
};

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";

const ENTITIES: { key: string; label: string }[] = [
  { key: "business_partners", label: "שותפים עסקיים" },
  { key: "customers", label: "לקוחות" },
  { key: "suppliers", label: "ספקים" },
  { key: "items", label: "פריטים / קטלוג" },
  { key: "warehouses", label: "מחסנים" },
  { key: "orders", label: "הזמנות מכירה פתוחות" },
  { key: "invoices", label: "חשבוניות" },
  { key: "credit_notes", label: "זיכויים" },
  { key: "delivery_notes", label: "תעודות משלוח" },
  { key: "payments", label: "תקבולים" },
];

function ModeBadge({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    disabled: "#6b7280",
    readonly: "#10b981",
    write_test: "#f59e0b",
    write_prod: "#ef4444",
  };
  const color = colors[mode] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide"
      style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      {mode}
    </span>
  );
}

function StatusDot({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-gray-400 text-base">—</span>;
  return value
    ? <span className="text-emerald-400 text-base">✓</span>
    : <span className="text-red-400 text-base">✗</span>;
}

export default function IntegrationsPage() {
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [dryRuns, setDryRuns] = useState<Record<string, DryRunResult>>({});
  const [dryRunLoading, setDryRunLoading] = useState<Record<string, boolean>>({});
  const [dryRunErrors, setDryRunErrors] = useState<Record<string, string>>({});

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await authedFetch("/api/sap/health");
      const data: HealthResult = await res.json();
      setHealth(data);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : String(err));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const runDryRun = useCallback(async (entity: string) => {
    setDryRunLoading((p) => ({ ...p, [entity]: true }));
    setDryRunErrors((p) => { const n = { ...p }; delete n[entity]; return n; });
    try {
      const res = await authedFetch(`/api/sap/dry-run?entity=${entity}`);
      const data = await res.json() as DryRunResult & { error?: string };
      if (data.error) throw new Error(data.error);
      setDryRuns((p) => ({ ...p, [entity]: data }));
    } catch (err) {
      setDryRunErrors((p) => ({ ...p, [entity]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setDryRunLoading((p) => ({ ...p, [entity]: false }));
    }
  }, []);

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ backgroundColor: "#f0f4f8" }}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: NAVY }}>
            אינטגרציות חיצוניות
          </h1>
          <p className="text-sm mt-1 text-gray-500">
            חיבורים למערכות ERP ומקורות נתונים חיצוניים — קריאה בלבד
          </p>
        </div>

        {/* SAP Business One card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Card header */}
          <div
            className="px-6 py-5 flex items-center justify-between"
            style={{ borderBottom: "1px solid #f0f4f8" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm shrink-0"
                style={{ backgroundColor: NAVY }}
              >
                SAP
              </div>
              <div>
                <div className="font-bold text-sm" style={{ color: NAVY }}>SAP Business One</div>
                <div className="text-xs text-gray-400">Service Layer · Phase 1 — Read Only</div>
              </div>
            </div>
            <button
              onClick={runHealthCheck}
              disabled={healthLoading}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: NAVY, color: "white" }}
            >
              {healthLoading ? "בודק..." : "בדוק חיבור"}
            </button>
          </div>

          {/* Health result */}
          {(health || healthError) && (
            <div className="px-6 py-4 space-y-3" style={{ borderBottom: "1px solid #f0f4f8" }}>
              {healthError && (
                <p className="text-sm text-red-500">שגיאת רשת: {healthError}</p>
              )}
              {health && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <ModeBadge mode={health.mode} />
                    <span className="text-xs text-gray-400">
                      נבדק: {new Date(health.checked_at).toLocaleString("he-IL")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "משתני סביבה", value: health.env_vars_present },
                      { label: "כתובת שרת", value: health.url_reachable },
                      { label: "התחברות SAP", value: health.login_success },
                      { label: "קריאת נתונים", value: health.sample_read_success },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                        <StatusDot value={value} />
                        <div className="text-xs text-gray-500 mt-1">{label}</div>
                      </div>
                    ))}
                  </div>
                  {health.error && (
                    <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 font-mono break-all">
                      {health.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Dry-run entity cards */}
          <div className="px-6 py-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">
              תצוגה מקדימה של מיפוי נתונים (Dry Run — ללא כתיבה)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ENTITIES.map(({ key, label }) => {
                const result = dryRuns[key];
                const loading = dryRunLoading[key];
                const err = dryRunErrors[key];
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-semibold truncate" style={{ color: NAVY }}>
                        {label}
                      </span>
                      <button
                        onClick={() => runDryRun(key)}
                        disabled={loading}
                        className="text-xs px-3 py-1 rounded-lg font-medium transition-all disabled:opacity-50 border shrink-0"
                        style={{ borderColor: EK_BLUE, color: EK_BLUE }}
                      >
                        {loading ? "טוען..." : "הצג תצוגה מקדימה"}
                      </button>
                    </div>
                    {err && (
                      <p className="text-xs text-red-500 break-all">{err}</p>
                    )}
                    {result && (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500">
                          נמצאו {result.total_fetched} רשומות
                          {result.sample.length > 0 && ` · מוצג דוגמה של ${result.sample.length}`}
                        </p>
                        {result.future_sync && (
                          <p className="text-xs text-gray-400">
                            Phase 2: <span className="font-mono">{result.future_sync.target_table}</span>
                            {" · מפתח: "}<span className="font-mono">{result.future_sync.conflict_key}</span>
                          </p>
                        )}
                        {result.unmapped_fields.length > 0 && (
                          <p className="text-xs text-amber-500">
                            שדות לא ממופים: {result.unmapped_fields.slice(0, 5).join(", ")}
                            {result.unmapped_fields.length > 5 && ` +${result.unmapped_fields.length - 5}`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Phase 2 preparation note */}
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-2">
            Phase 2 — סנכרון ל-Supabase (לא מופעל)
          </p>
          <p className="text-sm text-gray-400 leading-relaxed">
            לאחר אישור המיפוי וקבלת פרטי SAP מהספק, Phase 2 יסנכרן את נתוני SAP לטבלאות Supabase.
            SAP הוא מקור האמת עבור נתוני חשבונאות; מערכת אלקיים שומרת על מלוא שליטת הנתונים התפעוליים.
            ראה תיעוד מלא בספציפיקציה.
          </p>
        </div>

      </div>
    </div>
  );
}
