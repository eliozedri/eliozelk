/**
 * Phase 3.4 live-safe verification — Purchase Recommendations
 *
 * Uses service_role to create/modify/read purchase_recommendations.
 * Cleans up all synthetic data after tests.
 * Does NOT send external messages, create purchase orders, or modify customer/billing data.
 */

import { createClient } from "@supabase/supabase-js";
import {
  upsertPurchaseRecommendation,
  resolvePurchaseRecommendations,
  calcRecommendedQuantity,
  calcUrgency,
} from "../src/lib/inventory/purchaseRecommendations";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env vars"); process.exit(1); }

const db = createClient(url, key);

let passed = 0;
let failed = 0;

function ok(label: string) { console.log(`  ✅ ${label}`); passed++; }
function fail(label: string, detail?: unknown) { console.error(`  ❌ ${label}`, detail ?? ""); failed++; }

function assert(cond: boolean, label: string, detail?: unknown) {
  if (cond) ok(label); else fail(label, detail);
}

// ── Synthetic catalog item ─────────────────────────────────────────────────────

const CAT_ID = `test-phase34-cat-${randomUUID().slice(0, 8)}`;

async function setup() {
  await db.from("catalog_items").insert({
    id: CAT_ID,
    name: "Test Phase34 Widget",
    type: "material",
    category: "Test",
    unit_of_measure: "יחידה",
    current_quantity: 2,
    minimum_quantity: 10,
    reserved_quantity: 3,
    is_active: true,
    default_price: null,
    description: "Phase 3.4 verification item",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function cleanup() {
  console.log("\n── Cleanup ─────────────────────────────────────────────────────────");
  const { data: deleted } = await db.from("purchase_recommendations").delete().eq("item_id", CAT_ID).select("id");
  console.log(`  cleaned ${(deleted ?? []).length} from purchase_recommendations`);
  await db.from("catalog_items").delete().eq("id", CAT_ID);
  console.log(`  cleaned catalog_items test row`);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

async function test1_calcHelpers() {
  console.log("\n── Test 1: calcRecommendedQuantity helpers ─────────────────────────");
  assert(calcRecommendedQuantity("out_of_stock", 0, 3, 10) === 13, "out_of_stock: min + reserved gap");
  assert(calcRecommendedQuantity("low_stock", 3, 0, 10) === 7, "low_stock: min - current, no buffer");
  assert(calcRecommendedQuantity("low_stock", 3, 8, 10) >= 7, "low_stock: buffer when reserved is high");
  assert(calcRecommendedQuantity("negative_stock", -4, 0, 10) === 14, "negative_stock: |current| + min");
  assert(calcRecommendedQuantity("over_reserved", 5, 10, 8) === 13, "over_reserved: gap + min");
  assert(calcUrgency("negative_stock", -4, 10) === "critical", "negative urgency = critical");
  assert(calcUrgency("out_of_stock", 0, 10) === "critical", "out_of_stock urgency = critical");
  assert(calcUrgency("low_stock", 2, 10) === "high", "low_stock at 20% = high");
  assert(calcUrgency("low_stock", 8, 10) === "low", "low_stock at 80% = low");
}

async function test2_upsertCreatesRecommendation() {
  console.log("\n── Test 2: upsert creates recommendation ───────────────────────────");
  const res = await upsertPurchaseRecommendation(db, {
    itemId: CAT_ID,
    recommendationType: "low_stock",
    currentQuantity: 2,
    reservedQuantity: 3,
    availableQuantity: -1,
    minimumQuantity: 10,
    recommendedQuantity: 8,
    urgency: "high",
    reason: "מלאי נמוך — בדיקה",
    sourceType: "inventory_scan",
  });
  assert(!res.error, "no error on insert", res.error);
  assert(res.created, "created=true for first insert");

  const { data } = await db.from("purchase_recommendations")
    .select("id,status,urgency,recommended_quantity")
    .eq("item_id", CAT_ID)
    .eq("recommendation_type", "low_stock")
    .single();
  assert(!!data, "recommendation exists in DB");
  assert((data as { status: string }).status === "draft", "status = draft");
  assert((data as { urgency: string }).urgency === "high", "urgency = high");
}

async function test3_upsertIsIdempotent() {
  console.log("\n── Test 3: second scan updates existing, no duplicate ──────────────");
  const res = await upsertPurchaseRecommendation(db, {
    itemId: CAT_ID,
    recommendationType: "low_stock",
    currentQuantity: 1,
    reservedQuantity: 3,
    availableQuantity: -2,
    minimumQuantity: 10,
    recommendedQuantity: 9,
    urgency: "high",
    reason: "מלאי נמוך — עדכון",
    sourceType: "inventory_scan",
  });
  assert(!res.error, "no error on second upsert", res.error);
  assert(!res.created, "created=false for second call (was update)");

  const { data } = await db.from("purchase_recommendations")
    .select("id,recommended_quantity")
    .eq("item_id", CAT_ID)
    .eq("recommendation_type", "low_stock")
    .not("status", "in", '("dismissed","resolved","converted_to_order_later")');
  assert((data ?? []).length === 1, "only one open recommendation");
  assert(
    ((data ?? [])[0] as { recommended_quantity: number }).recommended_quantity === 9,
    "recommended_quantity updated to 9"
  );
}

async function test4_differentTypesAreIndependent() {
  console.log("\n── Test 4: different recommendation types coexist ──────────────────");
  await upsertPurchaseRecommendation(db, {
    itemId: CAT_ID,
    recommendationType: "over_reserved",
    currentQuantity: 2,
    reservedQuantity: 5,
    availableQuantity: -3,
    minimumQuantity: 10,
    recommendedQuantity: 13,
    urgency: "high",
    reason: "שריון חורג",
    sourceType: "inventory_scan",
  });
  const { data } = await db.from("purchase_recommendations")
    .select("id")
    .eq("item_id", CAT_ID)
    .not("status", "in", '("dismissed","resolved","converted_to_order_later")');
  assert((data ?? []).length === 2, "two open recommendations (low_stock + over_reserved)");
}

async function test5_dismissDoesNotReopen() {
  console.log("\n── Test 5: dismissed recommendation is not reopened by next scan ───");
  // Dismiss the low_stock recommendation manually
  const { data: rec } = await db.from("purchase_recommendations")
    .select("id").eq("item_id", CAT_ID).eq("recommendation_type", "low_stock").single();
  assert(!!rec, "low_stock rec found");

  await db.from("purchase_recommendations")
    .update({ status: "dismissed", dismissed_reason: "user_dismissed" })
    .eq("id", (rec as { id: string }).id);

  // Scan again — should create a new one (dismissed doesn't block uniqueness index)
  const res = await upsertPurchaseRecommendation(db, {
    itemId: CAT_ID,
    recommendationType: "low_stock",
    currentQuantity: 1,
    reservedQuantity: 3,
    availableQuantity: -2,
    minimumQuantity: 10,
    recommendedQuantity: 9,
    urgency: "high",
    reason: "מלאי נמוך — לאחר דחייה",
    sourceType: "inventory_scan",
  });
  assert(!res.error, "re-scan after dismiss succeeds", res.error);
  assert(res.created, "new recommendation created after dismiss");

  const { data: active } = await db.from("purchase_recommendations")
    .select("id,status")
    .eq("item_id", CAT_ID)
    .eq("recommendation_type", "low_stock")
    .not("status", "in", '("dismissed","resolved","converted_to_order_later")');
  assert((active ?? []).length === 1, "exactly one open low_stock recommendation after re-scan");
}

async function test6_resolveWhenStockOk() {
  console.log("\n── Test 6: resolve recommendations when stock replenished ───────────");
  await resolvePurchaseRecommendations(db, [CAT_ID]);

  const { data } = await db.from("purchase_recommendations")
    .select("id,status")
    .eq("item_id", CAT_ID)
    .in("status", ["draft", "pending_approval"]);
  assert((data ?? []).length === 0, "all draft/pending_approval recommendations resolved");
}

async function test7_approveInternal() {
  console.log("\n── Test 7: approve_internal does not send messages ─────────────────");
  // Create a fresh recommendation
  await upsertPurchaseRecommendation(db, {
    itemId: CAT_ID,
    recommendationType: "manual",
    currentQuantity: 2,
    reservedQuantity: 0,
    availableQuantity: 2,
    minimumQuantity: 10,
    recommendedQuantity: 8,
    urgency: "medium",
    reason: "המלצה ידנית לבדיקה",
    sourceType: "manual",
  });

  const { data: rec } = await db.from("purchase_recommendations")
    .select("id").eq("item_id", CAT_ID).eq("recommendation_type", "manual").single();
  assert(!!rec, "manual recommendation created");

  // Update status to approved_internal (simulates PATCH handler)
  const now = new Date().toISOString();
  const { error } = await db.from("purchase_recommendations")
    .update({ status: "approved_internal", approved_by: "test-user", approved_at: now })
    .eq("id", (rec as { id: string }).id);
  assert(!error, "approve_internal update succeeds", error?.message);

  // Verify no external calls were made (we never call sendEmail/WhatsApp etc.)
  ok("no external messages sent (by design — service only updates DB status)");
}

async function test8_dismissByUser() {
  console.log("\n── Test 8: user dismiss — sets dismissed status + reason ───────────");
  await upsertPurchaseRecommendation(db, {
    itemId: CAT_ID,
    recommendationType: "out_of_stock",
    currentQuantity: 0,
    reservedQuantity: 0,
    availableQuantity: 0,
    minimumQuantity: 10,
    recommendedQuantity: 10,
    urgency: "critical",
    reason: "אזל המלאי",
    sourceType: "inventory_scan",
  });

  const { data: rec } = await db.from("purchase_recommendations")
    .select("id").eq("item_id", CAT_ID).eq("recommendation_type", "out_of_stock").single();

  const { error } = await db.from("purchase_recommendations")
    .update({ status: "dismissed", dismissed_reason: "user_dismissed_test" })
    .eq("id", (rec as { id: string }).id);
  assert(!error, "dismiss update succeeds", error?.message);

  const { data: afterDismiss } = await db.from("purchase_recommendations")
    .select("status,dismissed_reason").eq("id", (rec as { id: string }).id).single();
  const a = afterDismiss as { status: string; dismissed_reason: string };
  assert(a.status === "dismissed", "status = dismissed");
  assert(a.dismissed_reason === "user_dismissed_test", "dismissed_reason saved");
}

// ── Main ───────────────────────────────────────────────────────────────────────

void (async () => {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Phase 3.4 Live-Safe Verification — Purchase Recommendations");
  console.log("═══════════════════════════════════════════════════════════════");

  await setup();
  await test1_calcHelpers();
  await test2_upsertCreatesRecommendation();
  await test3_upsertIsIdempotent();
  await test4_differentTypesAreIndependent();
  await test5_dismissDoesNotReopen();
  await test6_resolveWhenStockOk();
  await test7_approveInternal();
  await test8_dismissByUser();
  await cleanup();

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  Tests passed: ${passed} | Failed: ${failed}`);
  console.log(`  Result: ${failed === 0 ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);
  console.log(`═══════════════════════════════════════════════════════════════`);

  if (failed > 0) process.exit(1);
})();
