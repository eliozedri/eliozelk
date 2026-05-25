import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";

// Remove the caller's subscription for a given device endpoint. Scoped to the caller's
// own rows so one user can never unsubscribe another's device.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { endpoint?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const endpoint = body.endpoint;
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

  const db = getServiceSupabase();
  const { error } = await db
    .from("push_subscriptions")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("endpoint", endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
