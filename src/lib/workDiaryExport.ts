import type { WorkDiary } from "@/types/workDiary";

function csvEscape(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportWorkDiaryCSV(diary: WorkDiary): void {
  const rows: string[] = [];
  rows.push(["# יומן עבודה", diary.diaryNumber].map(csvEscape).join(","));
  rows.push(["# לקוח", diary.customerName].map(csvEscape).join(","));
  rows.push(["# אתר", diary.siteName || ""].map(csvEscape).join(","));
  rows.push(["# תאריך", diary.executionDate].map(csvEscape).join(","));
  rows.push("");

  const paintRows: { label: string; qty: number | string; unit: string }[] = [];
  if ((diary as { paintingItems?: { description?: string; quantity?: string | number; unit?: string }[] }).paintingItems) {
    for (const item of (diary as { paintingItems: { description?: string; quantity?: string | number; unit?: string }[] }).paintingItems) {
      if (item.description) paintRows.push({ label: item.description, qty: item.quantity || "", unit: item.unit || "מ״ר" });
    }
  }
  if (paintRows.length > 0) {
    rows.push(["סוג פריט", "תיאור", "כמות", "יחידה"].map(csvEscape).join(","));
    for (const r of paintRows) {
      rows.push(["צביעה", r.label, String(r.qty), r.unit].map(csvEscape).join(","));
    }
  } else {
    rows.push(["# אין פריטים מפורטים ביומן זה"].join(""));
  }

  const bom = "﻿";
  const content = bom + rows.join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `יומן_${diary.diaryNumber}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportWorkDiaryPDF(diary: WorkDiary): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { WorkDiaryDocument } = await import(
    "@/components/pdf/WorkDiaryDocument"
  );
  const { createElement } = await import("react");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(createElement(WorkDiaryDocument, { diary }) as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `יומן_עבודה_${diary.diaryNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openEmailDraft(diary: WorkDiary): void {
  const subject = encodeURIComponent(
    `יומן עבודה ${diary.diaryNumber} — ${diary.customerName}`
  );
  const body = encodeURIComponent(
    `שלום,\n\nמצורף יומן עבודה מס׳ ${diary.diaryNumber}.\n\nפרטים:\n` +
      `לקוח: ${diary.customerName}\n` +
      `אתר: ${diary.siteName}\n` +
      `תאריך: ${diary.executionDate}\n` +
      (diary.startTime || diary.endTime
        ? `שעות: ${diary.startTime} — ${diary.endTime}\n`
        : "") +
      `\nאלקיים סימון כבישים בע״מ`
  );
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}
