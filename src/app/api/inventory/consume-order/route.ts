import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/apiAuth";
import { syncConsumptionForOrder } from "@/lib/inventory/consumption";

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();

  // Called as a side-effect of diary approval — restrict to the roles that can
  // approve diaries (office_manager + master).
  const auth = await requireRole(req, ["office_manager"]);
  if (!auth.ok) return auth.response;

  let orderId: string, diaryId: string;
  try {
    const body = await req.json() as { orderId?: string; diaryId?: string };
    orderId = body.orderId ?? "";
    diaryId = body.diaryId ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!orderId || !diaryId) {
    return NextResponse.json({ error: "orderId and diaryId are required" }, { status: 400 });
  }

  const result = await syncConsumptionForOrder(db, orderId, diaryId);

  if (result.errors.length > 0 && result.consumptionsCreated === 0) {
    return NextResponse.json({ error: result.errors[0], details: result }, { status: 500 });
  }

  return NextResponse.json({
    consumptionsCreated:      result.consumptionsCreated,
    consumptionsUpdated:      result.consumptionsUpdated,
    reservationsConsumed:     result.reservationsConsumed,
    movementsWritten:         result.movementsWritten,
    reconciliationTasksCreated: result.reconciliationTasksCreated,
    cacheUpdated:             result.cacheUpdated,
    warnings:                 result.warnings,
    errors:                   result.errors,
    durationMs:               result.durationMs,
  });
}
