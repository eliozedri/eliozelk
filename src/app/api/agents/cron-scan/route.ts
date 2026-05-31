// Aggregated agent scan — runs ALL department scanners in one call.
//
// Trigger: an external scheduler (GitHub Actions / Vercel Cron) hits this endpoint
// every few minutes so the agent layer stays fresh WITHOUT a human pressing
// "סריקת מערכת". This removes the staleness the owner reported.
//
// AUTH: CRON_SECRET bearer ONLY — identical to /api/notifications/cron. Dormant
// (503) until CRON_SECRET is set, and 401 without the matching bearer. The
// individual /api/agents/{id}/scan routes keep their master-only auth untouched;
// this endpoint calls their extracted runScan(db) logic directly under the
// service-role client. Each scanner is deterministic, deduped and idempotent,
// and only writes agent metadata (exceptions/tasks) — no business mutation.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

import { runScan as runBilling } from "../billing-collections-agent/scan/route";
import { runScan as runCatalog } from "../catalog-pricing-agent/scan/route";
import { runScan as runCeo } from "../ceo/scan/route";
import { runScan as runCfo } from "../cfo-agent/scan/route";
import { runScan as runCoordination } from "../coordination-qa-agent/scan/route";
import { runScan as runEquipment } from "../equipment-fleet-agent/scan/route";
import { runScan as runFabrication } from "../fabrication-agent/scan/route";
import { runScan as runFieldOps } from "../field-ops-agent/scan/route";
import { runScan as runGraphics } from "../graphics-production-agent/scan/route";
import { runScan as runInventory } from "../inventory-agent/scan/route";
import { runScan as runOrders } from "../orders-agent/scan/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ScanFn = (db: ReturnType<typeof getServiceSupabase>) => Promise<NextResponse>;

const SCANNERS: { id: string; run: ScanFn }[] = [
  { id: "orders-agent", run: runOrders },
  { id: "fabrication-agent", run: runFabrication },
  { id: "graphics-production-agent", run: runGraphics },
  { id: "coordination-qa-agent", run: runCoordination },
  { id: "field-ops-agent", run: runFieldOps },
  { id: "inventory-agent", run: runInventory },
  { id: "equipment-fleet-agent", run: runEquipment },
  { id: "billing-collections-agent", run: runBilling },
  { id: "cfo-agent", run: runCfo },
  { id: "catalog-pricing-agent", run: runCatalog },
  { id: "ceo", run: runCeo },
];

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "scan disabled (no CRON_SECRET)" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceSupabase();
  const startedAt = Date.now();
  const results: Record<string, unknown>[] = [];

  // Sequential on purpose: small DB, avoids hammering Postgres with 11 concurrent
  // scan bursts. Each scanner is isolated — one failing never aborts the rest.
  for (const { id, run: runOne } of SCANNERS) {
    try {
      const res = await runOne(db);
      let body: Record<string, unknown> = {};
      try { body = (await res.json()) as Record<string, unknown>; } catch { /* non-JSON */ }
      results.push({
        agentId: id,
        httpStatus: res.status,
        ok: res.status < 400,
        entitiesScanned: body.entitiesScanned ?? null,
        exceptionsCreated: body.exceptionsCreated ?? null,
        exceptionsResolved: body.exceptionsResolved ?? null,
        tasksCreated: body.tasksCreated ?? null,
        tasksResolved: body.tasksResolved ?? null,
        errors: Array.isArray(body.errors) ? body.errors : [],
      });
    } catch (err) {
      results.push({ agentId: id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const ranOk = results.filter((r) => r.ok === true).length;
  return NextResponse.json(
    { ok: true, ranOk, ranTotal: SCANNERS.length, durationMs: Date.now() - startedAt, results },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Vercel Cron uses GET; an external scheduler may use POST. Both require the bearer.
export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
