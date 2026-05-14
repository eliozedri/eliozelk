// Server-side user management — requires service role.
// All write operations on auth.users go through here; clients never touch auth directly.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { Role } from "@/types/auth";
import { ROLE_DEFAULTS } from "@/types/auth";

// ── Auth guard: caller must be an active master ───────────────────────────────

async function getCallerProfile(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  const admin = getServiceSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  return profile as { role: string; is_active: boolean } | null;
}

function isMaster(profile: { role: string; is_active: boolean } | null): boolean {
  return !!profile && profile.is_active && profile.role === "master";
}

// ── POST /api/admin/users — create user ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!isMaster(caller)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.name || !body?.role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { email, password, name, role, allowed_tabs, action_permissions } = body as {
    email: string; password: string; name: string; role: Role;
    allowed_tabs?: string[]; action_permissions?: string[];
  };

  const defaults = ROLE_DEFAULTS[role];
  const tabs = allowed_tabs ?? (defaults.tabs as string[]);
  const actions = action_permissions ?? (defaults.actions as string[]);

  const admin = getServiceSupabase();

  const { data: { user: authUser }, error: createErr } = await admin.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: {},
    app_metadata: {},
  });

  if (createErr) {
    if (createErr.message.includes("already been registered") || createErr.message.includes("already exists")) {
      return NextResponse.json({ error: "כתובת אימייל כבר קיימת במערכת" }, { status: 409 });
    }
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
    role,
    is_active: true,
    allowed_tabs: tabs,
    action_permissions: actions,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  });

  if (profileErr) {
    // Roll back auth user creation
    await admin.auth.admin.deleteUser(authUser.id);
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({
    id: authUser.id,
    email: email.toLowerCase(),
    name,
    role,
    is_active: true,
    allowed_tabs: tabs,
    action_permissions: actions,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  });
}

// ── PUT /api/admin/users — admin actions (password reset, email update) ───────

export async function PUT(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!isMaster(caller)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.action) return NextResponse.json({ error: "Missing id or action" }, { status: 400 });

  const admin = getServiceSupabase();

  if (body.action === "reset_password") {
    const email = body.email as string;
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Return the link so admin can share it manually when SMTP is not configured.
    // The link is a one-time token — it expires after use or after Supabase's TTL.
    const link = data?.properties?.action_link ?? null;
    return NextResponse.json({ ok: true, link });
  }

  if (body.action === "set_password") {
    const targetId = body.id as string;
    const password = body.password as string;
    if (!targetId || !password) {
      return NextResponse.json({ error: "Missing id or password" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "הסיסמה חייבת להכיל לפחות 8 תווים" }, { status: 400 });
    }
    // Update via service role — never logs the password value
    const { error } = await admin.auth.admin.updateUserById(targetId, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── PATCH /api/admin/users — update profile fields ────────────────────────────

export async function PATCH(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!isMaster(caller)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { id, ...updates } = body as Record<string, unknown>;
  const admin = getServiceSupabase();

  // Guard: cannot demote or deactivate the last master
  if (updates.role !== undefined || updates.is_active !== undefined) {
    const { data: allProfiles } = await admin
      .from("profiles").select("id, role, is_active").eq("role", "master").eq("is_active", true);
    const masters = allProfiles ?? [];
    const isTarget = masters.some((p: Record<string, unknown>) => p.id === id);
    if (isTarget && masters.length === 1 && (updates.role !== "master" || updates.is_active === false)) {
      return NextResponse.json({ error: "לא ניתן לבטל את המנהל הראשי האחרון" }, { status: 400 });
    }
  }

  // If email is being updated, sync it to auth.users as well
  if (typeof updates.email === "string") {
    const newEmail = (updates.email as string).toLowerCase();
    const { error: authEmailErr } = await admin.auth.admin.updateUserById(id as string, { email: newEmail });
    if (authEmailErr) return NextResponse.json({ error: `עדכון אימייל נכשל: ${authEmailErr.message}` }, { status: 500 });
    updates.email = newEmail;
  }

  const { error } = await admin
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ── DELETE /api/admin/users — delete user ─────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!isMaster(caller)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = getServiceSupabase();

  // Guard: cannot delete last master
  const { data: masters } = await admin
    .from("profiles").select("id").eq("role", "master").eq("is_active", true);
  const masterList = masters ?? [];
  if (masterList.length === 1 && masterList[0].id === id) {
    return NextResponse.json({ error: "לא ניתן למחוק את המנהל הראשי האחרון" }, { status: 400 });
  }

  // Deleting from auth.users cascades to profiles (ON DELETE CASCADE)
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
