// Opt-in live integration test for the work-diary email pipeline.
// Set LIVE_SMTP=1 to actually send through Gmail; otherwise this test is
// skipped. Runs through the same sendWorkDiaryEmail used by the production
// API routes — proves SMTP auth, Heebo PDF rendering in Node, attachment
// shape, and Gmail acceptance end-to-end.
//
// Usage:
//   LIVE_SMTP=1 LIVE_SMTP_MODE=archive npx vitest run tests/live
//   LIVE_SMTP=1 LIVE_SMTP_MODE=customer LIVE_SMTP_TO=you@example.com npx vitest run tests/live
import { describe, it, expect } from "vitest";
import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.join(process.cwd(), ".env.local") });

import { sendWorkDiaryEmail } from "@/lib/email/sendWorkDiaryEmail";
import type { WorkDiary } from "@/types/workDiary";

const ONE_PX_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function makeSyntheticDiary(): WorkDiary {
  const now = new Date();
  const iso = now.toISOString();
  const yyyyMmDd = iso.slice(0, 10);
  return {
    id: "smoke-" + now.getTime(),
    diaryNumber: "SMOKE-" + yyyyMmDd,
    status: "submitted",
    customerName: "בדיקה — אלקיים QA",
    siteName: "בדיקה",
    contactName: "",
    contactPhone: "",
    executionDate: yyyyMmDd,
    startTime: "08:00",
    endTime: "16:00",
    vehicleNumber: "",
    trailerNumber: "",
    driverName: "",
    crewLeaderName: "ראש צוות בדיקה",
    crewMembers: [],
    paintingItems: [],
    poleItems: [],
    signItems: [],
    photos: [],
    generalNotes: "Smoke test diary — do not bill.",
    customerSignature: null,
    companySignature: {
      signerName: "ראש צוות בדיקה",
      signerRole: "ראש צוות",
      signerEmail: "",
      location: "QA",
      signedAt: iso,
      dataUrl: ONE_PX_PNG,
    },
    createdAt: iso,
    updatedAt: iso,
    submittedAt: iso,
  };
}

const live = process.env.LIVE_SMTP === "1";
const mode = (process.env.LIVE_SMTP_MODE ?? "archive") as "archive" | "customer";
const to = process.env.LIVE_SMTP_TO;

describe.skipIf(!live)("live work-diary email", () => {
  it(`sends real ${mode} email through Gmail SMTP`, async () => {
    if (mode === "customer" && !to) {
      throw new Error("LIVE_SMTP_MODE=customer requires LIVE_SMTP_TO=<recipient>");
    }
    const diary = makeSyntheticDiary();
    console.log("[live] env:", {
      EMAIL_FROM: process.env.EMAIL_FROM,
      EMAIL_USER: process.env.EMAIL_USER,
      EMAIL_HOST: process.env.EMAIL_HOST,
      EMAIL_PORT: process.env.EMAIL_PORT,
      EMAIL_ARCHIVE_TO: process.env.EMAIL_ARCHIVE_TO,
      EMAIL_PASS_LEN: process.env.EMAIL_PASS?.length ?? 0,
    });
    console.log("[live] sending:", { mode, to: mode === "archive" ? process.env.EMAIL_ARCHIVE_TO : to, diaryNumber: diary.diaryNumber });
    const t0 = Date.now();
    await sendWorkDiaryEmail({ diary, mode, to });
    console.log(`[live] OK — completed in ${Date.now() - t0}ms`);
    // No throw == pass. Real success is verified by inbox arrival.
    expect(true).toBe(true);
  }, 60_000);
});
