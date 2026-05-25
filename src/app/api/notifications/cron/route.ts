import { NextRequest, NextResponse } from "next/server";
import { processNotifications } from "@/lib/notifications/worker";

// Background worker endpoint — invoked by Vercel Cron (GET) or manually (POST) with the
// CRON_SECRET bearer. Dormant (503) until CRON_SECRET is set, and never public:
// without the matching bearer it returns 401. The work itself is idempotent.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "worker disabled (no CRON_SECRET)" }, { status: 503 });
  }
  const provided = req.headers.get("authorization");
  if (provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processNotifications();
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
