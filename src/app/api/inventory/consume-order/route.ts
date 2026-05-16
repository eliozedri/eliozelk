import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { syncConsumptionForOrder } from "@/lib/inventory/consumption";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getServiceSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();

  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
