/**
 * Phase 3.2 live-safe end-to-end verification script.
 * Creates synthetic test data, exercises syncConsumptionForOrder,
 * verifies idempotency + stock deduction + movement + reservation,
 * then cleans everything up.
 *
 * Run: npx tsx scripts/verify-consumption.ts
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { syncConsumptionForOrder } from "../src/lib/inventory/consumption";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_KEY. Source .env.local first.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function pass(msg: string) { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { console.error(`  ❌ ${msg}`); process.exitCode = 1; }
function info(msg: string) { console.log(`  ℹ  ${msg}`); }

// ── Cleanup registry ───────────────────────────────────────────────────────────

const toDelete: Array<{ table: string; id: string }> = [];
function register(table: string, id: string) { toDelete.push({ table, id }); }

async function cleanup() {
  console.log("\n── Cleanup ──────────────────────────────────────────────────────");
  // Order matters: FK children first
  const order = [
    "inventory_consumptions",
    "inventory_movements",
    "inventory_reservations",
    "work_diaries",
    "work_orders",
    "catalog_items",
    "agent_tasks",
  ];
  for (const table of order) {
    const ids = toDelete.filter(r => r.table === table).map(r => r.id);
    if (ids.length === 0) continue;
    const { error } = await db.from(table).delete().in("id", ids);
    if (error) console.warn(`  warn: cleanup ${table}: ${error.message}`);
    else info(`cleaned up ${ids.length} row(s) from ${table}`);
  }
}

// ── Test data ──────────────────────────────────────────────────────────────────

const TEST_PREFIX = "__verify_consumption__";

async function seedData() {
  console.log("\n── Seeding test data ─────────────────────────────────────────────");

  // 1. Catalog item — quantity = 10
  const catId = randomUUID();
  const { data: catRow, error: catErr } = await db.from("catalog_items").insert({
    id:               catId,
    name:             `${TEST_PREFIX} Paint`,
    type:             "material",
    unit_of_measure:  "ליטר",
    category:         "חומרי גלם",
    current_quantity: 10,
    reserved_quantity: 0,
    is_active:        true,
  }).select("id").single();
  if (catErr || !catRow) throw new Error(`seed catalog_item: ${catErr?.message}`);
  register("catalog_items", catRow.id);
  info(`catalog_item id=${catRow.id} current_quantity=10`);

  // 2. Work order — accessoryRows references catalog item
  const orderId    = randomUUID();
  const accessoryRowId = `acc_${Date.now()}`;
  const { data: orderRow, error: orderErr } = await db.from("work_orders").insert({
    id:           orderId,
    order_number: `${TEST_PREFIX}_ORD`,
    status:       "in_progress",
    data: {
      accessoryRows: [{
        id:            accessoryRowId,
        catalogItemId: catRow.id,
        quantity:      "4",
        description:   "Test paint",
      }],
      miscRows: [],
    },
  }).select("id").single();
  if (orderErr || !orderRow) throw new Error(`seed work_order: ${orderErr?.message}`);
  register("work_orders", orderRow.id);
  info(`work_order id=${orderRow.id}`);

  // 3. Approved work diary
  const diaryId = randomUUID();
  const { data: diaryRow, error: diaryErr } = await db.from("work_diaries").insert({
    id:              diaryId,
    order_id:        orderRow.id,
    diary_number:    `${TEST_PREFIX}_D1`,
    status:          "submitted",
    approval_status: "approved",
    data:            {},
  }).select("id").single();
  if (diaryErr || !diaryRow) throw new Error(`seed work_diary: ${diaryErr?.message}`);
  register("work_diaries", diaryRow.id);
  info(`work_diary id=${diaryRow.id} status=submitted approval_status=approved`);

  // 4. Unapproved diary (for safety-gate test)
  const diaryUnapprovedId = randomUUID();
  const { data: diaryUnapprovedRow, error: diaryUnapprovedErr } = await db.from("work_diaries").insert({
    id:              diaryUnapprovedId,
    order_id:        orderRow.id,
    diary_number:    `${TEST_PREFIX}_D2`,
    status:          "draft",
    approval_status: "pending",
    data:            {},
  }).select("id").single();
  if (diaryUnapprovedErr || !diaryUnapprovedRow) throw new Error(`seed unapproved_diary: ${diaryUnapprovedErr?.message}`);
  register("work_diaries", diaryUnapprovedRow.id);
  info(`unapproved_diary id=${diaryUnapprovedRow.id} status=draft approval_status=pending`);

  // 5. Active reservation — reserved qty = 4
  const { data: resRow, error: resErr } = await db.from("inventory_reservations").insert({
    item_id:        catRow.id,
    order_id:       orderRow.id,
    order_item_key: accessoryRowId,
    quantity:       4,
    status:         "active",
    source_type:    "order",
  }).select("id").single();
  if (resErr || !resRow) throw new Error(`seed reservation: ${resErr?.message}`);
  register("inventory_reservations", resRow.id);
  info(`reservation id=${resRow.id} qty=4 status=active`);

  return {
    catalogItemId:  catRow.id,
    orderId:        orderRow.id,
    diaryId:        diaryRow.id,
    unapprovedDiaryId: diaryUnapprovedRow.id,
    reservationId:  resRow.id,
    accessoryRowId,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

async function runTests(seed: Awaited<ReturnType<typeof seedData>>) {
  const { catalogItemId, orderId, diaryId, unapprovedDiaryId, reservationId, accessoryRowId } = seed;

  // ── Test A: Unapproved diary is blocked ────────────────────────────────────
  console.log("\n── Test A: Unapproved diary blocked ──────────────────────────────");
  const resA = await syncConsumptionForOrder(db, orderId, unapprovedDiaryId);
  if (resA.errors.length > 0 && resA.errors[0].includes("not approved")) {
    pass(`blocked with: ${resA.errors[0]}`);
  } else {
    fail(`expected 'not approved' error, got errors=${JSON.stringify(resA.errors)}, consumptionsCreated=${resA.consumptionsCreated}`);
  }

  // ── Test B: First consumption ──────────────────────────────────────────────
  console.log("\n── Test B: First consumption (approved diary) ────────────────────");
  const resB = await syncConsumptionForOrder(db, orderId, diaryId);
  info(`result: consumptionsCreated=${resB.consumptionsCreated} movementsWritten=${resB.movementsWritten} reservationsConsumed=${resB.reservationsConsumed} errors=${JSON.stringify(resB.errors)} warnings=${JSON.stringify(resB.warnings)}`);

  resB.consumptionsCreated === 1 ? pass("consumptionsCreated = 1") : fail(`consumptionsCreated = ${resB.consumptionsCreated}`);
  resB.movementsWritten >= 1    ? pass(`movementsWritten = ${resB.movementsWritten}`) : fail(`movementsWritten = ${resB.movementsWritten}`);
  resB.reservationsConsumed === 1 ? pass("reservationsConsumed = 1") : fail(`reservationsConsumed = ${resB.reservationsConsumed}`);
  resB.errors.length === 0       ? pass("no errors") : fail(`errors: ${JSON.stringify(resB.errors)}`);

  // Register any new consumptions + movements for cleanup
  const { data: conRows } = await db.from("inventory_consumptions").select("id").eq("order_id", orderId);
  (conRows ?? []).forEach(r => register("inventory_consumptions", r.id));
  const { data: movRows } = await db.from("inventory_movements").select("id").eq("source_id", diaryId);
  (movRows ?? []).forEach(r => register("inventory_movements", r.id));
  const { data: movRows2 } = await db.from("inventory_movements").select("id").eq("source_id", reservationId);
  (movRows2 ?? []).forEach(r => register("inventory_movements", r.id));

  // ── Test C: Idempotency (run again — no duplicate) ─────────────────────────
  console.log("\n── Test C: Idempotency (second run) ─────────────────────────────");
  const resC = await syncConsumptionForOrder(db, orderId, diaryId);
  info(`result: consumptionsCreated=${resC.consumptionsCreated} movementsWritten=${resC.movementsWritten}`);
  resC.consumptionsCreated === 0 ? pass("consumptionsCreated = 0 (idempotent)") : fail(`consumptionsCreated = ${resC.consumptionsCreated} (should be 0)`);
  resC.errors.length === 0       ? pass("no errors") : fail(`errors: ${JSON.stringify(resC.errors)}`);

  // ── Test D: current_quantity deducted exactly once ─────────────────────────
  console.log("\n── Test D: current_quantity deducted exactly once ────────────────");
  const { data: catNow, error: catNowErr } = await db.from("catalog_items")
    .select("current_quantity").eq("id", catalogItemId).single();
  if (catNowErr || !catNow) {
    fail(`could not read catalog item: ${catNowErr?.message}`);
  } else {
    const expected = 10 - 4; // original 10, consume 4 (reservation qty)
    catNow.current_quantity === expected
      ? pass(`current_quantity = ${catNow.current_quantity} (10 - 4 = ${expected})`)
      : fail(`current_quantity = ${catNow.current_quantity}, expected ${expected}`);
  }

  // ── Test E: inventory_movements has exactly one 'consume' movement ─────────
  console.log("\n── Test E: consume movement written once ─────────────────────────");
  const { data: movs, error: movsErr } = await db.from("inventory_movements")
    .select("id,movement_type,quantity")
    .eq("item_id", catalogItemId)
    .eq("movement_type", "consume")
    .eq("source_id", diaryId);
  if (movsErr) {
    fail(`movement query error: ${movsErr.message}`);
  } else {
    movs!.length === 1 ? pass(`exactly 1 consume movement (qty=${movs![0].quantity})`) : fail(`expected 1 consume movement, got ${movs!.length}`);
    movs![0]?.quantity === -4 ? pass("movement quantity = -4") : fail(`movement quantity = ${movs![0]?.quantity}`);
  }

  // ── Test F: Reservation status = 'consumed' ────────────────────────────────
  console.log("\n── Test F: Reservation marked consumed ───────────────────────────");
  const { data: resStatus, error: resStatusErr } = await db.from("inventory_reservations")
    .select("status,release_reason").eq("id", reservationId).single();
  if (resStatusErr || !resStatus) {
    fail(`reservation read error: ${resStatusErr?.message}`);
  } else {
    resStatus.status === "consumed"               ? pass("reservation status = 'consumed'") : fail(`reservation status = '${resStatus.status}'`);
    resStatus.release_reason === "consumed_by_diary" ? pass("release_reason = 'consumed_by_diary'") : fail(`release_reason = '${resStatus.release_reason}'`);
  }

  // ── Test G: inventory_consumptions row exists with correct fields ──────────
  console.log("\n── Test G: Consumption record correct ────────────────────────────");
  const { data: cons, error: consErr } = await db.from("inventory_consumptions")
    .select("status,quantity,order_item_key,reservation_id")
    .eq("order_id", orderId).single();
  if (consErr || !cons) {
    fail(`consumption read error: ${consErr?.message}`);
  } else {
    cons.status === "consumed"             ? pass("consumption status = 'consumed'") : fail(`consumption status = '${cons.status}'`);
    cons.quantity === 4                    ? pass("consumption quantity = 4") : fail(`consumption quantity = ${cons.quantity}`);
    cons.order_item_key === accessoryRowId ? pass("order_item_key matches") : fail(`order_item_key mismatch: ${cons.order_item_key}`);
    cons.reservation_id === reservationId  ? pass("reservation_id linked") : fail(`reservation_id mismatch: ${cons.reservation_id}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Phase 3.2 Live-Safe Verification — syncConsumptionForOrder");
  console.log("═══════════════════════════════════════════════════════════════");

  let seed: Awaited<ReturnType<typeof seedData>> | undefined;
  try {
    seed = await seedData();
    await runTests(seed);
  } catch (err) {
    console.error("\n  FATAL:", err);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }

  const exitCode = process.exitCode ?? 0;
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  Result: ${exitCode === 0 ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  process.exit(exitCode);
}

main();
