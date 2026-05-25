import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";
import { pushConfigured } from "@/lib/notifications/push";

// Register (or refresh) the caller's Web Push subscription for one device. Keyed by
// endpoint so re-subscribing the same browser updates in place; a user may hold many.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    userAgent?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const sub = body.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const authKey = sub?.keys?.auth;
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  const db = getServiceSupabase();
  const { error } = await db
    .from("push_subscriptions")
    .upsert(
      {
        user_id: auth.user.id,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: body.userAgent ?? null,
        enabled: true,
        last_used_at: null,
      },
      { onConflict: "endpoint" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, configured: pushConfigured() });
}
