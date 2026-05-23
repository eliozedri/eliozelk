/**
 * Apply the notification foundation migration via the Supabase Management API.
 * Usage: SUPABASE_PAT=<pat> node_modules/.bin/tsx scripts/apply-notification-migration.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = "gtevmcnasvrahzfdqrqk";

if (!PAT) {
  console.error("Set SUPABASE_PAT=<your-personal-access-token>");
  process.exit(1);
}

const sql = readFileSync(
  join(import.meta.dirname, "../supabase/migrations/20260601000000_notification_foundation.sql"),
  "utf-8",
);

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (!res.ok) { console.error("Migration failed:", body); process.exit(1); }
console.log("Migration applied successfully.");
console.log(body);
