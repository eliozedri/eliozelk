"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { useAuth } from "@/context/AuthContext";
import { useCostRatesContext } from "@/context/CostRatesContext";
import type { WorkDiary } from "@/types/workDiary";
import { DIARY_STATUS_LABELS, DIARY_STATUS_COLORS } from "@/types/workDiary";
import { calculateProfitability, STATUS_LABELS, STATUS_COLORS, STATUS_DOT } from "@/lib/profitability";
import { TabBar, type DiaryTab } from "./TabBar";
import { DiaryHeader } from "./DiaryHeader";
import { PaintingTab } from "./PaintingTab";
import { PolesSignsTab } from "./PolesSignsTab";
import { DocumentTab } from "./DocumentTab";
import { DiaryActions } from "./DiaryActions";
import { ProfitabilityPanel } from "./ProfitabilityPanel";
import { exportWorkDiaryPDF, openEmailDraft } from "@/lib/workDiaryExport";

function DiaryIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-8 h-8 text-blue-600"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ── Diary list row ────────────────────────────────────────────────────────────

interface DiaryRowProps {
  diary: WorkDiary;
  profitStatus: string;
  profitColors: string;
  dotColor: string;
  netProfit: number;
  onOpen: () => void;
  onDelete: () => void;
}

function DiaryRow({ diary, profitStatus, profitColors, dotColor, netProfit, onOpen, onDelete }: DiaryRowProps) {
  function formatDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00").toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer group"
      onClick={onOpen}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{diary.diaryNumber}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${DIARY_STATUS_COLORS[diary.status]}`}>
            {DIARY_STATUS_LABELS[diary.status]}
          </span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${profitColors}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {profitStatus}
          </span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">
          {diary.customerName || "ללא לקוח"}{diary.siteName ? ` · ${diary.siteName}` : ""}
        </div>
      </div>
      <div className="text-xs text-gray-400 shrink-0 text-left">
        {formatDate(diary.executionDate)}
      </div>
      {diary.billedAmount != null && (
        <div className={`text-xs font-bold shrink-0 ${netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
          {netProfit >= 0 ? "+" : ""}₪{Math.round(Math.abs(netProfit)).toLocaleString("he-IL")}
        </div>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (confirm("מחוק יומן זה?")) onDelete(); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1 rounded"
        title="מחק יומן"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
        </svg>
      </button>
      <svg className="w-4 h-4 text-gray-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DiaryListView({ onNew, onOpen }: { onNew: () => void; onOpen: (d: WorkDiary) => void }) {
  const { diaries, deleteDiary } = useWorkDiaryContext();
  const { rates } = useCostRatesContext();

  const rows = useMemo(() =>
    diaries.map((d) => {
      const r = calculateProfitability(d, rates);
      return {
        diary: d,
        profitStatus: STATUS_LABELS[r.status],
        profitColors: STATUS_COLORS[r.status],
        dotColor: STATUS_DOT[r.status],
        netProfit: r.netProfit,
      };
    }), [diaries, rates]);

  const sorted = useMemo(() =>
    [...rows].sort((a, b) => {
      const ad = a.diary.executionDate || a.diary.createdAt;
      const bd = b.diary.executionDate || b.diary.createdAt;
      return bd.localeCompare(ad);
    }), [rows]);

  return (
    <div className="min-h-screen bg-surface pb-10">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DiaryIcon className="w-7 h-7 text-blue-600 shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">יומן עבודה</h1>
              <p className="text-xs text-gray-400">{diaries.length} יומנים שמורים</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <PlusIcon />
            יומן חדש
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-w-3xl mx-auto mt-4 px-4">
        {sorted.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <DiaryIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium mb-1">אין יומנים שמורים</p>
            <p className="text-xs text-gray-400 mb-6">צור יומן עבודה חדש לתיעוד עבודת השטח</p>
            <button
              type="button"
              onClick={onNew}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
            >
              + יומן עבודה חדש
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">יומנים</span>
              <span className="text-xs text-gray-400">{sorted.length} יומנים</span>
            </div>
            {sorted.map((row) => (
              <DiaryRow
                key={row.diary.id}
                diary={row.diary}
                profitStatus={row.profitStatus}
                profitColors={row.profitColors}
                dotColor={row.dotColor}
                netProfit={row.netProfit}
                onOpen={() => onOpen(row.diary)}
                onDelete={() => deleteDiary(row.diary.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Form view ─────────────────────────────────────────────────────────────────

export function WorkDiaryForm() {
  const { createDiary, saveDiary, submitDiary, approveDiary, rejectDiary } = useWorkDiaryContext();
  const { profile } = useAuth();
  const canApprove = profile?.role === "master" || profile?.role === "office_manager";
  const [diary, setDiary] = useState<WorkDiary | null>(null);
  const [activeTab, setActiveTab] = useState<DiaryTab>("header");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState(false);

  // Auto-open a blank diary on mount — this page is a form, not a list
  useEffect(() => {
    let cancelled = false;
    createDiary().then((d) => {
      if (!cancelled) { setDiary(d); setActiveTab("header"); }
    });
    return () => { cancelled = true; };
  }, [createDiary]);

  async function handleNew() {
    const d = await createDiary();
    setDiary(d);
    setActiveTab("header");
    setSuccessMessage(null);
  }

  const handleChange = useCallback((partial: Partial<WorkDiary>) => {
    setDiary((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  function handleSaveDraft() {
    if (!diary) return;
    setSaving(true);
    saveDiary(diary);
    setTimeout(() => setSaving(false), 600);
  }

  function handleSubmit() {
    if (!diary) return;
    if (!diary.customerName.trim() || !diary.siteName.trim() || !diary.executionDate) {
      alert("נא למלא שם קבלן, אתר עבודה ותאריך ביצוע לפני השליחה.");
      setActiveTab("header");
      return;
    }
    if (!diary.customerSignature?.dataUrl) {
      setSignatureError(true);
      setActiveTab("docs");
      return;
    }
    setSignatureError(false);
    saveDiary(diary);
    submitDiary(diary.id);
    const submitted = { ...diary, status: "submitted" as const, submittedAt: new Date().toISOString() };
    setDiary(submitted);
    setSuccessMessage(`יומן עבודה ${diary.diaryNumber} נשלח בהצלחה ותויק בהנהלת חשבונות.`);
  }

  async function handleExportPDF() {
    if (!diary) return;
    setExporting(true);
    try {
      await exportWorkDiaryPDF(diary);
    } finally {
      setExporting(false);
    }
  }

  async function handleEmail() {
    if (!diary) return;
    await handleExportPDF();
    openEmailDraft(diary);
  }

  // Loading state while the first diary is being created
  if (!diary) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <DiaryIcon className="w-10 h-10 text-blue-300 mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-gray-400">פותח יומן עבודה...</p>
        </div>
      </div>
    );
  }

  const disabled = diary.status === "submitted";

  return (
    <div className="min-h-screen bg-surface pb-24">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 no-print">
        <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
          <DiaryIcon className="w-7 h-7 text-blue-600 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">יומן עבודה</h1>
            <p className="text-xs text-gray-400">
              {diary.diaryNumber}
              {diary.customerName ? ` · ${diary.customerName}` : ""}
              {diary.executionDate ? ` · ${diary.executionDate}` : ""}
            </p>
          </div>
          {successMessage && (
            <div className="mr-auto flex items-center gap-3 flex-wrap">
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">
                {successMessage}
              </div>
              <button
                type="button"
                onClick={handleNew}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm whitespace-nowrap"
              >
                <PlusIcon />
                יומן חדש
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto">
        <TabBar active={activeTab} onChange={setActiveTab} />

        <div className="p-4">
          {activeTab === "header" && (
            <DiaryHeader diary={diary} onChange={handleChange} disabled={disabled} />
          )}
          {activeTab === "painting" && (
            <PaintingTab
              items={diary.paintingItems}
              onChange={(paintingItems) => handleChange({ paintingItems })}
              disabled={disabled}
            />
          )}
          {activeTab === "poles" && (
            <PolesSignsTab
              poleItems={diary.poleItems}
              signItems={diary.signItems}
              onPolesChange={(poleItems) => handleChange({ poleItems })}
              onSignsChange={(signItems) => handleChange({ signItems })}
              disabled={disabled}
            />
          )}
          {activeTab === "docs" && (
            <DocumentTab
              diary={diary}
              onChange={handleChange}
              disabled={disabled}
              signatureError={signatureError}
              onSignatureChange={() => setSignatureError(false)}
            />
          )}
          {activeTab === "profitability" && (
            <ProfitabilityPanel diary={diary} />
          )}

        </div>
      </div>

      <DiaryActions
        status={diary.status}
        diaryNumber={diary.diaryNumber}
        approvalStatus={diary.approvalStatus}
        approvedBy={diary.approvedBy}
        rejectionReason={diary.rejectionReason}
        canApprove={canApprove}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmit}
        onExportPDF={handleExportPDF}
        onEmail={handleEmail}
        onApprove={() => {
          if (!diary || !profile) return;
          approveDiary(diary.id, profile.name);
          setDiary(prev => prev ? { ...prev, approvalStatus: "approved", approvedBy: profile.name } : prev);
        }}
        onReject={(reason) => {
          if (!diary) return;
          rejectDiary(diary.id, reason);
          setDiary(prev => prev ? { ...prev, approvalStatus: "rejected", rejectionReason: reason } : prev);
        }}
        saving={saving}
        exporting={exporting}
      />
    </div>
  );
}
