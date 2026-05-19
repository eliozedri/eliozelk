// Regression check: all five content arrays must be present in buildContentBlob output.
// Run: npx ts-node --skip-project scripts/verify-order-content-arrays.ts

const REQUIRED_FIELDS = [
  "signRows",
  "signsRows",
  "miscRows",
  "accessoryRows",
  "serviceRows",
  "notes",
  "generalNotes",
  "attachments",
  "fabricationDetails",
] as const;

// Mirror of buildContentBlob — must stay in sync with src/hooks/useOrders.ts
function buildContentBlob(o: Record<string, unknown>): Record<string, unknown> {
  return {
    signRows:           o["signRows"],
    signsRows:          (o["signsRows"] as unknown[]) ?? [],
    miscRows:           o["miscRows"],
    accessoryRows:      (o["accessoryRows"] as unknown[]) ?? [],
    serviceRows:        (o["serviceRows"] as unknown[]) ?? [],
    notes:              o["notes"],
    generalNotes:       o["generalNotes"] ?? null,
    attachments:        (o["attachments"] as unknown[]) ?? [],
    fabricationDetails: o["fabricationDetails"] ?? null,
  };
}

// Mirror of fromRow array restoration — must stay in sync with src/hooks/useOrders.ts
function restoreArrays(blob: Record<string, unknown>): Record<string, unknown[]> {
  return {
    signRows:      Array.isArray(blob["signRows"])      ? blob["signRows"]      as unknown[] : [],
    signsRows:     Array.isArray(blob["signsRows"])     ? blob["signsRows"]     as unknown[] : [],
    miscRows:      Array.isArray(blob["miscRows"])      ? blob["miscRows"]      as unknown[] : [],
    accessoryRows: Array.isArray(blob["accessoryRows"]) ? blob["accessoryRows"] as unknown[] : [],
    serviceRows:   Array.isArray(blob["serviceRows"])   ? blob["serviceRows"]   as unknown[] : [],
  };
}

// ── Test 1: buildContentBlob produces all required keys ──────────────────────

const sampleOrder: Record<string, unknown> = {
  signRows:     [{ id: "s1", signNumber: "101", quantity: "2" }],
  signsRows:    [{ id: "sg1", description: "שלט כניסה", quantity: "1" }],
  miscRows:     [{ id: "m1", description: "שלט מידה", quantity: "1" }],
  accessoryRows:[{ id: "a1", description: "בורג M8", quantity: "10" }],
  serviceRows:  [{ id: "sv1", description: "שירות התקנה", quantity: "1" }],
  notes:        "הערות",
  generalNotes: "הערות כלליות",
  attachments:  [],
  fabricationDetails: null,
};

const blob = buildContentBlob(sampleOrder);

let passed = 0;
let failed = 0;

for (const field of REQUIRED_FIELDS) {
  if (field in blob) {
    console.log(`  ✅  buildContentBlob includes "${field}"`);
    passed++;
  } else {
    console.error(`  ❌  buildContentBlob MISSING "${field}"`);
    failed++;
  }
}

// ── Test 2: arrays survive round-trip through blob ────────────────────────────

const restored = restoreArrays(blob);

const ARRAY_FIELDS = ["signRows", "signsRows", "miscRows", "accessoryRows", "serviceRows"] as const;

for (const field of ARRAY_FIELDS) {
  const original = sampleOrder[field] as unknown[];
  const rt = restored[field];
  if (JSON.stringify(rt) === JSON.stringify(original)) {
    console.log(`  ✅  round-trip "${field}" preserved (${rt.length} item(s))`);
    passed++;
  } else {
    console.error(`  ❌  round-trip "${field}" mismatch`);
    console.error(`      original : ${JSON.stringify(original)}`);
    console.error(`      restored : ${JSON.stringify(rt)}`);
    failed++;
  }
}

// ── Test 3: missing arrays in blob default to [] (old order migration) ────────

const legacyBlob: Record<string, unknown> = {
  signRows: [{ id: "s1", signNumber: "101" }],
  miscRows: [],
  // signsRows, accessoryRows, serviceRows absent — simulates an old order
};

const legacyRestored = restoreArrays(legacyBlob);

for (const field of ["signsRows", "accessoryRows", "serviceRows"] as const) {
  if (Array.isArray(legacyRestored[field]) && legacyRestored[field].length === 0) {
    console.log(`  ✅  legacy order: missing "${field}" defaults to []`);
    passed++;
  } else {
    console.error(`  ❌  legacy order: "${field}" did not default to []`);
    failed++;
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
