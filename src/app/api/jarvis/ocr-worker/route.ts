import { NextRequest, NextResponse } from "next/server";
import { processQueuedDocuments } from "@/lib/jarvis/skills/ocrDocument/worker";

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
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
