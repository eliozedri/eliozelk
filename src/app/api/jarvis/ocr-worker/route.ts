import { NextRequest, NextResponse } from "next/server";
import { processQueuedDocuments } from "@/lib/jarvis/skills/ocrDocument/worker";
import { recoverStuckExtractingDocuments } from "@/lib/supplierDocuments/recoverStuck";

// Async OCR worker endpoint — invoked by Vercel Cron (GET) or manually (POST) with the
// CRON_SECRET bearer. Dormant (503) until CRON_SECRET is set; never public (401 without the
// matching bearer). The work is idempotent. maxDuration is raised for tesseract.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "worker disabled (no CRON_SECRET)" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processQueuedDocuments();
  // Also rescue supplier documents stranded in "extracting" by a killed OCR request,
  // so they surface in the finance review queue with a clear reason instead of silently.
  const recovery = await recoverStuckExtractingDocuments();
  return NextResponse.json({ ok: true, result, recovery });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
