import { describe, it, expect } from "vitest";
import { llmReason } from "./chat-engine";

/**
 * The in-app agent chat is now connected to the shared LLM reasoning mechanism
 * (reasonAsAgent → Gemini→Groq) for free-form questions, per agent. These tests
 * inject the reasoner/context so no network is needed, proving: every role
 * (incl. system_admin) reaches the LLM, unknown agents map to ceo, and a missing
 * provider falls back to null (the engine then uses its structured reply).
 */
const fakeDb = {} as never;
const okCtx = (async () => ({ agent_id: "x", available: true, summary: "מצב בדיקה", details: {} })) as never;

describe("chat LLM reasoning layer", () => {
  it("system_admin chat reaches the LLM mechanism and returns its answer", async () => {
    let seenAgent = "";
    const reason = async (i: { agentId: string }) => { seenAgent = i.agentId; return { message_text: "הרשאות ומערכת תקינות; הנה ההמלצות..." }; };
    const out = await llmReason(fakeDb, "system_admin", "איך לחזק את אבטחת המערכת?", null, { pathname: "/safety" }, { reason, getCtx: okCtx });
    expect(seenAgent).toBe("system_admin");
    expect(out).toContain("המלצות");
  });

  it("each internal agent role is routed to the LLM as itself", async () => {
    for (const role of ["ceo", "operations_manager", "catalog_manager", "system_admin"]) {
      let seen = "";
      const reason = async (i: { agentId: string }) => { seen = i.agentId; return { message_text: "ok" }; };
      await llmReason(fakeDb, role, "שאלה כללית", null, null, { reason, getCtx: okCtx });
      expect(seen).toBe(role);
    }
  });

  it("command-center / unknown agent maps to ceo reasoning", async () => {
    let seen = "";
    const reason = async (i: { agentId: string }) => { seen = i.agentId; return { message_text: "ok" }; };
    await llmReason(fakeDb, null, "מה כדאי לשפר?", null, null, { reason, getCtx: okCtx });
    expect(seen).toBe("ceo");
  });

  it("no LLM provider → null (engine falls back to its structured reply, never faked)", async () => {
    const reason = async () => null;
    const out = await llmReason(fakeDb, "ceo", "שאלה", null, null, { reason, getCtx: okCtx });
    expect(out).toBeNull();
  });
});
