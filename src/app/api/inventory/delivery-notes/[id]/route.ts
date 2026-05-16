import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getServiceSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// GET /api/inventory/delivery-notes/[id] — note + items
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getServiceSupabase();

  const [noteRes, itemsRes] = await Promise.all([
    db.from("delivery_notes").select("*").eq("id", id).single(),
    db.from("delivery_note_items").select("*").eq("delivery_note_id", id).order("created_at"),
  ]);

  if (noteRes.error) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ note: noteRes.data, items: itemsRes.data ?? [] });
}

// PATCH /api/inventory/delivery-notes/[id] — update fields or counted quantities
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getServiceSupabase();
  const now = new Date().toISOString();

  let body: {
    status?: string;
    notes?: string;
    documentNumber?: string;
    supplierName?: string;
    receivedDate?: string;
    items?: Array<{
      id: string;
      countedQuantity?: number;
      status?: string;
      itemId?: string;
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Update note-level fields
  const noteUpdate: Record<string, unknown> = { updated_at: now };
  if (body.status        !== undefined) noteUpdate.status          = body.status;
  if (body.notes         !== undefined) noteUpdate.notes           = body.notes;
  if (body.documentNumber !== undefined) noteUpdate.document_number = body.documentNumber;
  if (body.supplierName  !== undefined) noteUpdate.supplier_name   = body.supplierName;
  if (body.receivedDate  !== undefined) noteUpdate.received_date   = body.receivedDate;

  const { error: noteErr } = await db.from("delivery_notes").update(noteUpdate).eq("id", id);
  if (noteErr) return NextResponse.json({ error: noteErr.message }, { status: 500 });

  // Update item-level counted quantities
  if (body.items && body.items.length > 0) {
    for (const it of body.items) {
      const itemUpdate: Record<string, unknown> = { updated_at: now };
      if (it.countedQuantity !== undefined) itemUpdate.counted_quantity = it.countedQuantity;
      if (it.status          !== undefined) itemUpdate.status           = it.status;
      if (it.itemId          !== undefined) itemUpdate.item_id          = it.itemId;

      await db.from("delivery_note_items")
        .update(itemUpdate)
        .eq("id", it.id)
        .eq("delivery_note_id", id);
    }
  }

  return NextResponse.json({ ok: true });
}
