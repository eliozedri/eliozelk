import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/apiAuth";
import { sendWebPush, pushConfigured } from "@/lib/notifications/push";

// Master-only: send a test push to the caller's own devices to verify the pipe
// end-to-end (SW + subscription + VAPID). Does NOT create a notification row — this is
// transport verification only, never an acknowledgement.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["master"]);
  if (!auth.ok) return auth.response;

  if (!pushConfigured()) {
    return NextResponse.json({ ok: false, error: "VAPID not configured on server" }, { status: 503 });
  }

  const result = await sendWebPush(auth.user.id, {
    title: "בדיקת התראות דפדפן",
    body: "אם קיבלת התראה זו — Web Push פעיל במכשיר הזה.",
    url: "/notifications",
    tag: "push-test",
  });

  return NextResponse.json({ ok: true, result });
}
