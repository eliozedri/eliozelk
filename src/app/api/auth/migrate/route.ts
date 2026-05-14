import { NextResponse } from "next/server";

// Legacy bridge migration endpoint — the users table it referenced was
// dropped in migration 20260513000003_drop_legacy_password_hash.sql.
// All users now authenticate via Supabase Auth directly.
// Endpoint intentionally disabled.
export async function POST() {
  return NextResponse.json(
    { error: "Deprecated — all users authenticate via Supabase Auth" },
    { status: 410 }
  );
}
