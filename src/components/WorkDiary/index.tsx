"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { nanoid } from "nanoid";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import { useAuth } from "@/context/AuthContext";
import { useCostRatesContext } from "@/context/CostRatesContext";
import { useDirtyGuard } from "@/context/NavigationGuardContext";
import type { WorkDiary } from "@/types/workDiary";
import { DIARY_STATUS_LABELS, DIARY_STATUS_COLORS, createEmptyDiary } from "@/types/workDiary";
import { calculateProfitability, STATUS_LABELS, STATUS_COLORS, STATUS_DOT } from "@/lib/profitability";
import { TabBar, type DiaryTab } from "./TabBar";
import { DiaryHeader } from "./DiaryHeader";
import { PaintingTab } from "./PaintingTab";
import { PolesSignsTab } from "./PolesSignsTab";
import { DocumentTab } from "./DocumentTab";
import { DiaryActions } from "./DiaryActions";
import { ProfitabilityPanel } from "./ProfitabilityPanel";
import { SecurityTeamsTab } from "./SecurityTeamsTab";
import { AdditionalTeamsTab } from "./AdditionalTeamsTab";
import { PostSubmitBanner } from "./PostSubmitBanner";
import { CustomerEmailDialog } from "./CustomerEmailDialog";
import { exportWorkDiaryPDF } from "@/lib/workDiaryExport";
import { getSupabase } from "@/lib/supabase/client";

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

// ── Saved diaries panel (shown above the new-diary form) ──────────────────────

function SavedDiariesPanel({ onOpen }: { onOpen: (d: WorkDiary) => void }) {
  const { diaries, deleteDiary } = useWorkDiaryContext();
  const { rates } = useCostRatesContext();
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() =>
    diaries
      .filter(d => d.status === "draft" || d.status === "submitted")
      .sort((a, b) => {
        const ad = a.executionDate || a.createdAt;
        const bd = b.executionDate || b.createdAt;
        return bd.localeCompare(ad);
      })
      .slice(0, expanded ? 50 : 5)
      .map((d) => {
        const r = calculateProfitability(d, rates);
        return { diary: d, profitStatus: STATUS_LABELS[r.status], profitColors: STATUS_COLORS[r.status], dotColor: STATUS_DOT[r.status], netProfit: r.netProfit };
      }),
    [diaries, rates, expanded]);

  const total = diaries.filter(d => d.status === "draft" || d.status === "submitted").length;

  if (total === 0) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 mb-4">
      <div className="glass-card overflow-hidden">
        <div
          className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-50"
          onClick={() => setExpanded(e => !e)}
        >
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">יומנים שמורים ({total})</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        {expanded && rows.map((row) => (
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
        {!expanded && (
          <div className="px-4 py-2 text-xs text-gray-400">לחץ להצגת יומנים שמורים</div>
        )}
      </div>
    </div>
  );
}

// ── Local initializer — NO DB write ──────────────────────────────────────────

function createLocalDiary(): WorkDiary {
  const today = new Date().toISOString().split("T")[0];
  return {
    ...createEmptyDiary("—"),            // placeholder number; real one assigned on first save
    id: nanoid(),
    executionDate: today,
    startTime: "",                       // require manual entry (not auto-filled with current time)
    endTime: "",
  };
}

// ── Form view ─────────────────────────────────────────────────────────────────

export function WorkDiaryForm() {
  const { diaries, saveDiary, submitDiary, approveDiary, rejectDiary, deleteDiary } = useWorkDiaryContext();
  const { profile } = useAuth();
  const canApprove = profile?.role === "master" || profile?.role === "office_manager";

  // Local form state — no DB row created on mount
  const [diary, setDiary] = useState<WorkDiary>(createLocalDiary);
  const [activeTab, setActiveTab] = useState<DiaryTab>("header");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  // Track whether this diary has been persisted to DB yet
  const [savedToDB, setSavedToDB] = useState(false);
  // Track dirty state — becomes true as soon as any field is changed
  const [isDirty, setIsDirty] = useState(false);

  const isSubmitted = diary.status === "submitted";

  // ── Generate a real diary number from the DB counter ─────────────────────
  async function assignRealDiaryNumber(localDiary: WorkDiary): Promise<WorkDiary> {
    const db = getSupabase();
    if (!db) return localDiary;
    const { data, error } = await db.rpc("next_counter", { counter_key: "diary" });
    if (!error && data != null) {
      const year = new Date().getFullYear();
      const number = `WD-${year}-${String(data as number).padStart(3, "0")}`;
      return { ...localDiary, diaryNumber: number };
    }
    // Fallback: use max existing + 1
    const year = new Date().getFullYear();
    const prefix = `WD-${year}-`;
    const existing = diaries
      .filter(d => d.diaryNumber.startsWith(prefix))
      .map(d => parseInt(d.diaryNumber.replace(prefix, ""), 10))
      .filter(n => !isNaN(n));
    const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    return { ...localDiary, diaryNumber: `${prefix}${String(next).padStart(3, "0")}` };
  }

  // ── Persist draft (create or update) ─────────────────────────────────────
  async function persistDraft(d: WorkDiary): Promise<WorkDiary> {
    let toSave = d;
    if (!savedToDB) {
      toSave = await assignRealDiaryNumber(d);
    }
    const now = new Date().toISOString();
    const withTimestamp = { ...toSave, updatedAt: now };
    saveDiary(withTimestamp);
    setSavedToDB(true);
    return withTimestamp;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleChange = useCallback((partial: Partial<WorkDiary>) => {
    setDiary((prev) => (prev ? { ...prev, ...partial } : prev));
    setIsDirty(true);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!diary) return;
    setSaving(true);
    try {
      const saved = await persistDraft(diary);
      setDiary(saved);
      setIsDirty(false);
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diary, savedToDB]);

  const handleSaveDraftForGuard = useCallback(async () => {
    await handleSaveDraft();
  }, [handleSaveDraft]);

  const handleDiscardForGuard = useCallback(() => {
    if (savedToDB && diary) {
      deleteDiary(diary.id);
    }
    setDiary(createLocalDiary());
    setIsDirty(false);
    setSavedToDB(false);
  }, [diary, savedToDB, deleteDiary]);

  async function handleSubmit() {
    if (!diary) return;
    if (!diary.customerName.trim() || !diary.siteName.trim() || !diary.executionDate) {
      alert("נא למלא שם קבלן, אתר עבודה ותאריך ביצוע לפני השליחה.");
      setActiveTab("header");
      return;
    }
    if (!diary.companySignature?.dataUrl) {
      setSignatureError(true);
      setActiveTab("docs");
      return;
    }
    setSignatureError(false);

    // Persist to DB first if not already saved
    let toSubmit = diary;
    if (!savedToDB) {
      setSaving(true);
      try {
        toSubmit = await persistDraft(diary);
      } finally {
        setSaving(false);
      }
    }

    // Mark submitted
    const now = new Date().toISOString();
    const submitted: WorkDiary = { ...toSubmit, status: "submitted", submittedAt: now, updatedAt: now };
    saveDiary(submitted);
    submitDiary(toSubmit.id);
    setDiary(submitted);
    setIsDirty(false);
    setSavedToDB(true);
    setSuccessMessage(`יומן עבודה ${toSubmit.diaryNumber} נשלח בהצלחה ותויק בהנהלת חשבונות.`);
  }

  function handleNew() {
    setDiary(createLocalDiary());
    setActiveTab("header");
    setSuccessMessage(null);
    setIsDirty(false);
    setSavedToDB(false);
    setSignatureError(false);
  }

  function handleOpenExisting(existing: WorkDiary) {
    setDiary(existing);
    setActiveTab("header");
    setSuccessMessage(null);
    setIsDirty(false);
    setSavedToDB(true);      // already in DB
    setSignatureError(false);
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

  // ── Draft protection via NavigationGuardContext ───────────────────────────
  // Only guard when the form has dirty unsaved data and is not yet submitted
  const shouldGuard = isDirty && !isSubmitted;

  useDirtyGuard({
    isDirty: shouldGuard,
    onSaveDraft: handleSaveDraftForGuard,
    onDiscard: handleDiscardForGuard,
  });

  const disabled = isSubmitted;

  return (
    <div className="min-h-screen pb-24">
      {/* Page header */}
      <div className="scene-header px-4 py-4 no-print">
        <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
          <DiaryIcon className="w-7 h-7 text-blue-400 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold scene-title">יומן עבודה</h1>
            <p className="text-xs scene-subtitle">
              {diary.diaryNumber !== "—" ? diary.diaryNumber : "יומן חדש"}
              {diary.customerName ? ` · ${diary.customerName}` : ""}
              {diary.executionDate ? ` · ${diary.executionDate}` : ""}
              {isDirty && !isSubmitted && (
                <span className="mr-2 text-amber-600 font-medium">· שינויים לא שמורים</span>
              )}
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
                className="btn-glow text-sm whitespace-nowrap"
              >
                <PlusIcon />
                יומן חדש
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Saved diaries panel — collapsed by default */}
      <SavedDiariesPanel onOpen={handleOpenExisting} />

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
          {activeTab === "security" && (
            <SecurityTeamsTab diary={diary} onChange={handleChange} disabled={disabled} />
          )}
          {activeTab === "additional" && (
            <AdditionalTeamsTab diary={diary} onChange={handleChange} disabled={disabled} />
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

      <PostSubmitBanner
        diary={diary}
        onOpenCustomerDialog={() => setCustomerDialogOpen(true)}
      />
      <CustomerEmailDialog
        diaryId={diary.id}
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
      />

      <DiaryActions
        status={diary.status}
        diaryNumber={diary.diaryNumber !== "—" ? diary.diaryNumber : "יומן חדש"}
        approvalStatus={diary.approvalStatus}
        approvedBy={diary.approvedBy}
        rejectionReason={diary.rejectionReason}
        canApprove={canApprove}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmit}
        onExportPDF={handleExportPDF}
        onApprove={() => {
          if (!diary || !profile || !savedToDB) return;
          approveDiary(diary.id, profile.name);
          setDiary(prev => prev ? { ...prev, approvalStatus: "approved", approvedBy: profile.name } : prev);
        }}
        onReject={(reason) => {
          if (!diary || !savedToDB) return;
          rejectDiary(diary.id, reason);
          setDiary(prev => prev ? { ...prev, approvalStatus: "rejected", rejectionReason: reason } : prev);
        }}
        saving={saving}
        exporting={exporting}
      />
    </div>
  );
}
