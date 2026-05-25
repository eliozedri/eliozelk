// Maintenance records collection — list + create.
// GET  /api/equipment/[id]/maintenance   → records for the asset
// POST /api/equipment/[id]/maintenance    → create a record (manage_equipment)

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth, requireAction } from "@/lib/auth/apiAuth";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const db = getServiceSupabase();
  const { data, error } = await db
    .from("equipment_maintenance_records")
    .select("*")
    .eq("equipment_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const createdBy = auth.user.profile.name || auth.user.id;
  const row = {
    id: nanoid(),
    equipment_id: id,
    service_date: (body.service_date as string) ?? null,
    scheduled_date: (body.scheduled_date as string) ?? null,
    maintenance_type: String(body.maintenance_type ?? ""),
    description: String(body.description ?? ""),
    provider: String(body.provider ?? ""),
    cost: (body.cost as number) ?? null,
    parts_replaced: String(body.parts_replaced ?? ""),
    notes: String(body.notes ?? ""),
    status: String(body.status ?? "open"),
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  };

  const db = getServiceSupabase();
  const { data, error } = await db.from("equipment_maintenance_records").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
