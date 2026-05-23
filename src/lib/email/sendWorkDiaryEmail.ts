import "server-only";
import { getEmailTransport } from "@/lib/email/transport";
import { renderWorkDiaryToBuffer } from "@/lib/pdf/renderWorkDiaryToBuffer";
import type { WorkDiary } from "@/types/workDiary";

export type SendMode = "archive" | "customer";

export interface SendWorkDiaryEmailArgs {
  diary: WorkDiary;
  mode: SendMode;
  /** Required when mode = "customer". Ignored for "archive". */
  to?: string;
}

function buildSubject(diary: WorkDiary): string {
  const date = diary.executionDate ?? "";
  const customer = diary.customerName ?? "";
  return `יומן עבודה חתום — אלקיים סימון כבישים — ${date}${customer ? ` — ${customer}` : ""}`;
}

function buildBody(diary: WorkDiary, mode: SendMode): string {
  const date = diary.executionDate ?? "";
  const header = mode === "archive" ? "עותק פנימי לארכיון" : "שלום רב,";
  return [
    header,
    "",
    `מצורף בזאת יומן העבודה החתום עבור העבודה שבוצעה בתאריך ${date}.`,
    `מספר יומן: ${diary.diaryNumber}`,
    "",
    "בברכה,",
    "אלקיים סימון כבישים בע״מ",
  ].join("\n");
}

function buildFilename(diary: WorkDiary): string {
  const date = (diary.executionDate ?? "unknown").replace(/[^0-9-]/g, "");
  const safeId = diary.diaryNumber.replace(/[^A-Za-z0-9_-]/g, "");
  return `elkayam-yoman-${date}-${safeId}.pdf`;
}

export async function sendWorkDiaryEmail(args: SendWorkDiaryEmailArgs): Promise<void> {
  if (args.mode === "customer" && !args.to) {
    throw new Error("Customer email requires a recipient");
  }
  const from = process.env.EMAIL_FROM ?? "elkayam.yomanim@gmail.com";
  const to = args.mode === "archive"
    ? (process.env.EMAIL_ARCHIVE_TO ?? "elkayam.yomanim@gmail.com")
    : args.to!;

  const pdfBuf = await renderWorkDiaryToBuffer(args.diary);
  const transport = getEmailTransport();
  await transport.sendMail({
    from,
    to,
    subject: buildSubject(args.diary),
    text: buildBody(args.diary, args.mode),
    attachments: [
      {
        filename: buildFilename(args.diary),
        content: pdfBuf,
        contentType: "application/pdf",
      },
    ],
  });
}
