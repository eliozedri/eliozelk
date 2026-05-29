import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * JARVIS → Elkayam CEO-Agent intake + owner decisions. Proves the Tier-A
 * guarantees: bad signature rejected, valid request stored as pending_review,
 * unsupported action not stored, decisions change status only, and — critically
 * — that ONLY the jarvis_ceo_agent_commands table is ever touched (no catalog /
 * pricing / finance / order business mutation).
 */

const h = vi.hoisted(() => ({ store: [] as Record<string, unknown>[], touched: [] as string[] }));

function makeFake() {
  return {
    from(table: string) {
      h.touched.push(table);
      const filters: Record<string, unknown> = {};
      let inserted: { id: string } | null = null;
      const qb: Record<string, unknown> = {
        select: () => qb,
        eq: (c: string, v: unknown) => {
          filters[c] = v;
          return qb;
        },
        maybeSingle: async () => ({
          data: h.store.find((r) => Object.entries(filters).every(([k, val]) => r[k] === val)) ?? null,
          error: null,
        }),
        single: async () => ({ data: inserted, error: inserted ? null : { message: "no_insert" } }),
        insert: (row: Record<string, unknown>) => {
          const r = { id: `row-${h.store.length + 1}`, ...row };
          h.store.push(r);
          inserted = { id: r.id as string };
          return qb;
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (c: string, v: unknown) => {
            const r = h.store.find((x) => x[c] === v);
            if (r) Object.assign(r, patch);
            return { error: null };
          },
        }),
      };
      return qb;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ getServiceSupabase: () => makeFake() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { NextRequest } from "next/server";
import { POST } from "./route";
import { approveRequest, rejectRequest } from "@/app/jarvis-requests/actions";

const TOKEN = "test-ceo-agent-secret-token-1234567890";
const validPkg = {
  protocol_version: 1,
  source_agent: "jarvis",
  target_agent: "elkayam_ceo_agent",
  correlation_id: "plan-abc",
  requested_by: "owner_via_jarvis",
  title: "עדכון מחירים — אביזרי בטיחות (+5%)",
  intent: "operational_execution",
  action_type: "price_update_request",
  execution_mode: "tier_a_staging",
  owner_request: "תעלה מחירים ב-5% במחלקת אביזרי בטיחות",
  affected_department: "אביזרי בטיחות",
  risk_level: "high",
  required_approvals: 2,
  proposed_execution_plan: { action: "price_update_pct", params: { pct: 5 }, owning_role: "catalog_manager" },
  rollback_plan: "snapshot מחירים",
  verification_plan: "השוואת ישן/חדש",
  dry_run_summary: "2 פריטים יושפעו (+5%).",
};

function reqFor(body: unknown, token: string | null) {
  return new NextRequest("https://elkayam.example/api/jarvis/ceo-agent?v=1", {
    method: "POST",
    headers: { authorization: token ? `Bearer ${token}` : "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ONLY_TABLE = "jarvis_ceo_agent_commands";

describe("CEO-Agent intake (Tier-A)", () => {
  beforeEach(() => {
    h.store.length = 0;
    h.touched.length = 0;
    process.env.JARVIS_CEO_AGENT_TOKEN = TOKEN;
  });

  it("rejects a bad signature (401), stores nothing", async () => {
    const res = await POST(reqFor(validPkg, "wrong-token"));
    expect(res.status).toBe(401);
    expect(h.store.length).toBe(0);
  });

  it("stores a valid request as pending_review and touches ONLY the jarvis table", async () => {
    const res = await POST(reqFor(validPkg, TOKEN));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("pending_review");
    expect(body.intake_id).toBeTruthy();
    expect(h.store.length).toBe(1);
    expect(h.store[0]!.status).toBe("pending_review");
    // The inbound alias 'price_update_request' is stored as the CANONICAL type.
    expect(h.store[0]!.action_type).toBe("price_update_percentage");
    expect(h.store[0]!.target_department).toBe("אביזרי בטיחות");
    // No business table mutation — only the JARVIS command table is touched.
    expect(h.touched.every((t) => t === ONLY_TABLE)).toBe(true);
  });

  it("is idempotent on correlation_id (replay → same row, no 2nd insert)", async () => {
    await POST(reqFor(validPkg, TOKEN));
    const res2 = await POST(reqFor(validPkg, TOKEN));
    const body2 = await res2.json();
    expect(body2.status).toBe("pending_review");
    expect(h.store.length).toBe(1);
  });

  it("refuses unsupported action types without storing them", async () => {
    const res = await POST(reqFor({ ...validPkg, action_type: "delete_all_customers", correlation_id: "x-2" }, TOKEN));
    const body = await res.json();
    expect(body.status).toBe("unsupported_action");
    expect(h.store.length).toBe(0);
  });

  it("accepts a NON-PRICE allowlisted action (ops_note) — generic, not price-only", async () => {
    const res = await POST(reqFor({
      ...validPkg, action_type: "ops_note", correlation_id: "note-1",
      owner_request: "תעדכן את מנהל התפעול שצריך להזמין עוד חרוטים",
    }, TOKEN));
    const body = await res.json();
    expect(body.status).toBe("pending_review");
    expect(h.store.length).toBe(1);
    expect(h.store[0]!.action_type).toBe("ops_note");
  });

  it("approve changes status only — no business mutation", async () => {
    await POST(reqFor(validPkg, TOKEN));
    const id = h.store[0]!.id as string;
    h.touched.length = 0;
    const r = await approveRequest(id);
    expect(r.ok).toBe(true);
    expect(h.store[0]!.status).toBe("approved");
    expect(h.store[0]!.approved_at).toBeTruthy();
    expect(h.touched.every((t) => t === ONLY_TABLE)).toBe(true);
  });

  it("reject changes status only", async () => {
    await POST(reqFor(validPkg, TOKEN));
    const id = h.store[0]!.id as string;
    const r = await rejectRequest(id, "לא עכשיו");
    expect(r.ok).toBe(true);
    expect(h.store[0]!.status).toBe("rejected");
    expect(h.store[0]!.rejection_reason).toBe("לא עכשיו");
  });

  it("clarification_answer re-opens a needs_info command to pending_review + stores the answer", async () => {
    await POST(reqFor(validPkg, TOKEN)); // creates the command
    h.store[0]!.status = "needs_info"; // CEO-Agent had asked for clarification
    const res = await POST(reqFor(
      { kind: "clarification_answer", correlation_id: validPkg.correlation_id, answer: "כן, רק מוצרים פעילים" },
      TOKEN,
    ));
    const body = await res.json();
    expect(body.status).toBe("pending_review");
    expect(h.store[0]!.status).toBe("pending_review");
    const diag = h.store[0]!.diagnostics as { clarification_answers?: { answer: string }[] };
    expect(diag.clarification_answers?.[0]?.answer).toBe("כן, רק מוצרים פעילים");
    // still only the JARVIS command table — no business mutation
    expect(h.touched.every((t) => t === ONLY_TABLE)).toBe(true);
  });

  it("clarification_answer requires auth", async () => {
    const res = await POST(reqFor({ kind: "clarification_answer", correlation_id: "x", answer: "y" }, "bad"));
    expect(res.status).toBe(401);
  });
});
