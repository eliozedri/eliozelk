import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sendWorkDiaryEmail } from "@/lib/email/sendWorkDiaryEmail";
import type { WorkDiary } from "@/types/workDiary";

export const maxDuration = 30;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory rate limit: max 5 sends per diary per hour. Anti-spam guard for
// accidental double-taps. Resets on cold start, which is acceptable for the
// expected volume.
const sendBuckets = new Map<string, number[]>();
const RATE_LIMIT_PER_HOUR = 5;

function rateLimited(diaryId: string): boolean {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const bucket = (sendBuckets.get(diaryId) ?? []).filter(t => t > oneHourAgo);
  if (bucket.length >= RATE_LIMIT_PER_HOUR) {
    sendBuckets.set(diaryId, bucket);
    return true;
  }
  bucket.push(now);
  sendBuckets.set(diaryId, bucket);
  return false;
}

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getServiceSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const to = typeof body?.to === "string" ? body.to.trim() : "";

  if (!to || !EMAIL_REGEX.test(to) || /[\r\n]/.test(to)) {
    return NextResponse.json({ error: "Invalid recipient email" }, { status: 400 });
  }

  if (rateLimited(id)) {
    return NextResponse.json({ error: "Too many sends for this diary, try again later" }, { status: 429 });
  }

  const db = getServiceSupabase();
  const { data: row, error: readErr } = await db
    .from("work_diaries")
    .select("id, status, data")
    .eq("id", id)
    .single();
  if (readErr || !row) {
    return NextResponse.json({ error: readErr?.message ?? "Diary not found" }, { status: 404 });
  }
  if (row.status !== "submitted") {
    return NextResponse.json({ error: "Diary is not submitted" }, { status: 400 });
  }
  const diary = row.data as WorkDiary;
  if (!diary?.companySignature?.dataUrl) {
    return NextResponse.json({ error: "Worker signature missing" }, { status: 400 });
  }

  try {
    await sendWorkDiaryEmail({ diary, mode: "customer", to });
    return NextResponse.json({ status: "sent", to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
