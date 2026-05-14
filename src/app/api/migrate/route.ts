import { NextResponse } from "next/server";

// One-time data migration endpoint — superseded by Supabase migrations.
// Data is now entered directly through the application UI.
// Endpoint intentionally disabled to eliminate the hardcoded secret risk.
export async function POST() {
  return NextResponse.json(
    { error: "Deprecated — data is managed through the application UI" },
    { status: 410 }
  );
}
