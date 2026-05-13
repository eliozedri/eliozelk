// First-run setup: creates the first master user in auth.users + profiles.
// Only callable when no master profile exists. No auth guard required.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ROLE_DEFAULTS } from "@/types/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = getServiceSupabase();

  // Guard: only callable when no active master exists
  const { data: masters } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "master")
    .eq("is_active", true)
    .limit(1);

  if ((masters?.length ?? 0) > 0) {
    return NextResponse.json({ error: "מנהל ראשי כבר קיים במערכת" }, { status: 409 });
  }

  const { email, password, name } = body as { email: string; password: string; name: string };
  const defaults = ROLE_DEFAULTS["master"];

  const { data: { user: authUser }, error: createErr } = await admin.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: {},
    app_metadata: {},
  });

  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 500 });
  }
  if (!authUser) {
    return NextResponse.json({ error: "Failed to create auth user" }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: profileErr } = await admin.from("profiles").insert({
    id: authUser.id,
    email: email.toLowerCase(),
    name,
    role: "master",
    is_active: true,
    allowed_tabs: defaults.tabs as string[],
    action_permissions: defaults.actions as string[],
    last_login_at: null,
    created_at: now,
    updated_at: now,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(authUser.id);
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
