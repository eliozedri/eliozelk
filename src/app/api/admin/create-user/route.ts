import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Verify the requesting user has manage_access permission
  const cookieStore = await cookies();
  const requesterClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data: { user: requester } } = await requesterClient.auth.getUser();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: requesterProfile } = await requesterClient
    .from("profiles")
    .select("action_permissions, role")
    .eq("id", requester.id)
    .single();

  const hasPermission =
    requesterProfile?.role === "master" ||
    requesterProfile?.action_permissions?.includes("*") ||
    requesterProfile?.action_permissions?.includes("manage_access");

  if (!hasPermission) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  // Use service role client to create user
  const { createClient } = await import("@supabase/supabase-js");
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const body = await request.json();
  const { name, email, password, role, allowed_tabs, action_permissions } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Create auth user
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? "Failed to create user" }, { status: 400 });
  }

  // Create profile
  const finalTabs = role === "master" ? ["*"] : (allowed_tabs ?? []);
  const finalActions = role === "master" ? ["*"] : (action_permissions ?? []);

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: authData.user.id,
    email,
    name,
    role,
    is_active: true,
    allowed_tabs: finalTabs,
    action_permissions: finalActions,
  });

  if (profileError) {
    // Rollback: delete auth user
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, userId: authData.user.id });
}
