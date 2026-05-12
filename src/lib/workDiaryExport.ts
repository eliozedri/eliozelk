import type { WorkDiary } from "@/types/workDiary";

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
