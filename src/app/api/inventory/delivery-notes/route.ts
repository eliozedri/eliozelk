import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth, requireAction } from "@/lib/auth/apiAuth";

// GET /api/inventory/delivery-notes — list all non-cancelled notes
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const db = getServiceSupabase();
  const { data, error } = await db.from("delivery_notes")
    .select("id,supplier_id,supplier_name,document_number,received_date,status,notes,created_by,created_at,updated_at")
    .not("status", "eq", "cancelled")
    .order("received_date", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/inventory/delivery-notes — create draft delivery note
export async function POST(req: NextRequest) {
  const auth = await requireAction(req, "manage_catalog");
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  let body: {
    supplierName?: string;
    supplierId?: string;
    documentNumber?: string;
    receivedDate?: string;
    notes?: string;
    items?: Array<{
      itemId?: string;
      description: string;
      orderedQuantity?: number;
      deliveredQuantity?: number;
      countedQuantity?: number;
      unitOfMeasure?: string;
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = getServiceSupabase();

  // Get user name for audit
  const { data: profile } = await db.from("profiles").select("name").eq("id", userId).single();
  const createdBy = (profile as { name?: string } | null)?.name ?? userId;

  const now = new Date().toISOString();

  const { data: noteRow, error: noteErr } = await db.from("delivery_notes").insert({
    supplier_id:     body.supplierId ?? null,
    supplier_name:   body.supplierName ?? null,
    document_number: body.documentNumber ?? null,
    received_date:   body.receivedDate ?? now.slice(0, 10),
    status:          "draft",
    notes:           body.notes ?? "",
    created_by:      createdBy,
    created_at:      now,
    updated_at:      now,
  }).select("id").single();

  if (noteErr || !noteRow) {
    return NextResponse.json({ error: noteErr?.message ?? "Failed to create" }, { status: 500 });
  }

  const noteId = (noteRow as { id: string }).id;

  // Insert items if provided
  if (body.items && body.items.length > 0) {
    const itemRows = body.items.map(it => ({
      delivery_note_id:   noteId,
      item_id:            it.itemId ?? null,
      description:        it.description,
      ordered_quantity:   it.orderedQuantity ?? null,
      delivered_quantity: it.deliveredQuantity ?? null,
      counted_quantity:   it.countedQuantity ?? null,
      unit_of_measure:    it.unitOfMeasure ?? null,
      status:             it.itemId ? "counted" : "pending_mapping",
      created_at:         now,
      updated_at:         now,
    }));
    const { error: itemsErr } = await db.from("delivery_note_items").insert(itemRows);
    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message, deliveryNoteId: noteId }, { status: 500 });
    }
  }

  return NextResponse.json({ deliveryNoteId: noteId }, { status: 201 });
}
