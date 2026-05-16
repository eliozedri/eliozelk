import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { verifyMasterAuth } from "@/lib/agents/scan-utils";
import { syncAllReservations } from "@/lib/inventory/syncReservations";

export async function POST(req: NextRequest) {
  const db    = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await syncAllReservations(db);

  if (result.errors.length > 0 && result.reservationsCreated === 0 && result.reservationsUpdated === 0) {
    return NextResponse.json({ error: result.errors[0], details: result }, { status: 500 });
  }

  return NextResponse.json({
    desiredCount:          result.desiredCount,
    reservationsCreated:   result.reservationsCreated,
    reservationsUpdated:   result.reservationsUpdated,
    reservationsReleased:  result.reservationsReleased,
    cacheUpdated:          result.cacheUpdated,
    movementsWritten:      result.movementsWritten,
    warnings:              result.warnings,
    errors:                result.errors,
    durationMs:            result.durationMs,
  });
}
