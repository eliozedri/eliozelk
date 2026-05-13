// Bridge migration: verifies old SHA-256 credentials → creates auth.users + profile.
// Called by Login when signInWithPassword fails but the user may exist in the legacy table.
// Once a user is migrated, subsequent logins go through Supabase Auth only.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const { email, password } = body as { email: string; password: string };
  const admin = getServiceSupabase();

  // 1. Look up the legacy user record
  const { data: rows, error: fetchErr } = await admin
    .from("users")
    .select("*")
    .ilike("email", email)
    .limit(1);

  if (fetchErr || !rows || rows.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const legacy = rows[0] as Record<string, unknown>;

  // 2. Verify password against legacy SHA-256 hash
  const hash = await sha256hex(password);
  if (hash !== (legacy.password_hash as string)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // 3. Blocked inactive users
  if (!(legacy.is_active as boolean)) {
    return NextResponse.json({ error: "inactive" }, { status: 403 });
  }

  const userId = legacy.id as string;

  // 4. Check if auth user already exists (idempotent)
  const { data: existingAuth } = await admin.auth.admin.getUserById(userId);
  if (!existingAuth.user) {
    // Create Supabase Auth user preserving the same UUID
    const { error: createErr } = await admin.auth.admin.createUser({
      user_metadata: {},
      app_metadata: {},
      email: email.toLowerCase(),
      password,
      email_confirm: true,
    });
    if (createErr) {
      // If duplicate email, the user already exists under a different id — just sign in
      if (!createErr.message.includes("already been registered") && !createErr.message.includes("already exists")) {
        console.error("[migrate] createUser failed:", createErr.message);
        return NextResponse.json({ error: "create_failed", detail: createErr.message }, { status: 500 });
      }
    }
  }

  // 5. Get the auth user id (may differ from legacy id if the user was already in auth)
  const { data: { users: authUsers }, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }
  const authUser = authUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!authUser) {
    return NextResponse.json({ error: "auth_user_not_found" }, { status: 500 });
  }

  // 6. Upsert profile (use auth user id, not legacy id)
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: authUser.id,
    email: email.toLowerCase(),
    name: legacy.name as string,
    role: legacy.role as string,
    is_active: legacy.is_active as boolean,
    allowed_tabs: legacy.allowed_tabs as string[],
    action_permissions: legacy.action_permissions as string[],
    last_login_at: legacy.last_login_at as string | null,
    created_at: legacy.created_at as string,
    updated_at: legacy.updated_at as string,
  }, { onConflict: "id" });

  if (profileErr) {
    console.error("[migrate] profile upsert failed:", profileErr.message);
    return NextResponse.json({ error: "profile_failed", detail: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
