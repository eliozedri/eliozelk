import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// One-time migration endpoint: POST /api/migrate
// Body: { secret: "elkayam-migrate", data: { customers, orders, catalog, crews, diaries, costRates } }
// Run this ONCE after setting up Supabase tables.

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body || body.secret !== "elkayam-migrate-2026") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createClient(url, key);
  const results: Record<string, unknown> = {};

  // Customers
  if (Array.isArray(body.data?.customers) && body.data.customers.length > 0) {
    const rows = body.data.customers.map((c: Record<string, unknown>) => ({
      id: c.id,
      name: c.name,
      location: c.location ?? "",
      phone: c.phone ?? "",
      last_order: c.lastOrder ?? "",
      notes: c.notes ?? null,
      payment_terms: c.paymentTerms ?? null,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    }));
    const { error } = await db.from("customers").upsert(rows, { onConflict: "id" });
    results.customers = error ? `error: ${error.message}` : `${rows.length} upserted`;
  }

  // Catalog items
  if (Array.isArray(body.data?.catalog) && body.data.catalog.length > 0) {
    const rows = body.data.catalog.map((item: Record<string, unknown>) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      category: item.category ?? "",
      unit_of_measure: item.unitOfMeasure,
      dimension_value: item.dimensionValue ?? null,
      dimension_unit: item.dimensionUnit ?? null,
      default_price: item.defaultPrice ?? null,
      description: item.description ?? "",
      is_active: item.isActive ?? true,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    }));
    const { error } = await db.from("catalog_items").upsert(rows, { onConflict: "id" });
    results.catalog = error ? `error: ${error.message}` : `${rows.length} upserted`;
  }

  // Crews
  if (Array.isArray(body.data?.crews) && body.data.crews.length > 0) {
    const rows = body.data.crews.map((c: Record<string, unknown>) => ({
      id: c.id,
      name: c.name,
      leader: c.leader ?? "",
      worker_count: c.workerCount ?? 1,
      phone: c.phone ?? "",
      skills: c.skills ?? [],
      region: c.region ?? "all",
      daily_capacity_hours: c.dailyCapacityHours ?? 8,
      active: c.active ?? true,
      notes: c.notes ?? "",
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    }));
    const { error } = await db.from("crews").upsert(rows, { onConflict: "id" });
    results.crews = error ? `error: ${error.message}` : `${rows.length} upserted`;
  }

  // Work orders
  if (Array.isArray(body.data?.orders) && body.data.orders.length > 0) {
    const rows = body.data.orders.map((o: Record<string, unknown>) => ({
      id: o.id,
      order_number: o.orderNumber,
      status: o.status ?? "graphics_pending",
      priority: o.priority ?? "normal",
      customer: o.customer ?? "",
      city: o.city ?? "",
      order_date: o.date ?? "",
      data: o,
      created_at: o.createdAt,
      updated_at: o.updatedAt,
    }));
    const { error } = await db.from("work_orders").upsert(rows, { onConflict: "id" });
    results.orders = error ? `error: ${error.message}` : `${rows.length} upserted`;
  }

  // Work diaries
  if (Array.isArray(body.data?.diaries) && body.data.diaries.length > 0) {
    const rows = body.data.diaries.map((d: Record<string, unknown>) => ({
      id: d.id,
      diary_number: d.diaryNumber,
      status: d.status ?? "draft",
      customer_name: d.customerName ?? "",
      site_name: d.siteName ?? "",
      execution_date: d.executionDate ?? "",
      submitted_at: d.submittedAt ?? null,
      data: d,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
    }));
    const { error } = await db.from("work_diaries").upsert(rows, { onConflict: "id" });
    results.diaries = error ? `error: ${error.message}` : `${rows.length} upserted`;
  }

  // Cost rates
  if (body.data?.costRates && typeof body.data.costRates === "object") {
    const { error } = await db.from("cost_rates").update({ data: body.data.costRates, updated_at: new Date().toISOString() }).eq("id", 1);
    results.costRates = error ? `error: ${error.message}` : "updated";
  }

  return NextResponse.json({ ok: true, results });
}
