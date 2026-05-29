import { describe, it, expect } from "vitest";
import { reasonAsAgent, type GenerateFn } from "./agentReasoning";

/**
 * Shared reasoning service. The LLM call is injected, so we prove: a JSON
 * reasoning reply is parsed into a structured result (incl. routing), the
 * agent's role prompt + internal-agent directory reach the model, and an
 * unavailable provider safe-offs to null (caller falls back to rule-based).
 */
describe("reasonAsAgent (shared reasoning service)", () => {
  it("parses a structured JSON reasoning reply", async () => {
    let seenSystem = "";
    const gen: GenerateFn = async (system) => {
      seenSystem = system;
      return {
        text: '```json\n{"message_type":"route_to_agent","message_text":"מנתב למנהל הקטלוג","reasoning_summary":"בקשת מחיר","routed_to_agent":"catalog_manager","needs_info":false,"approval_required":true,"risk_level":"high"}\n```',
        provider: "groq",
      };
    };
    const r = await reasonAsAgent({ agentId: "ceo", userRequest: "תעלה מחירים", canRouteInternally: true }, gen);
    expect(r).not.toBeNull();
    expect(r!.message_type).toBe("route_to_agent");
    expect(r!.routed_to_agent).toBe("catalog_manager");
    expect(r!.risk_level).toBe("high");
    expect(r!.llm_used).toBe(true);
    expect(r!.provider).toBe("groq");
    // The CEO role prompt + internal directory must reach the model.
    expect(seenSystem).toContain("CEO Agent");
    expect(seenSystem).toContain("catalog_manager");
  });

  it("safe-offs to null when no provider is available", async () => {
    const gen: GenerateFn = async () => null;
    expect(await reasonAsAgent({ agentId: "ceo", userRequest: "x" }, gen)).toBeNull();
  });

  it("returns null on unparseable output (no fake answer)", async () => {
    const gen: GenerateFn = async () => ({ text: "סתם טקסט בלי JSON" });
    expect(await reasonAsAgent({ agentId: "operations_manager", userRequest: "x" }, gen)).toBeNull();
  });
});
