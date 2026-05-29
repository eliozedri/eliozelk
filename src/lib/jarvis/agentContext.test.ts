import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgentContext } from "./agentContext";

/**
 * Read-only context providers. Fake DB (no update method — read-only by
 * construction) returns counts; we prove each agent gets a real, domain-shaped
 * context, secrets are never read (system_admin = flag NAMES only), and an
 * unknown agent honestly returns "context unavailable".
 */
function fakeDb(countByTable: Record<string, number>): SupabaseClient {
  const make = (table: string) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    for (const m of ["in", "eq", "not", "gte", "lt"]) b[m] = () => b;
    (b as { then: unknown }).then = (res: (v: { count: number; error: null }) => unknown) =>
      Promise.resolve({ count: countByTable[table] ?? 0, error: null }).then(res);
    return b;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

describe("agent read-only context", () => {
  beforeAll(() => { process.env.JARVIS_TESTFLAG_ENABLED = "true"; });

  it("CEO context: open requests + routing directory", async () => {
    const ctx = await getAgentContext(fakeDb({ jarvis_ceo_agent_commands: 3 }), "ceo");
    expect(ctx.available).toBe(true);
    expect(ctx.summary).toContain("3");
    expect(ctx.details.open_requests).toBe(3);
    expect(Array.isArray(ctx.details.internal_agents)).toBe(true);
  });

  it("Catalog context: item counts incl. computed without_price + executable tool", async () => {
    const ctx = await getAgentContext(fakeDb({ catalog_items: 100, jarvis_ceo_agent_commands: 2 }), "catalog_manager");
    expect(ctx.details.active_items).toBe(100);
    expect(ctx.details.with_price).toBe(100);
    expect(ctx.details.without_price).toBe(0);
    expect(ctx.details.executable_tools).toContain("price_update_percentage");
  });

  it("System Admin context: feature-flag NAMES only (no secrets/values)", async () => {
    const ctx = await getAgentContext(fakeDb({ jarvis_ceo_agent_commands: 1 }), "system_admin");
    expect(ctx.available).toBe(true);
    const names = ctx.details.feature_flag_names as string[];
    expect(names).toContain("JARVIS_TESTFLAG_ENABLED");
    // names only — never a value/secret in the summary.
    expect(ctx.summary).not.toContain("true");
  });

  it("Unknown agent → honest context unavailable", async () => {
    const ctx = await getAgentContext(fakeDb({}), "finance_agent");
    expect(ctx.available).toBe(false);
    expect(ctx.summary).toContain("unavailable");
  });
});
