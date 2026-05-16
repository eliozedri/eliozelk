import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { verifyMasterAuth } from "@/lib/agents/scan-utils";
import { syncReservations } from "@/lib/inventory/syncReservations";

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await syncReservations(db);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json(result);
}
