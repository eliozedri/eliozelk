/**
 * Apply catalog source-of-truth unification migrations (M1–M4).
 * Usage: SUPABASE_PAT=<pat> node_modules/.bin/tsx scripts/apply-catalog-unification.ts
 *
 * Migrations applied (in order):
 *   20260520100000_catalog_metadata_schema.sql    — ADD COLUMN metadata JSONB
 *   20260520110000_catalog_core_upsert.sql         — UPSERT ~60 core items
 *   20260520120000_catalog_safety_accessories.sql  — UPSERT 37 sa-* items
 *   20260520130000_catalog_expanded_extraction.sql — UPSERT 4 additional items
 *
 * All migrations are additive UPSERT / ADD COLUMN IF NOT EXISTS.
 * No DROP, DELETE, or destructive operations.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = "gtevmcnasvrahzfdqrqk";

if (!PAT) {
  console.error("Error: Set SUPABASE_PAT=<your-personal-access-token>");
  console.error("Get your PAT from: https://app.supabase.com/account/tokens");
  process.exit(1);
}

const MIGRATIONS = [
  "20260520100000_catalog_metadata_schema.sql",
  "20260520110000_catalog_core_upsert.sql",
  "20260520120000_catalog_safety_accessories.sql",
  "20260520130000_catalog_expanded_extraction.sql",
];

async function applyMigration(filename: string) {
  const sql = readFileSync(
    join(import.meta.dirname, "../supabase/migrations", filename),
    "utf-8"
  );

  console.log(`\nApplying: ${filename}`);

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  const body = await res.text();
  if (!res.ok) {
    console.error(`  ✗ FAILED: ${body}`);
    process.exit(1);
  }

  console.log(`  ✓ Applied successfully`);
}

for (const migration of MIGRATIONS) {
  await applyMigration(migration);
}

console.log("\n✓ All 4 catalog migrations applied successfully.");

// Verification query
console.log("\nRunning verification: counting catalog_items by source...");

const verifyRes = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        SELECT
          COUNT(*) FILTER (WHERE id LIKE 'svc-%') AS svc_items,
          COUNT(*) FILTER (WHERE id LIKE 'prd-%') AS prd_items,
          COUNT(*) FILTER (WHERE id LIKE 'sgn-%') AS sgn_items,
          COUNT(*) FILTER (WHERE id LIKE 'sa-%')  AS sa_items,
          COUNT(*) AS total
        FROM catalog_items;
      `,
    }),
  }
);

const verifyBody = await verifyRes.json();
console.log("Catalog counts:", JSON.stringify(verifyBody, null, 2));

// Check עגלת חץ specifically
const arrowCheckRes = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `SELECT id, name, type, category, is_active FROM catalog_items WHERE id = 'svc-traf-004';`,
    }),
  }
);

const arrowBody = await arrowCheckRes.json();
console.log("\nעגלת חץ (svc-traf-004):", JSON.stringify(arrowBody, null, 2));
