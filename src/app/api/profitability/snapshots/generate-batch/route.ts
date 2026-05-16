import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { calculateOrderProfitability } from "@/lib/profitability";
import type { DiaryForProfitability, InventoryConsumptionInput } from "@/lib/profitability";
import { DEFAULT_COST_RATES } from "@/types/costRates";
import type { CostRates } from "@/types/costRates";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getServiceSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// POST /api/profitability/snapshots/generate-batch
// Body: { statuses?: string[] }  — optional status filter, default all non-cancelled
// Returns: { generated, skipped, failed, durationMs }
export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const start = Date.now();
  let statuses: string[] | undefined;
  try {
    const body = await req.json() as { statuses?: string[] };
    statuses = Array.isArray(body.statuses) && body.statuses.length > 0 ? body.statuses : undefined;
  } catch {
    // body is optional
  }

  const db = getServiceSupabase();

  const { data: ratesRow } = await db
    .from("cost_rates")
    .select("data")
    .eq("id", 1)
    .maybeSingle() as { data: { data?: Partial<CostRates> } | null };
  const rates: CostRates = { ...DEFAULT_COST_RATES, ...((ratesRow?.data ?? {}) as Partial<CostRates>) };

  let ordersQuery = db
    .from("work_orders")
    .select("id,customer,billed_amount,data")
    .not("status", "in", '("cancelled")');

  if (statuses) {
    ordersQuery = ordersQuery.in("status", statuses);
  }

  const { data: orders, error: ordersErr } = await ordersQuery;
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const order of (orders ?? [])) {
    try {
      const orderId = order.id as string;
      const revenue = (order.billed_amount as number | null) ?? 0;
      const customerId = ((order.data as Record<string, unknown> | null)?.customerId as string | undefined);

      const { data: rawDiaries } = await db
        .from("work_diaries")
        .select("id,approval_status,data")
        .eq("order_id", orderId)
        .not("status", "in", '("cancelled")');

      const diaries: DiaryForProfitability[] = (rawDiaries ?? []).map((row) => {
        const d = (row.data as Record<string, unknown> | null) ?? {};
        const crewMembers = Array.isArray(d.crewMembers) ? (d.crewMembers as string[]).filter(Boolean) : [];
        const hasLeader = typeof d.crewLeaderName === "string" && (d.crewLeaderName as string).trim() ? 1 : 0;
        return {
          id: row.id as string,
          isApproved: row.approval_status === "approved",
          crewCount: crewMembers.length + hasLeader,
          hasVehicle: typeof d.vehicleNumber === "string" && (d.vehicleNumber as string).trim() !== "",
          vehicleCostOverride: typeof d.vehicleCostOverride === "number" ? d.vehicleCostOverride : null,
          equipmentCost: typeof d.equipmentCost === "number" ? d.equipmentCost : 0,
          materialCost: typeof d.materialCost === "number" ? d.materialCost : 0,
        };
      });

      const { data: rawConsumptions } = await db
        .from("inventory_consumptions")
        .select("item_id,quantity")
        .eq("order_id", orderId);

      const itemIds = [...new Set((rawConsumptions ?? []).map((c) => c.item_id as string))];
      let costPriceMap: Record<string, number | null> = {};
      if (itemIds.length > 0) {
        const { data: catalogItems } = await db
          .from("catalog_items")
          .select("id,cost_price")
          .in("id", itemIds);
        costPriceMap = Object.fromEntries(
          (catalogItems ?? []).map((i) => [i.id as string, (i.cost_price as number | null)])
        );
      }

      const consumptions: InventoryConsumptionInput[] = (rawConsumptions ?? []).map((c) => ({
        itemId: c.item_id as string,
        quantity: (c.quantity as number) ?? 0,
        costPrice: costPriceMap[c.item_id as string] ?? null,
      }));

      const snapshot = calculateOrderProfitability({ orderId, customerId, revenue, diaries, consumptions, rates });

      const { error: upsertErr } = await db
        .from("profitability_snapshots")
        .upsert({
          order_id: snapshot.orderId,
          work_diary_id: null,
          customer_id: snapshot.customerId ?? null,
          revenue: snapshot.revenue,
          labor_cost: snapshot.laborCost,
          material_cost: snapshot.materialCost,
          vehicle_cost: snapshot.vehicleCost,
          equipment_cost: snapshot.equipmentCost,
          subcontractor_cost: snapshot.subcontractorCost,
          other_cost: snapshot.otherCost,
          overhead_cost: snapshot.overheadCost,
          total_cost: snapshot.totalCost,
          gross_profit: snapshot.grossProfit,
          gross_margin_percent: snapshot.grossMarginPercent,
          confidence_level: snapshot.confidenceLevel,
          missing_data: snapshot.missingData,
          source_data: snapshot.sourceData,
          updated_at: now,
        }, { onConflict: "order_id", ignoreDuplicates: false });

      if (upsertErr) { failed++; continue; }
      generated++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ generated, skipped, failed, durationMs: Date.now() - start });
}
