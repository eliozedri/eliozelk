// Opt-in render-only test. Writes a sample work-diary PDF to disk so the
// rendered output (Hebrew shaping, Heebo font, signature image) can be
// inspected visually without sending any email.
//
// Usage:
//   LIVE_PDF=1 npx vitest run tests/live/renderWorkDiaryPdf.live.test.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderWorkDiaryToBuffer } from "@/lib/pdf/renderWorkDiaryToBuffer";
import type { WorkDiary } from "@/types/workDiary";

const ONE_PX_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function makeDiary(): WorkDiary {
  const now = new Date();
  const iso = now.toISOString();
  return {
    id: "render-smoke",
    diaryNumber: "RENDER-" + iso.slice(0, 10),
    status: "submitted",
    customerName: "מע״צ — בדיקת תרגום",
    siteName: "כביש 6 — צומת שעלבים",
    contactName: "דני כהן",
    contactPhone: "050-1234567",
    executionDate: iso.slice(0, 10),
    startTime: "07:30",
    endTime: "16:45",
    vehicleNumber: "12-345-67",
    trailerNumber: "",
    driverName: "אבי לוי",
    crewLeaderName: "ראש צוות בדיקה",
    crewMembers: ["יוסי", "משה"],
    paintingItems: [],
    poleItems: [],
    signItems: [],
    photos: [],
    generalNotes: "בדיקת רינדור של עברית עם Heebo בצד שרת.",
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

const live = process.env.LIVE_PDF === "1";

describe.skipIf(!live)("live PDF render", () => {
  it("writes a readable PDF with Hebrew text", async () => {
    const diary = makeDiary();
    const buf = await renderWorkDiaryToBuffer(diary);
    expect(buf.length).toBeGreaterThan(2_000);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    const outDir = path.join(process.cwd(), "tmp");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "work-diary-render-smoke.pdf");
    fs.writeFileSync(outPath, buf);
    console.log("[render] wrote", outPath, "(" + buf.length + " bytes)");
  }, 60_000);
});
