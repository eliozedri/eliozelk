// Equipment collection route — list + create.
// GET  /api/equipment            → all active equipment (authenticated)
// POST /api/equipment            → create equipment (manage_equipment)

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth, requireAction } from "@/lib/auth/apiAuth";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const db = getServiceSupabase();
  const { data, error } = await db
    .from("equipment")
    .select("*")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const displayName = String(body.display_name ?? "").trim();
  const categoryKey = String(body.category_key ?? "").trim();
  if (!displayName) return NextResponse.json({ error: "חסר שם כלי" }, { status: 400 });
  if (!categoryKey) return NextResponse.json({ error: "חסרה קטגוריה" }, { status: 400 });

  const now = new Date().toISOString();
  const id = `equip-${nanoid(10)}`;

  const row = {
    id,
    display_name: displayName,
    category_key: categoryKey,
    equipment_type: (body.equipment_type as string) ?? null,
    manufacturer: (body.manufacturer as string) ?? null,
    model: (body.model as string) ?? null,
    year: (body.year as number) ?? null,
    license_number: (body.license_number as string) ?? null,
    serial_number: (body.serial_number as string) ?? null,
    chassis_number: (body.chassis_number as string) ?? null,
    engine_number: (body.engine_number as string) ?? null,
    status: (body.status as string) ?? "active",
    identification_confidence: (body.identification_confidence as string) ?? "confirmed",
    technical_specs: (body.technical_specs as Record<string, unknown>) ?? {},
    notes: (body.notes as string) ?? null,
    photos: Array.isArray(body.photos) ? body.photos : [],
    documents: Array.isArray(body.documents) ? body.documents : [],
    last_maintenance_date: (body.last_maintenance_date as string) ?? null,
    next_maintenance_date: (body.next_maintenance_date as string) ?? null,
    next_inspection_date: (body.next_inspection_date as string) ?? null,
    next_insurance_date: (body.next_insurance_date as string) ?? null,
    out_of_service_reason: (body.out_of_service_reason as string) ?? null,
    current_location: (body.current_location as string) ?? null,
    business_use: (body.business_use as string) ?? null,
    license_expiry_date: (body.license_expiry_date as string) ?? null,
    mileage: (body.mileage as number) ?? null,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  const db = getServiceSupabase();
  const { data, error } = await db.from("equipment").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
