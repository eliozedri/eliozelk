import type { WorkDiary } from "@/types/workDiary";

function csvEscape(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportWorkDiaryCSV(diary: WorkDiary): void {
  const rows: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────
  rows.push(["# יומן עבודה", diary.diaryNumber].map(csvEscape).join(","));
  rows.push(["# סטטוס", diary.status === "submitted" ? "נשלח" : "טיוטה"].map(csvEscape).join(","));
  rows.push(["# לקוח", diary.customerName].map(csvEscape).join(","));
  rows.push(["# אתר", diary.siteName || ""].map(csvEscape).join(","));
  rows.push(["# תאריך ביצוע", diary.executionDate].map(csvEscape).join(","));
  rows.push(["# שעות", `${diary.startTime || "—"} — ${diary.endTime || "—"}`].map(csvEscape).join(","));
  if (diary.orderNumber) rows.push(["# הזמנה מקושרת", diary.orderNumber].map(csvEscape).join(","));
  rows.push("");

  // ── Crew & vehicle ────────────────────────────────────────────────────
  rows.push(["## צוות ורכב"].join(""));
  rows.push(["נהג", diary.driverName || ""].map(csvEscape).join(","));
  rows.push(["ראש צוות", diary.crewLeaderName || ""].map(csvEscape).join(","));
  const crewList = (diary.crewMembers || []).filter(Boolean).join(", ");
  if (crewList) rows.push(["חברי צוות", crewList].map(csvEscape).join(","));
  rows.push(["רכב", diary.vehicleNumber || ""].map(csvEscape).join(","));
  if (diary.trailerNumber) rows.push(["טריילר", diary.trailerNumber].map(csvEscape).join(","));
  rows.push("");

  // ── Time breakdown ────────────────────────────────────────────────────
  const hasTimeBreakdown = diary.travelTimeHours != null || diary.setupTimeHours != null ||
    diary.waitingTimeHours != null || diary.executionTimeHours != null;
  if (hasTimeBreakdown) {
    rows.push(["## פירוט שעות"].join(""));
    rows.push(["סוג", "שעות"].map(csvEscape).join(","));
    if (diary.travelTimeHours != null) rows.push(["נסיעה", String(diary.travelTimeHours)].map(csvEscape).join(","));
    if (diary.setupTimeHours != null) rows.push(["הכנה/פירוק", String(diary.setupTimeHours)].map(csvEscape).join(","));
    if (diary.waitingTimeHours != null) rows.push(["המתנה", String(diary.waitingTimeHours)].map(csvEscape).join(","));
    if (diary.executionTimeHours != null) rows.push(["ביצוע", String(diary.executionTimeHours)].map(csvEscape).join(","));
    rows.push("");
  }

  // ── Painting items ────────────────────────────────────────────────────
  const activePainting = (diary.paintingItems || []).filter(
    item => item.white || item.orange || item.yellow || item.black
  );
  if (activePainting.length > 0) {
    rows.push(["## פריטי צביעה"].join(""));
    rows.push(["שם", "יחידה", "לבן", "כתום", "צהוב", "שחור", "רטרורפלקטיבי", "חרוזים", "הערות"].map(csvEscape).join(","));
    for (const item of activePainting) {
      rows.push([
        item.name, item.unit || 'מ"ר',
        item.white || "0", item.orange || "0", item.yellow || "0", item.black || "0",
        item.retroReflective ? "כן" : "לא",
        item.beads ? "כן" : "לא",
        item.notes || "",
      ].map(csvEscape).join(","));
    }
    rows.push("");
  }

  // ── Pole items ────────────────────────────────────────────────────────
  const activePoles = (diary.poleItems || []).filter(
    item => item.out || item.supply || item.install || item.dismantle || item.move || item.straighten
  );
  if (activePoles.length > 0) {
    rows.push(["## פריטי עמודים"].join(""));
    rows.push(["שם", "יחידה", "הוצאה", "אספקה", "התקנה", "פירוק", "העברה", "יישור", "הערות"].map(csvEscape).join(","));
    for (const item of activePoles) {
      rows.push([
        item.name, item.unit || "יח׳",
        item.out || "0", item.supply || "0", item.install || "0",
        item.dismantle || "0", item.move || "0", item.straighten || "0",
        item.notes || "",
      ].map(csvEscape).join(","));
    }
    rows.push("");
  }

  // ── Sign items ────────────────────────────────────────────────────────
  const activeSigns = (diary.signItems || []).filter(
    item => item.out || item.supply || item.install || item.dismantle || item.move
  );
  if (activeSigns.length > 0) {
    rows.push(["## פריטי שלטים"].join(""));
    rows.push(["עירוני", "בסיסי", "רגיל", "מחוזק", "יהלום", "הוצאה", "אספקה", "התקנה", "פירוק", "העברה", "הערות"].map(csvEscape).join(","));
    for (const item of activeSigns) {
      rows.push([
        item.urban || "0", item.basic || "0", item.regular || "0",
        item.reinforced || "0", item.diamond || "0",
        item.out || "0", item.supply || "0", item.install || "0",
        item.dismantle || "0", item.move || "0",
        item.notes || "",
      ].map(csvEscape).join(","));
    }
    rows.push("");
  }

  // ── Billing ───────────────────────────────────────────────────────────
  if (diary.billedAmount != null || diary.billingNotes) {
    rows.push(["## חיוב"].join(""));
    if (diary.billedAmount != null) rows.push(["סכום לחיוב", "₪" + diary.billedAmount].map(csvEscape).join(","));
    if (diary.billingNotes) rows.push(["הערות חיוב", diary.billingNotes].map(csvEscape).join(","));
    rows.push("");
  }

  // ── Signatures ────────────────────────────────────────────────────────
  rows.push(["## חתימות"].join(""));
  rows.push([
    "חתימת לקוח",
    diary.customerSignature
      ? `${diary.customerSignature.signerName} (${diary.customerSignature.signedAt?.split("T")[0]})`
      : "לא נחתם",
  ].map(csvEscape).join(","));
  rows.push([
    "חתימת חברה",
    diary.companySignature
      ? `${diary.companySignature.signerName} (${diary.companySignature.signedAt?.split("T")[0]})`
      : "לא נחתם",
  ].map(csvEscape).join(","));

  // ── General notes ─────────────────────────────────────────────────────
  if (diary.generalNotes) {
    rows.push("");
    rows.push(["## הערות כלליות"].join(""));
    rows.push([diary.generalNotes].map(csvEscape).join(","));
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

