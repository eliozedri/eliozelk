"use client";

import { useState, useCallback } from "react";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import type { WorkDiary } from "@/types/workDiary";
import { TabBar, type DiaryTab } from "./TabBar";
import { DiaryHeader } from "./DiaryHeader";
import { PaintingTab } from "./PaintingTab";
import { PolesSignsTab } from "./PolesSignsTab";
import { DocumentTab } from "./DocumentTab";
import { DiaryActions } from "./DiaryActions";
import { exportWorkDiaryPDF, openEmailDraft } from "@/lib/workDiaryExport";

function DiaryIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-8 h-8 text-blue-600"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function WorkDiaryForm() {
  const { createDiary, saveDiary, submitDiary } = useWorkDiaryContext();
  const [diary, setDiary] = useState<WorkDiary | null>(null);
  const [activeTab, setActiveTab] = useState<DiaryTab>("header");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleNew() {
    const d = createDiary();
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
    saveDiary(diary);
    submitDiary(diary.id);
    const submitted = { ...diary, status: "submitted" as const, submittedAt: new Date().toISOString() };
    setDiary(submitted);
    setSuccessMessage(
      `יומן עבודה ${diary.diaryNumber} נשלח בהצלחה ותויק בהנהלת חשבונות.`
    );
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

  // ── Landing ──────────────────────────────────────────────
  if (!diary) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="flex justify-center mb-5">
            <DiaryIcon className="w-14 h-14 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">יומן עבודה</h1>
          <p className="text-sm text-gray-500 mb-8 leading-relaxed">
            תיעוד דיגיטלי של עבודת שטח — כמויות, צוות, חתימות ותמונות
          </p>
          <button
            type="button"
            onClick={handleNew}
            className="px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-colors shadow-sm"
          >
            + יומן עבודה חדש
          </button>
        </div>
      </div>
    );
  }

  const disabled = diary.status === "submitted";

  return (
    <div className="min-h-screen bg-[#f0f2f5] pb-24">
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
            <div className="mr-auto bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg max-w-sm">
              {successMessage}
            </div>
          )}
          {!successMessage && (
            <button
              type="button"
              onClick={() => {
                setDiary(null);
                setSuccessMessage(null);
              }}
              className="mr-auto text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
            >
              ← חזור
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto">
        <TabBar active={activeTab} onChange={setActiveTab} />

        <div className="p-4">
          {activeTab === "header" && (
            <DiaryHeader
              diary={diary}
              onChange={handleChange}
              disabled={disabled}
            />
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
            />
          )}
        </div>
      </div>

      <DiaryActions
        status={diary.status}
        diaryNumber={diary.diaryNumber}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmit}
        onExportPDF={handleExportPDF}
        onEmail={handleEmail}
        saving={saving}
        exporting={exporting}
      />
    </div>
  );
}
