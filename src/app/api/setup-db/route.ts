import { NextResponse } from "next/server";

// This route previously bootstrapped the legacy public.users schema with password_hash.
// Auth has been migrated to Supabase Auth. Schema is now managed via:
//   supabase/migrations/*.sql
// This endpoint is intentionally disabled.
export async function GET() {
  return NextResponse.json({ error: "Deprecated — schema managed via Supabase migrations" }, { status: 410 });
}
