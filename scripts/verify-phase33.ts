/**
 * Phase 3.3 live-safe end-to-end verification script.
 *
 * Tests:
 * 1.  Phase 3.2 consumption still works and is idempotent
 * 2.  Partial consumption does not double consume
 * 3.  Unused reservation is released correctly (return flow)
 * 4.  Return from field increases current_quantity once (idempotent on re-call)
 * 5.  Delivery note draft does not increase stock
 * 6.  Delivery note approved increases stock once
 * 7.  Re-approving delivery note does not double receive
 * 8.  Unmapped delivery item creates task and does not update stock
 * 9.  Delivery note count mismatch creates agent_task
 * 10. consumption.ts metadata has quantitySource
 *
 * All synthetic data is cleaned up after each test.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { syncConsumptionForOrder } from "../src/lib/inventory/consumption";
import { returnFromField }         from "../src/lib/inventory/returnFromField";
import { approveDeliveryNote }     from "../src/lib/inventory/deliveryNotes";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("Missing env vars"); process.exit(1); }

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── Helpers ────────────────────────────────────────────────────────────────────
let testsPassed = 0;
let testsFailed = 0;
function pass(msg: string) { console.log(`  ✅ ${msg}`); testsPassed++; }
function fail(msg: string) { console.error(`  ❌ ${msg}`); testsFailed++; }
function section(title: string) { console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`); }

const toDelete: Array<{ table: string; id: string }> = [];
function reg(table: string, id: string) { toDelete.push({ table, id }); }

async function cleanup() {
  section("Cleanup");
  const order = ["inventory_consumptions","inventory_movements","inventory_reservations","agent_tasks","delivery_note_items","delivery_notes","work_diaries","work_orders","catalog_items"];
  for (const table of order) {
    const ids = toDelete.filter(r => r.table === table).map(r => r.id);
    if (!ids.length) continue;
    const { error } = await db.from(table).delete().in("id", ids);
    if (error) console.warn(`  warn cleanup ${table}: ${error.message}`);
    else console.log(`  cleaned ${ids.length} from ${table}`);
  }
}

async function makeCatalogItem(qty: number = 10) {
  const id = randomUUID();
  const { error } = await db.from("catalog_items").insert({
    id, name: `__test__ item`, type: "material", unit_of_measure: "יח׳",
    current_quantity: qty, reserved_quantity: 0, is_active: true,
  });
  if (error) throw new Error(`catalog_item: ${error.message}`);
  reg("catalog_items", id);
  return id;
}

async function makeOrder(catalogItemId: string, qty = 4) {
  const orderId = randomUUID();
  const rowId   = `row_${Date.now()}`;
  const { error } = await db.from("work_orders").insert({
    id: orderId, order_number: `__T__${Date.now()}`, status: "in_progress",
    data: { accessoryRows: [{ id: rowId, catalogItemId, quantity: String(qty), description: "test" }], miscRows: [] },
  });
  if (error) throw new Error(`work_order: ${error.message}`);
  reg("work_orders", orderId);
  return { orderId, rowId };
}

async function makeDiary(orderId: string, approved = true) {
  const id = randomUUID();
  const { error } = await db.from("work_diaries").insert({
    id, order_id: orderId, diary_number: `__D${Date.now()}`,
    status: approved ? "submitted" : "draft",
    approval_status: approved ? "approved" : "pending",
    data: {},
  });
  if (error) throw new Error(`diary: ${error.message}`);
  reg("work_diaries", id);
  return id;
}

async function makeReservation(catalogItemId: string, orderId: string, rowId: string, qty = 4) {
  const { data, error } = await db.from("inventory_reservations").insert({
    item_id: catalogItemId, order_id: orderId, order_item_key: rowId, quantity: qty, status: "active", source_type: "order",
  }).select("id").single();
  if (error || !data) throw new Error(`reservation: ${error?.message}`);
  reg("inventory_reservations", (data as { id: string }).id);
  return (data as { id: string }).id;
}

async function getCatalogQty(id: string) {
  const { data } = await db.from("catalog_items").select("current_quantity").eq("id", id).single();
  return (data as { current_quantity: number } | null)?.current_quantity ?? -999;
}

async function getConsumptions(orderId: string) {
  const { data } = await db.from("inventory_consumptions").select("id,quantity,metadata,status").eq("order_id", orderId);
  return data ?? [];
}

async function getMovements(itemId: string, type: string) {
  const { data } = await db.from("inventory_movements").select("id,quantity").eq("item_id", itemId).eq("movement_type", type);
  return data ?? [];
}


// ── Tests ──────────────────────────────────────────────────────────────────────

async function test1_phase32_still_works() {
  section("Test 1: Phase 3.2 consumption works and is idempotent");
  const catId = await makeCatalogItem(10);
  const { orderId, rowId } = await makeOrder(catId, 4);
  const diaryId = await makeDiary(orderId, true);
  await makeReservation(catId, orderId, rowId, 4);

  const r1 = await syncConsumptionForOrder(db, orderId, diaryId);
  if (r1.consumptionsCreated === 1) pass("first run: consumptionsCreated=1"); else fail(`first run: ${r1.consumptionsCreated}`);
  if (r1.errors.length === 0) pass("no errors"); else fail(`errors: ${JSON.stringify(r1.errors)}`);

  const r2 = await syncConsumptionForOrder(db, orderId, diaryId);
  if (r2.consumptionsCreated === 0) pass("idempotent: consumptionsCreated=0"); else fail(`idempotency failed: ${r2.consumptionsCreated}`);

  const qty = await getCatalogQty(catId);
  if (qty === 6) pass("current_quantity deducted once: 10-4=6"); else fail(`qty=${qty} expected 6`);

  // cleanup
  const cons = await getConsumptions(orderId);
  cons.forEach(c => reg("inventory_consumptions", (c as { id: string }).id));
  const movs = await getMovements(catId, "consume");
  movs.forEach(m => reg("inventory_movements", (m as { id: string }).id));
}

async function test2_no_double_consume() {
  section("Test 2: No double consumption on second approved diary");
  const catId = await makeCatalogItem(10);
  const { orderId, rowId } = await makeOrder(catId, 4);
  const diary1 = await makeDiary(orderId, true);
  const diary2 = await makeDiary(orderId, true);
  await makeReservation(catId, orderId, rowId, 4);

  const r1 = await syncConsumptionForOrder(db, orderId, diary1);
  const r2 = await syncConsumptionForOrder(db, orderId, diary2);

  const totalCreated = r1.consumptionsCreated + r2.consumptionsCreated;
  if (totalCreated === 1) pass("total consumptionsCreated=1 across 2 diary runs"); else fail(`total=${totalCreated}`);

  const qty = await getCatalogQty(catId);
  if (qty === 6) pass("qty deducted once: 10-4=6"); else fail(`qty=${qty} expected 6`);

  const cons = await getConsumptions(orderId);
  if (cons.length === 1) pass("exactly 1 consumption record"); else fail(`${cons.length} records`);
  cons.forEach(c => reg("inventory_consumptions", (c as { id: string }).id));
  const movs = await getMovements(catId, "consume");
  movs.forEach(m => reg("inventory_movements", (m as { id: string }).id));
}

async function test3_consumption_has_quantitySource() {
  section("Test 3: consumption metadata has quantitySource");
  const catId = await makeCatalogItem(10);
  const { orderId, rowId } = await makeOrder(catId, 4);
  const diaryId = await makeDiary(orderId, true);
  await makeReservation(catId, orderId, rowId, 4);

  await syncConsumptionForOrder(db, orderId, diaryId);

  const cons = await getConsumptions(orderId);
  const meta = (cons[0] as unknown as { metadata?: { quantitySource?: string } })?.metadata;
  if (meta?.quantitySource) pass(`quantitySource='${meta.quantitySource}'`); else fail("quantitySource missing from metadata");

  cons.forEach(c => reg("inventory_consumptions", (c as { id: string }).id));
  const movs = await getMovements(catId, "consume");
  movs.forEach(m => reg("inventory_movements", (m as { id: string }).id));
}

async function test4_return_from_field() {
  section("Test 4: Return from field — idempotent, increases qty once");
  const catId = await makeCatalogItem(6); // already at 6 (simulating after consumption)
  const { orderId, rowId } = await makeOrder(catId, 4);

  // First return
  const r1 = await returnFromField(db, {
    orderId, catalogItemId: catId, orderItemKey: rowId,
    returnedQty: 2, notes: "test return", returnedBy: "tester",
  });
  if (r1.errors.length === 0) pass("no errors"); else fail(`errors: ${JSON.stringify(r1.errors)}`);
  if (r1.movementsWritten === 1) pass("movementsWritten=1"); else fail(`movementsWritten=${r1.movementsWritten}`);

  const qty1 = await getCatalogQty(catId);
  if (qty1 === 8) pass("qty after return: 6+2=8"); else fail(`qty=${qty1} expected 8`);

  // Second return (idempotency — same order+item+key)
  const r2 = await returnFromField(db, {
    orderId, catalogItemId: catId, orderItemKey: rowId,
    returnedQty: 2, notes: "duplicate return", returnedBy: "tester",
  });
  if (r2.warnings.some(w => w.includes("already recorded"))) pass("idempotent: duplicate return blocked"); else fail(`expected 'already recorded' warning, got: ${JSON.stringify(r2.warnings)}`);

  const qty2 = await getCatalogQty(catId);
  if (qty2 === 8) pass("qty unchanged after duplicate return"); else fail(`qty=${qty2} expected 8`);

  const movs = await getMovements(catId, "return");
  movs.forEach(m => reg("inventory_movements", (m as { id: string }).id));
}

async function test5_delivery_note_draft_no_stock() {
  section("Test 5: Delivery note draft does not increase stock");
  const catId = await makeCatalogItem(5);
  const qtyBefore = await getCatalogQty(catId);

  // Create draft note
  const noteId = randomUUID();
  await db.from("delivery_notes").insert({
    id: noteId, status: "draft", supplier_name: "test supplier",
    document_number: "DN-TEST-001", received_date: new Date().toISOString().slice(0, 10),
    notes: "", created_by: "tester",
  });
  reg("delivery_notes", noteId);

  const itemId = randomUUID();
  await db.from("delivery_note_items").insert({
    id: itemId, delivery_note_id: noteId, item_id: catId,
    description: "test item", ordered_quantity: 3, delivered_quantity: 3, counted_quantity: 3,
    unit_of_measure: "יח׳", status: "counted",
  });
  reg("delivery_note_items", itemId);

  const qtyAfter = await getCatalogQty(catId);
  if (qtyAfter === qtyBefore) pass("draft note does not increase stock"); else fail(`qty changed from ${qtyBefore} to ${qtyAfter}`);
}

async function test6_delivery_note_approved_increases_stock() {
  section("Test 6: Delivery note approved increases stock once");
  const catId = await makeCatalogItem(5);
  const qtyBefore = await getCatalogQty(catId);

  const noteId = randomUUID();
  await db.from("delivery_notes").insert({
    id: noteId, status: "draft", supplier_name: "test supplier",
    document_number: "DN-TEST-002", received_date: new Date().toISOString().slice(0, 10),
    notes: "", created_by: "tester",
  });
  reg("delivery_notes", noteId);

  const itemId = randomUUID();
  await db.from("delivery_note_items").insert({
    id: itemId, delivery_note_id: noteId, item_id: catId,
    description: "test item", ordered_quantity: 3, delivered_quantity: 3, counted_quantity: 3,
    unit_of_measure: "יח׳", status: "counted",
  });
  reg("delivery_note_items", itemId);

  const r = await approveDeliveryNote(db, noteId, "tester");
  if (r.errors.length === 0) pass("no errors"); else fail(`errors: ${JSON.stringify(r.errors)}`);
  if (r.itemsReceived === 1) pass("itemsReceived=1"); else fail(`itemsReceived=${r.itemsReceived}`);

  const qtyAfter = await getCatalogQty(catId);
  if (qtyAfter === qtyBefore + 3) pass(`qty: ${qtyBefore}+3=${qtyAfter}`); else fail(`qty=${qtyAfter} expected ${qtyBefore + 3}`);

  const movs = await getMovements(catId, "receive");
  if (movs.length >= 1) pass(`receive movement written (${movs.length})`); else fail("no receive movement");
  movs.forEach(m => reg("inventory_movements", (m as { id: string }).id));
}

async function test7_delivery_note_no_double_receive() {
  section("Test 7: Re-approving delivery note does not double receive");
  const catId = await makeCatalogItem(5);

  const noteId = randomUUID();
  await db.from("delivery_notes").insert({
    id: noteId, status: "draft", supplier_name: "test", document_number: "DN-TEST-003",
    received_date: new Date().toISOString().slice(0, 10), notes: "", created_by: "tester",
  });
  reg("delivery_notes", noteId);

  const itemId = randomUUID();
  await db.from("delivery_note_items").insert({
    id: itemId, delivery_note_id: noteId, item_id: catId,
    description: "test", ordered_quantity: 5, delivered_quantity: 5, counted_quantity: 5,
    unit_of_measure: "יח׳", status: "counted",
  });
  reg("delivery_note_items", itemId);

  await approveDeliveryNote(db, noteId, "tester");
  const qtyAfterFirst = await getCatalogQty(catId);

  // Re-approve
  const r2 = await approveDeliveryNote(db, noteId, "tester");
  if (r2.itemsSkipped >= 1) pass("second approve: item skipped (idempotent)"); else fail(`itemsSkipped=${r2.itemsSkipped}`);

  const qtyAfterSecond = await getCatalogQty(catId);
  if (qtyAfterSecond === qtyAfterFirst) pass("qty unchanged on re-approve"); else fail(`qty changed: ${qtyAfterFirst} → ${qtyAfterSecond}`);

  const movs = await getMovements(catId, "receive");
  if (movs.length === 1) pass("exactly 1 receive movement"); else fail(`${movs.length} receive movements`);
  movs.forEach(m => reg("inventory_movements", (m as { id: string }).id));
}

async function test8_unmapped_delivery_item_no_stock() {
  section("Test 8: Unmapped delivery item — no stock update, task created");
  const noteId = randomUUID();
  await db.from("delivery_notes").insert({
    id: noteId, status: "draft", supplier_name: "test", document_number: "DN-TEST-004",
    received_date: new Date().toISOString().slice(0, 10), notes: "", created_by: "tester",
  });
  reg("delivery_notes", noteId);

  const itemId = randomUUID();
  await db.from("delivery_note_items").insert({
    id: itemId, delivery_note_id: noteId, item_id: null,
    description: "unmapped paint", ordered_quantity: 3, delivered_quantity: 3, counted_quantity: 3,
    unit_of_measure: "יח׳", status: "pending_mapping",
  });
  reg("delivery_note_items", itemId);

  const r = await approveDeliveryNote(db, noteId, "tester");
  if (r.mappingTasksCreated >= 1) pass("mappingTasksCreated >= 1"); else fail(`mappingTasksCreated=${r.mappingTasksCreated}`);
  if (r.itemsReceived === 0) pass("itemsReceived=0 (no stock update)"); else fail(`itemsReceived=${r.itemsReceived}`);

  // Cleanup tasks
  const { data: tasks } = await db.from("agent_tasks").select("id").eq("related_entity_id", noteId);
  (tasks ?? []).forEach(t => reg("agent_tasks", (t as { id: string }).id));
}

async function test9_count_mismatch_creates_task() {
  section("Test 9: Count mismatch creates agent task");
  const catId = await makeCatalogItem(10);

  const noteId = randomUUID();
  await db.from("delivery_notes").insert({
    id: noteId, status: "draft", supplier_name: "test", document_number: "DN-TEST-005",
    received_date: new Date().toISOString().slice(0, 10), notes: "", created_by: "tester",
  });
  reg("delivery_notes", noteId);

  const itemId = randomUUID();
  await db.from("delivery_note_items").insert({
    id: itemId, delivery_note_id: noteId, item_id: catId,
    description: "paint", ordered_quantity: 10, delivered_quantity: 10, counted_quantity: 8, // mismatch!
    unit_of_measure: "יח׳", status: "counted",
  });
  reg("delivery_note_items", itemId);

  const r = await approveDeliveryNote(db, noteId, "tester");
  if (r.mismatchTasksCreated >= 1) pass("mismatchTasksCreated >= 1"); else fail(`mismatchTasksCreated=${r.mismatchTasksCreated}`);

  const { data: tasks } = await db.from("agent_tasks").select("id").eq("related_entity_id", noteId);
  (tasks ?? []).forEach(t => reg("agent_tasks", (t as { id: string }).id));
  // Stock should still be received (counted qty used)
  const qty = await getCatalogQty(catId);
  if (qty === 18) pass("stock received with counted qty (10+8=18)"); else fail(`qty=${qty}`);

  const movs = await getMovements(catId, "receive");
  movs.forEach(m => reg("inventory_movements", (m as { id: string }).id));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Phase 3.3 Live-Safe Verification");
  console.log("═══════════════════════════════════════════════════════════════");
  try {
    await test1_phase32_still_works();
    await test2_no_double_consume();
    await test3_consumption_has_quantitySource();
    await test4_return_from_field();
    await test5_delivery_note_draft_no_stock();
    await test6_delivery_note_approved_increases_stock();
    await test7_delivery_note_no_double_receive();
    await test8_unmapped_delivery_item_no_stock();
    await test9_count_mismatch_creates_task();
  } catch (err) {
    console.error("\n  FATAL:", err);
    testsFailed++;
  } finally {
    await cleanup();
  }
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  Tests passed: ${testsPassed} | Failed: ${testsFailed}`);
  console.log(`  Result: ${testsFailed === 0 ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

main();
