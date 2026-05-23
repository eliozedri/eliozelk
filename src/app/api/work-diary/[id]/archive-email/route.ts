import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";
import { sendWorkDiaryEmail } from "@/lib/email/sendWorkDiaryEmail";
import type { WorkDiary } from "@/types/workDiary";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAction(req, "submit_diary");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const db = getServiceSupabase();

  const { data: row, error: readErr } = await db
    .from("work_diaries")
    .select("id, status, internal_emailed_at, data")
    .eq("id", id)
    .single();

  if (readErr || !row) {
    return NextResponse.json({ error: readErr?.message ?? "Diary not found" }, { status: 404 });
  }

  if (row.status !== "submitted") {
    return NextResponse.json({ status: "skipped", reason: "not_submitted" }, { status: 200 });
  }
  if (row.internal_emailed_at) {
    return NextResponse.json({ status: "skipped", reason: "already_archived" }, { status: 200 });
  }

  const diary = row.data as WorkDiary;
  if (!diary?.companySignature?.dataUrl) {
    return NextResponse.json({ status: "skipped", reason: "missing_worker_signature" }, { status: 200 });
  }

  try {
    await sendWorkDiaryEmail({ diary, mode: "archive" });
    const now = new Date().toISOString();
    await db
      .from("work_diaries")
      .update({ internal_emailed_at: now, internal_email_error: null })
      .eq("id", id);
    return NextResponse.json({ status: "sent", at: now });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("work_diaries")
      .update({ internal_email_error: msg })
      .eq("id", id);
    // 200 by design: this is a recorded outcome, not an HTTP error.
    return NextResponse.json({ status: "failed", error: msg }, { status: 200 });
  }
}
