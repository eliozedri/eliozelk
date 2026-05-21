"use client";

import {
  ScanText, Upload, FileSpreadsheet, Globe, Printer,
  Package, AlertTriangle, CheckCircle, Clock, ChevronLeft,
  Info, ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { canAccessTab } from "@/types/auth";

const NAVY    = "#0d1b2e";
const EK_BLUE = "#1d6fd8";
const EK_GOLD = "#f59e0b";

// ── Small reusable UI atoms ────────────────────────────────────────────────────

function Badge({
  label,
  color,
}: {
  label: string;
  color: "amber" | "red" | "blue" | "gray" | "teal";
}) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    amber: { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
    red:   { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
    blue:  { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
    gray:  { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" },
    teal:  { bg: "#ccfbf1", text: "#134e4a", border: "#5eead4" },
  };
  const { bg, text, border } = map[color];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide"
      style={{ backgroundColor: bg, color: text, border: `1px solid ${border}` }}
    >
      {label}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-bold mb-3" style={{ color: NAVY }}>
      {children}
    </h2>
  );
}

// ── Step indicators ────────────────────────────────────────────────────────────

const FLOW_STEPS = [
  { num: 1, label: "העלאת תוכנית",         sub: "PDF זמני בלבד" },
  { num: 2, label: "סריקה",                sub: "ניתוח וקטורי" },
  { num: 3, label: "מדידות / תמרורים / אלמנטים", sub: "זיהוי וכמות" },
  { num: 4, label: "שאלות לבדיקה",         sub: "אישור אנושי" },
  { num: 5, label: "יצוא",                 sub: "Excel / HTML / PDF" },
  { num: 6, label: "ניקוי קובץ מקור",      sub: "ברירת מחדל" },
];

function FlowStep({ num, label, sub, isLast }: { num: number; label: string; sub: string; isLast: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ backgroundColor: EK_BLUE }}
        >
          {num}
        </div>
        {!isLast && <div className="w-px flex-1 mt-1" style={{ backgroundColor: "#e5e7eb", minHeight: 24 }} />}
      </div>
      <div className="pb-4">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

// ── Export placeholder cards ───────────────────────────────────────────────────

const EXPORT_CARDS = [
  {
    icon: <Globe className="w-5 h-5" />,
    title: "דוח עבודה HTML",
    sub: "פתיחה בדפדפן / הדפסה",
    color: EK_BLUE,
  },
  {
    icon: <FileSpreadsheet className="w-5 h-5" />,
    title: "Excel כמויות",
    sub: "10 גיליונות — BOQ / תמרורים / מדידות",
    color: "#16a34a",
  },
  {
    icon: <Printer className="w-5 h-5" />,
    title: "PDF להדפסה",
    sub: "Cmd+P → Save as PDF",
    color: "#7c3aed",
  },
  {
    icon: <Package className="w-5 h-5" />,
    title: "חבילת Audit JSON",
    sub: "manifest + pipeline summary",
    color: "#d97706",
  },
];

function ExportCard({
  icon,
  title,
  sub,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 opacity-60 cursor-not-allowed select-none"
      title="יתחבר בשלב הבא"
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white"
        style={{ backgroundColor: color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-700 truncate">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        <p className="text-[10px] mt-1 font-medium" style={{ color: EK_GOLD }}>
          יתחבר בשלב הבא
        </p>
      </div>
    </div>
  );
}

// ── Safety row ─────────────────────────────────────────────────────────────────

function SafetyRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-red-700">
      <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
      <span>{text}</span>
    </li>
  );
}

// ── Main page component ────────────────────────────────────────────────────────

export default function PlanScannerPage() {
  const { profile, loading: authLoading } = useAuth();

  // Loading state
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-gray-400">טוען...</p>
      </div>
    );
  }

  // Access guard — same pattern as AccessManager
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

  return (
    <div
      className="min-h-screen p-5 md:p-8"
      style={{ backgroundColor: "#f4f4f5", direction: "rtl" }}
    >
      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── Header ───────────────────────────────────────────────────────────── */}
        <div
          className="rounded-xl p-6 text-white"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1a2d4a 100%)` }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
            >
              <ScanText className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl font-black">סורק תוכניות</h1>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                  style={{ backgroundColor: EK_GOLD, color: NAVY }}
                >
                  BETA · פנימי
                </span>
              </div>
              <p className="text-sm opacity-75 mb-3">
                העלאת תוכנית PDF, סריקה, הפקת דוח עבודה וכתב כמויות — גרסת בטא פנימית
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge label="טיוטה — Draft" color="amber" />
                <Badge label="דורש סקירה" color="red" />
                <Badge label="לא מאושר לביצוע" color="red" />
                <Badge label="גישה פנימית בלבד" color="gray" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Scanner-not-archive notice ────────────────────────────────────────── */}
        <Card>
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 mt-0.5 shrink-0" style={{ color: EK_BLUE }} />
            <div>
              <SectionTitle>קבצי מקור הם קלט זמני — לא ארכיון</SectionTitle>
              <p className="text-sm text-gray-600 leading-relaxed">
                סורק התוכניות <strong>אינו</strong> מאחסן תוכניות PDF לצמיתות.
                קובץ ה-PDF הוא קלט ביניים זמני בלבד.
              </p>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                <strong>המוצר הסופי</strong> הוא הדוחות המיוצאים:{" "}
                <span className="font-semibold text-gray-800">
                  דוח HTML · Excel כמויות · JSON
                </span>
                {" "}— ועתידית PDF.
              </p>
              <ul className="mt-3 space-y-1 text-sm text-gray-600 list-none">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-green-500" />
                  ברירת מחדל: קובץ המקור נמחק לאחר הסריקה
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-green-500" />
                  הדוחות המיוצאים נשמרים לאחר מחיקת המקור
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0 text-amber-500" />
                  שמירת קובץ המקור דורשת בחירה מפורשת
                </li>
              </ul>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* ── Upload placeholder ────────────────────────────────────────────────── */}
          <Card>
            <SectionTitle>העלאת תוכנית PDF</SectionTitle>
            <div
              className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 flex flex-col items-center justify-center text-center gap-3 cursor-not-allowed opacity-60"
              title="יתחבר בשלב הבא"
            >
              <Upload className="w-10 h-10 text-gray-400" />
              <div>
                <p className="text-sm font-semibold text-gray-600">
                  העלאת PDF — יתחבר בשלב הבא
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  קבצי PDF בלבד · מגבלת גודל להגדרה
                </p>
              </div>
              <span
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold text-white opacity-50 cursor-not-allowed"
                style={{ backgroundColor: EK_BLUE }}
              >
                בחר קובץ PDF
              </span>
              <p className="text-[10px] text-amber-600 font-medium">
                ⚠ לא מחובר עדיין — Slice B
              </p>
            </div>
          </Card>

          {/* ── Flow preview ──────────────────────────────────────────────────────── */}
          <Card>
            <SectionTitle>תהליך הסריקה</SectionTitle>
            <div className="mt-1">
              {FLOW_STEPS.map((step, i) => (
                <FlowStep
                  key={step.num}
                  num={step.num}
                  label={step.label}
                  sub={step.sub}
                  isLast={i === FLOW_STEPS.length - 1}
                />
              ))}
            </div>
          </Card>
        </div>

        {/* ── Export preview cards ──────────────────────────────────────────────── */}
        <Card>
          <SectionTitle>יצואים עתידיים</SectionTitle>
          <p className="text-xs text-gray-400 mb-4">
            הכפתורים יהיו פעילים לאחר השלמת הסריקה. כל הפלטים הם טיוטה.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXPORT_CARDS.map((c) => (
              <ExportCard key={c.title} icon={c.icon} title={c.title} sub={c.sub} color={c.color} />
            ))}
          </div>
        </Card>

        {/* ── Safety section ────────────────────────────────────────────────────── */}
        <Card className="border-red-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-red-500" />
            <div className="flex-1">
              <SectionTitle>הצהרת אחריות — טיוטה בלבד</SectionTitle>
              <ul className="space-y-2">
                <SafetyRow text="לא מאושר לביצוע עבודה — כל הכמויות הן טיוטה בלבד" />
                <SafetyRow text="לא מאושר לחיוב / חשבון ללא אישור אנושי מפורש" />
                <SafetyRow text="נדרש אישור אנושי לכל פריט כמות לפני שימוש מבצעי" />
                <SafetyRow text="קנה מידה חייב כיול ידני — כל מדידות המטרים הן הנחה" />
                <SafetyRow text="מקור התוכנית הוא קלט זמני — לא ישמר לצמיתות כברירת מחדל" />
              </ul>
            </div>
          </div>
        </Card>

        {/* ── Next implementation note ──────────────────────────────────────────── */}
        <div
          className="rounded-xl border border-dashed p-4 flex items-start gap-3"
          style={{ borderColor: EK_BLUE + "60", backgroundColor: EK_BLUE + "08" }}
        >
          <ChevronLeft className="w-5 h-5 mt-0.5 shrink-0" style={{ color: EK_BLUE }} />
          <div>
            <p className="text-sm font-bold" style={{ color: EK_BLUE }}>
              שלב הבא: Slice B — חיבור upload/run/export backend wrapper
            </p>
            <p className="text-xs text-gray-500 mt-1">
              יחבר את שדה ההעלאה ל-API, יפעיל את הסריקה ברקע, ויחזיר קישורי הורדה לדוחות.
              ללא שינוי DB / ללא API בתשלום / ללא ארכיון PDF קבוע.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
