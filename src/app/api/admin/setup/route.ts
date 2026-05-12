import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Block if any master already exists
  const { data: existingMasters } = await adminClient
    .from("profiles")
    .select("id")
    .eq("role", "master")
    .limit(1);

  if (existingMasters && existingMasters.length > 0) {
    return NextResponse.json({ error: "Master user already exists" }, { status: 409 });
  }

  const body = await request.json();
  const { name, email, password } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? "Failed" }, { status: 400 });
  }

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: authData.user.id,
    email,
    name,
    role: "master",
    is_active: true,
    allowed_tabs: ["*"],
    action_permissions: ["*"],
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
