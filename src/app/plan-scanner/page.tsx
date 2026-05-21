"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ScanText, Upload, FileSpreadsheet, Globe, ShieldAlert,
  AlertTriangle, CheckCircle, Loader2, Trash2, Download,
  Terminal, RotateCcw, FileText, Ruler,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { canAccessTab } from "@/types/auth";
import { getSupabase } from "@/lib/supabase/client";
import { useDirtyGuard } from "@/context/NavigationGuardContext";

const NAVY    = "#0d1b2e";
const EK_BLUE = "#1d6fd8";
const EK_GOLD = "#f59e0b";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanPhase =
  | "idle"
  | "uploading"
  | "intake_created"
  | "running"
  | "outputs_generated"
  | "source_deleted"
  | "failed";

interface ExportEntry {
  filename: string;
  type: string;
  description: string;
  exists: boolean;
  size: number;
}

interface CalibrationData {
  calibration_source: string;
  calibrated_at: string;
  calibration_method: string;
  scale_ratio_new: number;
  m_per_pt_new: number;
  correction_factor: number;
}

interface ScanSession {
  phase: ScanPhase;
  slug?: string;
  planName?: string;
  error?: string;
  exports?: ExportEntry[];
  exportDownloaded?: boolean;
  executionMessage?: string;
  manualCommand?: string;
  exportsGeneratedAt?: string;
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data: { session } } = await db.auth.getSession();
  return session?.access_token ?? null;
}

async function authedFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

// ── Stepper ───────────────────────────────────────────────────────────────────

const STEPS = [
  { label: "העלאה",   sub: "PDF לסריקה" },
  { label: "סריקה",   sub: "ניתוח ממוחשב" },
  { label: "תוצאות",  sub: "כמויות ואלמנטים" },
  { label: "יצוא",    sub: "Excel / HTML" },
  { label: "ניקוי",   sub: "מחיקת מקור" },
];

function phaseToStep(phase: ScanPhase): number {
  return (
    { idle: 0, uploading: 0, intake_created: 1, running: 1, outputs_generated: 2, source_deleted: 4, failed: -1 }[phase] ?? 0
  );
}

function Stepper({ phase }: { phase: ScanPhase }) {
  const current = phaseToStep(phase);
  const isRunning = phase === "running";

  return (
    <div className="flex items-center justify-between gap-1 bg-white rounded-xl border border-gray-200 p-4 shadow-sm overflow-x-auto">
      {STEPS.map((step, i) => {
        const done = current > i;
        const active = current === i;
        const spinning = active && isRunning;
        return (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <div className="flex flex-col items-center text-center min-w-[56px]">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center mb-1 shrink-0"
                style={{
                  backgroundColor: done ? "#16a34a" : active ? EK_BLUE : "#e5e7eb",
                  color: done || active ? "#fff" : "#9ca3af",
                }}
              >
                {done ? (
                  <CheckCircle className="w-4 h-4" />
                ) : spinning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="text-xs font-bold">{i + 1}</span>
                )}
              </div>
              <p className="text-[10px] font-semibold" style={{ color: active ? EK_BLUE : done ? "#16a34a" : "#9ca3af" }}>
                {step.label}
              </p>
              <p className="text-[9px] text-gray-400">{step.sub}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-8 h-px mx-1 shrink-0" style={{ backgroundColor: done ? "#16a34a" : "#e5e7eb" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({
  onFile,
  uploading,
}: {
  onFile: (file: File) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div
      className="rounded-xl border-2 border-dashed p-8 flex flex-col items-center justify-center text-center gap-3 transition-colors cursor-pointer"
      style={{
        borderColor: dragging ? EK_BLUE : "#d1d5db",
        backgroundColor: dragging ? `${EK_BLUE}08` : "#f9fafb",
      }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        disabled={uploading}
      />
      {uploading ? (
        <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
      ) : (
        <Upload className="w-10 h-10 text-gray-400" />
      )}
      <div>
        <p className="text-sm font-semibold text-gray-700">
          {uploading ? "מעלה קובץ..." : "גרור PDF לכאן או לחץ לבחירה"}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          קבצי PDF בלבד · מקסימום 50 MB
        </p>
      </div>
      {!uploading && (
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: EK_BLUE }}
        >
          בחר קובץ PDF
        </button>
      )}
    </div>
  );
}

// ── Export card ───────────────────────────────────────────────────────────────

function ExportCard({
  entry,
  onDownload,
}: {
  entry: ExportEntry;
  onDownload: (filename: string) => void;
}) {
  const isHtml   = entry.type === "html_report";
  const isExcel  = entry.type === "excel_workbook";
  const isJson   = entry.filename.endsWith(".json");

  const icon = isHtml ? <Globe className="w-5 h-5" /> :
               isExcel ? <FileSpreadsheet className="w-5 h-5" /> :
               <FileText className="w-5 h-5" />;

  const color = isHtml ? EK_BLUE : isExcel ? "#16a34a" : "#6b7280";

  const label = isHtml   ? "פתח בדפדפן / הדפסה" :
                isExcel  ? "הורד Excel" :
                isJson   ? "הורד JSON" :
                "הורד";

  if (!entry.exists) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white"
        style={{ backgroundColor: color }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{entry.filename}</p>
        <p className="text-xs text-gray-400 mt-0.5">{entry.description || entry.type}</p>
        {entry.size > 0 && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            {(entry.size / 1024).toFixed(0)} KB
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDownload(entry.filename)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0"
        style={{ backgroundColor: color }}
      >
        <Download className="w-3.5 h-3.5" />
        {label}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlanScannerPage() {
  const { profile, loading: authLoading } = useAuth();
  const [session, setSession] = useState<ScanSession>({ phase: "idle" });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<ScanSession>(session);

  // Calibration form state
  const [calibrationMethod, setCalibrationMethod] = useState<"direct_ratio" | "two_point">("direct_ratio");
  const [scaleRatioInput, setScaleRatioInput] = useState("");
  const [knownMInput, setKnownMInput] = useState("");
  const [measuredMInput, setMeasuredMInput] = useState("");
  const [calibrationNotes, setCalibrationNotes] = useState("");
  const [calibrationSaving, setCalibrationSaving] = useState(false);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [savedCalibration, setSavedCalibration] = useState<CalibrationData | null>(null);

  // Calibration missing-scale acknowledgement
  const [calibrationNeedsAck, setCalibrationNeedsAck] = useState(false);
  const [calibrationAckMessage, setCalibrationAckMessage] = useState<string | null>(null);

  // Re-export state
  const [isReexporting, setIsReexporting] = useState(false);
  const [reexportMessage, setReexportMessage] = useState<string | null>(null);
  const lastExportsGenAt = useRef<string | undefined>(undefined);
  const reexportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync for use in callbacks
  useEffect(() => { sessionRef.current = session; }, [session]);

  // Status polling
  useEffect(() => {
    const { phase, slug } = session;
    if (phase === "running" || phase === "intake_created") {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        if (!slug) return;
        try {
          const res = await authedFetch(`/api/plan-scanner/run/${slug}/status`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.phase) {
            setSession((s) => ({
              ...s,
              phase: data.phase !== s.phase ? data.phase : s.phase,
              exports: data.exports ?? s.exports,
              planName: data.plan_name ?? s.planName,
              error: data.error,
              exportDownloaded: data.export_downloaded || s.exportDownloaded,
              exportsGeneratedAt: data.exports_generated_at ?? s.exportsGeneratedAt,
            }));
            if (data.calibration) setSavedCalibration(data.calibration as CalibrationData);
          }
        } catch {}
      }, 3000);
    } else {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [session.phase, session.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reexport completion polling (2s interval, 120s hard timeout)
  useEffect(() => {
    if (!isReexporting || !session.slug) return;
    const slug = session.slug;

    const timeout = setTimeout(() => {
      setIsReexporting(false);
      setReexportMessage("היצוא לקח יותר מ-120 שניות — בדוק את הלוגים בתיקיית הריצה ונסה שוב.");
    }, 120_000);
    reexportTimeoutRef.current = timeout;

    const interval = setInterval(async () => {
      try {
        const res = await authedFetch(`/api/plan-scanner/run/${slug}/status`);
        if (!res.ok) return;
        const data = await res.json();
        const newGenAt: string | undefined = data.exports_generated_at;
        if (newGenAt && lastExportsGenAt.current && newGenAt !== lastExportsGenAt.current) {
          clearTimeout(timeout);
          setIsReexporting(false);
          setSession((s) => ({ ...s, exports: data.exports ?? s.exports, exportsGeneratedAt: newGenAt }));
          lastExportsGenAt.current = newGenAt;
        } else if (newGenAt && !lastExportsGenAt.current) {
          lastExportsGenAt.current = newGenAt;
        }
      } catch {}
    }, 2000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isReexporting, session.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leave guard — active whenever there is a scan with unsaved data
  const hasActiveScan = session.phase !== "idle" && session.phase !== "source_deleted";

  const handleDiscard = useCallback(() => {
    const { slug } = sessionRef.current;
    if (slug) {
      // Best-effort cleanup before navigation
      getToken().then((token) => {
        if (token) {
          fetch(`/api/plan-scanner/run/${slug}/cleanup`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      });
    }
    setSession({ phase: "idle" });
  }, []);

  useDirtyGuard({
    isDirty: hasActiveScan,
    onSaveDraft: async () => {
      // No-op: navigation proceeds, user should download exports manually first
    },
    onDiscard: handleDiscard,
    modalOverride: {
      title: "האם לצאת מסורק התוכניות?",
      subtitle: "קובץ התוכנית ונתוני הסריקה לא ישמרו. ודא שהורדת את הדוחות לפני היציאה.",
      saveDraftLabel: "הישאר בעמוד",
      discardLabel: "צא ומחק את נתוני הסריקה",
      hideSaveDraft: false,
    },
  });

  // Auth loading
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  // Access guard
  const canAccess = !!profile && canAccessTab(profile, "plan-scanner");
  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <ShieldAlert className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-lg font-bold text-gray-700">אין לך הרשאה לצפות בעמוד זה</p>
          <p className="text-sm text-gray-400">פנה למנהל המערכת לקבלת גישה</p>
        </div>
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleFileSelected(file: File) {
    setSession({ phase: "uploading" });

    if (file.type !== "application/pdf") {
      setSession({ phase: "failed", error: `קובץ לא נתמך: ${file.type}. נדרש PDF בלבד.` });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setSession({ phase: "failed", error: `קובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(1)} MB). מקסימום: 50 MB` });
      return;
    }

    try {
      const token = await getToken();
      if (!token) throw new Error("לא מחובר");

      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/plan-scanner/intake", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `שגיאת שרת ${res.status}`);
      }

      const { slug, planName } = await res.json();
      setSession({ phase: "intake_created", slug, planName });
    } catch (err) {
      setSession({ phase: "failed", error: err instanceof Error ? err.message : "שגיאה בהעלאה" });
    }
  }

  async function handleStartScan() {
    const { slug } = session;
    if (!slug) return;

    try {
      const res = await authedFetch(`/api/plan-scanner/run/${slug}/start`, { method: "POST" });
      const data = await res.json();

      if (data.status === "execution_not_supported") {
        setSession((s) => ({
          ...s,
          executionMessage: data.message,
          manualCommand: data.manual_command,
          // Stay in intake_created so user can see the manual command
        }));
        return;
      }

      if (data.status === "started" || data.status === "already_running_or_done") {
        setSession((s) => ({ ...s, phase: "running", executionMessage: undefined }));
      }
    } catch (err) {
      setSession((s) => ({ ...s, error: err instanceof Error ? err.message : "שגיאה" }));
    }
  }

  async function handleDownload(filename: string) {
    const { slug } = session;
    if (!slug) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/plan-scanner/run/${slug}/export/${encodeURIComponent(filename)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      // Optimistic client-side mark; server also persists via markExportDownloaded side-effect
      setSession((s) => ({ ...s, exportDownloaded: true }));
    } catch {}
  }

  async function handleRetry() {
    const { slug, planName } = session;
    if (!slug) { handleReset(); return; }
    // Re-attempt pipeline start without re-uploading
    setSession((s) => ({ ...s, phase: "intake_created", error: undefined, executionMessage: undefined }));
    try {
      const res = await authedFetch(`/api/plan-scanner/run/${slug}/start`, { method: "POST" });
      const data = await res.json();
      if (data.status === "execution_not_supported") {
        setSession((s) => ({
          ...s,
          executionMessage: data.message,
          manualCommand: data.manual_command,
        }));
        return;
      }
      if (data.status === "started" || data.status === "already_running_or_done") {
        setSession({ phase: "running", slug, planName });
      }
    } catch (err) {
      setSession((s) => ({ ...s, phase: "failed", error: err instanceof Error ? err.message : "שגיאה" }));
    }
  }

  async function handleSaveCalibration(acknowledgesMissingScale = false) {
    const { slug } = session;
    if (!slug) return;
    setCalibrationSaving(true);
    setCalibrationError(null);
    setCalibrationNeedsAck(false);
    setCalibrationAckMessage(null);
    try {
      const body =
        calibrationMethod === "direct_ratio"
          ? {
              calibration_method: "direct_ratio",
              scale_ratio: parseFloat(scaleRatioInput),
              notes: calibrationNotes,
              ...(acknowledgesMissingScale ? { acknowledge_missing_scale: true } : {}),
            }
          : {
              calibration_method: "two_point",
              known_m: parseFloat(knownMInput),
              measured_m: parseFloat(measuredMInput),
              notes: calibrationNotes,
            };
      const res = await authedFetch(`/api/plan-scanner/run/${slug}/calibrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      // Server returns HTTP 200 with ok:false for recoverable warnings
      if (!res.ok) {
        setCalibrationError(data.error ?? "שגיאה בשמירת הכיול");
        return;
      }
      if (data.ok === false && data.warning === "original_scale_not_found") {
        setCalibrationNeedsAck(true);
        setCalibrationAckMessage(data.warning_message ?? "קנה המידה המקורי אינו זמין — הכמויות לא ישתנו, רק מטא-דאטא יעודכן.");
        return;
      }
      setSavedCalibration(data.calibration as CalibrationData);
    } catch (err) {
      setCalibrationError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setCalibrationSaving(false);
    }
  }

  async function handleReexport() {
    const { slug } = session;
    if (!slug) return;
    setReexportMessage(null);
    // Capture current exports_generated_at so polling can detect change
    try {
      const statusRes = await authedFetch(`/api/plan-scanner/run/${slug}/status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        lastExportsGenAt.current = statusData.exports_generated_at;
      }
    } catch {}
    setIsReexporting(true);
    try {
      const res = await authedFetch(`/api/plan-scanner/run/${slug}/reexport`, { method: "POST" });
      const data = await res.json();
      if (data.status === "execution_not_supported") {
        setReexportMessage(`${data.message}\n\nהפעל ידנית: ${data.manual_command}`);
        setIsReexporting(false);
        return;
      }
      if (!res.ok) {
        setReexportMessage(data.error ?? "שגיאה");
        setIsReexporting(false);
      }
      // status === "started" — polling effect will detect completion
    } catch (err) {
      setReexportMessage(err instanceof Error ? err.message : "שגיאה");
      setIsReexporting(false);
    }
  }

  async function handleCleanup() {
    const { slug } = session;
    if (!slug) return;
    try {
      const res = await authedFetch(`/api/plan-scanner/run/${slug}/cleanup`, { method: "POST" });
      if (res.ok) {
        setSession((s) => ({ ...s, phase: "source_deleted" }));
      }
    } catch {}
  }

  function handleReset() {
    setSession({ phase: "idle" });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const { phase } = session;

  return (
    <div className="min-h-screen p-5 md:p-8" style={{ backgroundColor: "#f4f4f5", direction: "rtl" }}>
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="rounded-xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1a2d4a 100%)` }}>
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
              <ScanText className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl font-black">סורק תוכניות</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: EK_GOLD, color: NAVY }}>
                  BETA · פנימי
                </span>
              </div>
              <p className="text-sm opacity-70">
                סריקת תוכניות PDF · חילוץ כמויות · דוח עבודה · ייצוא Excel — כלי ניתוח זמני פנימי
              </p>
              <p className="text-xs opacity-50 mt-1">
                קובץ המקור הוא קלט זמני בלבד · הדוחות המיוצאים הם המוצר הסופי · לא ארכיון · לא מאושר לביצוע
              </p>
            </div>
          </div>
        </div>

        {/* Stepper */}
        <Stepper phase={phase} />

        {/* Phase: idle / uploading */}
        {(phase === "idle" || phase === "uploading") && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-base font-bold mb-3" style={{ color: NAVY }}>העלאת תוכנית PDF</h2>
            <UploadZone onFile={handleFileSelected} uploading={phase === "uploading"} />
          </div>
        )}

        {/* Phase: intake_created */}
        {phase === "intake_created" && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">קובץ הועלה בהצלחה</p>
                <p className="text-xs text-gray-500 mt-0.5">{session.planName} · ממתין להפעלת סריקה</p>
              </div>
            </div>

            {session.executionMessage && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <Terminal className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-800 mb-1">{session.executionMessage}</p>
                    <p className="text-xs text-amber-700 mb-2">הפעל ידנית מהטרמינל:</p>
                    <code className="block text-[10px] bg-amber-100 rounded p-2 text-amber-900 break-all whitespace-pre-wrap leading-relaxed">
                      {session.manualCommand}
                    </code>
                    <p className="text-[10px] text-amber-600 mt-1.5">לאחר הרצה, לחץ על ״בדוק סטטוס״ לטעינת התוצאות.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleStartScan}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: EK_BLUE }}
              >
                <ScanText className="w-4 h-4" />
                הפעל סריקה
              </button>
              {session.slug && (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await authedFetch(`/api/plan-scanner/run/${session.slug}/status`);
                    const data = await res.json();
                    if (data.phase) setSession((s) => ({ ...s, phase: data.phase, exports: data.exports }));
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 bg-white"
                >
                  בדוק סטטוס
                </button>
              )}
            </div>
          </div>
        )}

        {/* Phase: running */}
        {phase === "running" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: `${EK_BLUE}15` }}>
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: EK_BLUE }} />
            </div>
            <div>
              <p className="text-base font-bold text-gray-800">סריקה מתבצעת...</p>
              <p className="text-sm text-gray-500 mt-1">{session.planName ?? "תוכנית"}</p>
              <p className="text-xs text-gray-400 mt-2">הניתוח עשוי לקחת מספר דקות. הדף יתעדכן אוטומטית.</p>
            </div>
          </div>
        )}

        {/* Phase: outputs_generated or source_deleted */}
        {(phase === "outputs_generated" || phase === "source_deleted") && (
          <div className="space-y-4">
            {/* Results summary */}
            <div className="bg-white rounded-xl border border-green-200 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-gray-800">סריקה הושלמה</p>
                  <p className="text-xs text-gray-500">{session.planName} · כל הכמויות הן טיוטה בלבד</p>
                </div>
              </div>
              {phase === "source_deleted" && (
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>קובץ המקור נמחק — הדוחות נשמרו</span>
                </div>
              )}
            </div>

            {/* Export cards */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-base font-bold mb-3" style={{ color: NAVY }}>הורדת דוחות</h2>
              <p className="text-xs text-gray-400 mb-3">
                כל הדוחות הם טיוטה — נדרש אישור אנושי לפני שימוש מבצעי
              </p>
              <div className="space-y-2">
                {(session.exports ?? []).filter((e) => e.exists).map((entry) => (
                  <ExportCard key={entry.filename} entry={entry} onDownload={handleDownload} />
                ))}
                {(session.exports ?? []).filter((e) => e.exists).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">אין קבצים זמינים להורדה</p>
                )}
              </div>
            </div>

            {/* Scale calibration */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Ruler className="w-5 h-5 shrink-0 mt-0.5" style={{ color: EK_BLUE }} />
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800 mb-1">כיול קנה מידה</p>
                  <p className="text-xs text-gray-500 mb-3">
                    כמויות המרחק בדוח מבוססות על קנה מידה שחושב אוטומטית ואינו מאומת.
                    הזן את קנה המידה הנכון — הדוח יחושב מחדש.
                  </p>

                  {savedCalibration && (
                    <div className="mb-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                      <p className="text-xs text-green-700 font-semibold">
                        ✓ כיול נשמר — גורם תיקון: {savedCalibration.correction_factor.toFixed(4)}
                        {savedCalibration.scale_ratio_new != null
                          ? ` · קנה מידה חדש 1:${Math.round(savedCalibration.scale_ratio_new)}`
                          : " · קנה מידה חדש לא ידוע (שיטת שני נקודות)"}
                      </p>
                    </div>
                  )}

                  {/* Method tabs */}
                  <div className="flex gap-2 mb-3">
                    {(["direct_ratio", "two_point"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCalibrationMethod(m)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                        style={calibrationMethod === m ? { backgroundColor: EK_BLUE, color: "#fff", borderColor: "transparent" } : { borderColor: "#d1d5db", color: "#374151" }}
                      >
                        {m === "direct_ratio" ? "קנה מידה ישיר" : "שני נקודות"}
                      </button>
                    ))}
                  </div>

                  {calibrationMethod === "direct_ratio" ? (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-600 mb-1">קנה מידה (למשל: 500 עבור 1:500)</label>
                      <input
                        type="number"
                        value={scaleRatioInput}
                        onChange={(e) => setScaleRatioInput(e.target.value)}
                        placeholder="500"
                        min="1"
                        className="w-40 text-xs rounded-lg border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-1"
                        style={{ "--tw-ring-color": EK_BLUE } as React.CSSProperties}
                      />
                      <p className="text-[10px] text-gray-400 mt-1">הזן את מספר קנה המידה מהכיתוב בתוכנית</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-600 mb-1">מרחק ידוע (מטר)</label>
                          <input
                            type="number"
                            value={knownMInput}
                            onChange={(e) => setKnownMInput(e.target.value)}
                            placeholder="100"
                            min="0.01"
                            className="w-full text-xs rounded-lg border border-gray-300 px-3 py-1.5 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-600 mb-1">ערך שהדוח מציג (מטר)</label>
                          <input
                            type="number"
                            value={measuredMInput}
                            onChange={(e) => setMeasuredMInput(e.target.value)}
                            placeholder="120"
                            min="0.01"
                            className="w-full text-xs rounded-lg border border-gray-300 px-3 py-1.5 focus:outline-none"
                          />
                        </div>
                      </div>
                      {knownMInput && measuredMInput && parseFloat(measuredMInput) > 0 && (
                        <p className="text-[10px] text-gray-500">
                          גורם תיקון = {parseFloat(knownMInput).toFixed(2)} ÷ {parseFloat(measuredMInput).toFixed(2)} = {(parseFloat(knownMInput) / parseFloat(measuredMInput)).toFixed(4)}
                        </p>
                      )}
                    </div>
                  )}

                  {calibrationError && (
                    <p className="text-xs text-red-600 mt-2">{calibrationError}</p>
                  )}

                  {/* Missing-scale acknowledge gate */}
                  {calibrationNeedsAck && calibrationAckMessage && (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                      <p className="text-xs text-amber-800 font-semibold">⚠ קנה המידה המקורי אינו זמין</p>
                      <p className="text-[10px] text-amber-700 leading-relaxed">{calibrationAckMessage}</p>
                      <button
                        type="button"
                        onClick={() => handleSaveCalibration(true)}
                        disabled={calibrationSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-400 text-amber-900 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                      >
                        {calibrationSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        אשר וכיול (ללא תיקון כמויות)
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => handleSaveCalibration(false)}
                      disabled={calibrationSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: EK_BLUE }}
                    >
                      {calibrationSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ruler className="w-3.5 h-3.5" />}
                      שמור כיול
                    </button>

                    {savedCalibration && (
                      <button
                        type="button"
                        onClick={handleReexport}
                        disabled={isReexporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 disabled:opacity-50"
                      >
                        {isReexporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        {isReexporting ? "מייצא מחדש..." : "יצא מחדש עם כיול"}
                      </button>
                    )}
                  </div>

                  {reexportMessage && (
                    <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2">
                      <p className="text-[10px] text-amber-800 break-all whitespace-pre-wrap">{reexportMessage}</p>
                    </div>
                  )}

                  <p className="text-[10px] text-gray-400 mt-2">
                    ⚠ הכיול מעדכן את כמויות הכמות בדוח אך לא מאשר אותן לביצוע — כל הפלטים נשארים כטיוטה
                  </p>
                </div>
              </div>
            </div>

            {/* Export-not-yet-downloaded nudge */}
            {phase === "outputs_generated" && !session.exportDownloaded && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                <Download className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <strong>טרם הורדת דוח.</strong> הורד לפחות קובץ אחד לפני מחיקת קובץ המקור.
                </p>
              </div>
            )}

            {/* Cleanup */}
            {phase === "outputs_generated" && (
              <div className="bg-white rounded-xl border border-red-100 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Trash2 className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-800">מחיקת קובץ המקור</p>
                    <p className="text-xs text-gray-500 mt-1">
                      קובץ ה-PDF המקורי הוא קלט זמני בלבד. לאחר הורדת הדוחות, מחק אותו.
                      הדוחות יישארו זמינים.
                    </p>
                    <button
                      type="button"
                      onClick={handleCleanup}
                      className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      מחק קובץ PDF מקור
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Phase: failed */}
        {phase === "failed" && (
          <div className="bg-white rounded-xl border border-red-200 p-5 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">שגיאה בתהליך הסריקה</p>
                <p className="text-xs text-gray-500 mt-1">
                  {session.error ?? "הסריקה נכשלה או חרגה מהזמן המוקצב (20 דקות)."}
                </p>
                {session.error?.includes("20") || !session.error ? (
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    הקובץ עדיין קיים — ניתן לנסות שוב ללא העלאה מחדש.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {session.slug && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: EK_BLUE }}
                >
                  <RotateCcw className="w-4 h-4" />
                  נסה שוב
                </button>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                התחל מחדש (העלאה חדשה)
              </button>
            </div>
          </div>
        )}

        {/* Safety panel — always visible when active scan */}
        {hasActiveScan && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-red-700">הצהרת אחריות — טיוטה בלבד</p>
                <ul className="mt-1 space-y-0.5 text-[10px] text-red-600">
                  <li>לא מאושר לביצוע עבודה — כל הכמויות הן טיוטה בלבד</li>
                  <li>נדרש אישור אנושי לכל פריט כמות לפני שימוש מבצעי</li>
                  <li>קנה מידה לא מאומת — מדידות הן הנחה בלבד</li>
                  <li>קובץ המקור הוא קלט זמני — אינו נשמר לצמיתות</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Reset — when outputs or source deleted */}
        {(phase === "outputs_generated" || phase === "source_deleted") && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              סריקה חדשה
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
