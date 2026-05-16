import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReceiveResult {
  itemsReceived: number;
  itemsSkipped: number;
  mismatchTasksCreated: number;
  mappingTasksCreated: number;
  movementsWritten: number;
  warnings: string[];
  errors: string[];
  durationMs: number;
}

interface DeliveryNoteRow {
  id: string;
  status: string;
  supplier_name: string | null;
  document_number: string | null;
}

interface DeliveryNoteItemRow {
  id: string;
  delivery_note_id: string;
  item_id: string | null;
  description: string;
  ordered_quantity: number | null;
  delivered_quantity: number | null;
  counted_quantity: number | null;
  unit_of_measure: string | null;
  status: string;
}

// Prevent double-receiving: check if item is already 'approved' for this note.
// The partial unique index (uq_delivery_note_item_approved) enforces this at DB level,
// but we check here too for a clear error message.
async function isAlreadyApproved(
  db: SupabaseClient,
  noteItemId: string,
): Promise<boolean> {
  const { data } = await db.from("delivery_note_items")
    .select("status").eq("id", noteItemId).single();
  return (data as { status: string } | null)?.status === "approved";
}

export async function approveDeliveryNote(
  db: SupabaseClient,
  deliveryNoteId: string,
  approvedBy: string,
): Promise<ReceiveResult> {
  const start = Date.now();
  const result: ReceiveResult = {
    itemsReceived: 0, itemsSkipped: 0, mismatchTasksCreated: 0,
    mappingTasksCreated: 0, movementsWritten: 0,
    warnings: [], errors: [], durationMs: 0,
  };

  // Load delivery note
  const { data: noteData, error: noteErr } = await db.from("delivery_notes")
    .select("id,status,supplier_name,document_number")
    .eq("id", deliveryNoteId).single();
  if (noteErr || !noteData) {
    result.errors.push(`delivery note not found: ${noteErr?.message ?? "no data"}`);
    result.durationMs = Date.now() - start;
    return result;
  }
  const note = noteData as DeliveryNoteRow;
  if (note.status === "cancelled") {
    result.errors.push("cannot approve a cancelled delivery note");
    result.durationMs = Date.now() - start;
    return result;
  }

  // Load items
  const { data: itemsData, error: itemsErr } = await db.from("delivery_note_items")
    .select("id,delivery_note_id,item_id,description,ordered_quantity,delivered_quantity,counted_quantity,unit_of_measure,status")
    .eq("delivery_note_id", deliveryNoteId);
  if (itemsErr) {
    result.errors.push(`load items: ${itemsErr.message}`);
    result.durationMs = Date.now() - start;
    return result;
  }
  const items = (itemsData ?? []) as DeliveryNoteItemRow[];
  if (items.length === 0) {
    result.warnings.push("delivery note has no items");
    result.durationMs = Date.now() - start;
    return result;
  }

  const now = new Date().toISOString();

  for (const item of items) {
    // Idempotency: skip already-approved items
    const alreadyDone = await isAlreadyApproved(db, item.id);
    if (alreadyDone) {
      result.itemsSkipped++;
      continue;
    }

    const receiveQty = item.counted_quantity ?? item.delivered_quantity ?? 0;

    // Unmapped: no catalog item → create mapping task, skip stock update
    if (!item.item_id) {
      result.mappingTasksCreated++;
      await db.from("agent_tasks").insert({
        agent_id:            "inventory-agent",
        related_entity_type: "delivery_note",
        related_entity_id:   deliveryNoteId,
        title:               `מיפוי פריט תעודת משלוח — "${item.description}"`,
        description:         `תעודה ${note.document_number ?? deliveryNoteId} | פריט "${item.description}" לא מקושר לקטלוג | כמות שנספרה: ${receiveQty}`,
        priority:            "normal",
        status:              "open",
        recommended_action:  "קשר פריט זה לקטלוג לפני אישור הקליטה",
        requires_approval:   true,
      });
      // Mark item as pending_mapping (keep current status)
      continue;
    }

    if (receiveQty <= 0) {
      result.warnings.push(`item ${item.id} has no counted/delivered quantity — skipping`);
      result.itemsSkipped++;
      continue;
    }

    // Mismatch detection
    const docQty = item.delivered_quantity ?? item.ordered_quantity;
    if (docQty !== null && item.counted_quantity !== null &&
        Math.abs((item.counted_quantity) - docQty) > 0.0001) {
      result.mismatchTasksCreated++;
      await db.from("agent_tasks").insert({
        agent_id:            "inventory-agent",
        related_entity_type: "delivery_note",
        related_entity_id:   deliveryNoteId,
        title:               `פער ספירה בתעודת משלוח — "${item.description}"`,
        description:         `תעודה ${note.document_number ?? deliveryNoteId} | נרשם: ${docQty} | נספר: ${item.counted_quantity} | פער: ${Math.abs(item.counted_quantity - docQty)}`,
        priority:            "high",
        status:              "open",
        recommended_action:  "בדוק ספירה ותקן לפני עדכון מלאי",
        requires_approval:   true,
      });
    }

    // Load current quantity for the catalog item
    const { data: catRow, error: catErr } = await db.from("catalog_items")
      .select("current_quantity").eq("id", item.item_id).single();
    if (catErr || !catRow) {
      result.warnings.push(`catalog item ${item.item_id} not found — skipping stock update`);
      result.itemsSkipped++;
      continue;
    }

    // Write receive movement
    const { error: movErr } = await db.from("inventory_movements").insert({
      item_id:       item.item_id,
      movement_type: "receive",
      quantity:      receiveQty,
      source_type:   "delivery_note",
      source_id:     deliveryNoteId,
      notes:         `קליטת סחורה — ${item.description} | תעודה ${note.document_number ?? deliveryNoteId}${note.supplier_name ? ` | ספק: ${note.supplier_name}` : ""}`,
      created_by:    approvedBy,
      created_at:    now,
    });
    if (movErr) {
      result.warnings.push(`movement write failed (item=${item.item_id}): ${movErr.message}`);
      result.itemsSkipped++;
      continue;
    }
    result.movementsWritten++;

    // Update current_quantity
    const newQty = (catRow as { current_quantity: number }).current_quantity + receiveQty;
    const { error: updateErr } = await db.from("catalog_items")
      .update({ current_quantity: newQty, updated_at: now })
      .eq("id", item.item_id);
    if (updateErr) {
      result.warnings.push(`qty update failed (item=${item.item_id}): ${updateErr.message}`);
    }

    // Mark item as approved (idempotency — unique index enforces this)
    await db.from("delivery_note_items")
      .update({ status: "approved", updated_at: now })
      .eq("id", item.id);

    result.itemsReceived++;
  }

  // Mark the delivery note as approved
  await db.from("delivery_notes")
    .update({ status: "approved", updated_at: now })
    .eq("id", deliveryNoteId);

  result.durationMs = Date.now() - start;
  return result;
}
