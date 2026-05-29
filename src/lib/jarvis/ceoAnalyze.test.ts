import { describe, it, expect } from "vitest";
import { analyzeRequest, ruleBasedAnalyze, appendTurn, type Reasoner } from "./ceoAnalyze";

/**
 * CEO-Agent analysis: LLM-first (reasonAsAgent) with a rule-based fallback.
 * Reasoner is injected so we test both paths without a network/LLM.
 */
describe("CEO-Agent analyze (LLM-first + fallback)", () => {
  it("uses LLM reasoning when available (and carries routing + provider)", async () => {
    const reasoner: Reasoner = async () => ({
      message_type: "route_to_agent",
      message_text: "זו בקשת קטלוג — מנתב למנהל הקטלוג.",
      reasoning_summary: "זוהתה בקשת תמחור/קטלוג",
      routed_to_agent: "catalog_manager",
      needs_info: false,
      approval_required: true,
      risk_level: "high",
      llm_used: true,
      provider: "gemini",
    });
    const r = await analyzeRequest({ owner_request: "תעלה מחירים במחלקת השילוט", target_department: "שילוט ותמרור" }, reasoner);
    expect(r.llm_used).toBe(true);
    expect(r.message_type).toBe("route_to_agent");
    expect(r.routed_to_agent).toBe("catalog_manager");
    expect(r.llm_provider).toBe("gemini");
    expect(r.risk_level).toBe("high");
  });

  it("falls back to rule-based when the LLM is unavailable", async () => {
    const reasoner: Reasoner = async () => null;
    const r = await analyzeRequest({ action_type: "make_me_coffee", owner_request: "תכין לי קפה" }, reasoner);
    expect(r.llm_used).toBe(false);
    expect(r.message_type).toBe("capability_gap");
  });

  it("rule-based: executable+specified → analysis; missing → needs_info; unknown → capability_gap", () => {
    const ok = ruleBasedAnalyze({ action_type: "price_update_request", owner_request: "x", target_department: "אביזרי בטיחות", params: { pct: 5 } });
    expect(ok.message_type).toBe("analysis");
    const miss = ruleBasedAnalyze({ action_type: "price_update_percentage", owner_request: "x", target_department: null, params: { pct: 5 } });
    expect(miss.message_type).toBe("needs_info");
    const gap = ruleBasedAnalyze({ action_type: "fly_to_moon", owner_request: "x" });
    expect(gap.message_type).toBe("capability_gap");
  });

  it("appendTurn builds a sequenced thread", () => {
    let conv = appendTurn([], { source_agent: "jarvis", target_agent: "elkayam_ceo_agent", message_type: "request", message_text: "x" });
    conv = appendTurn(conv, { source_agent: "elkayam_ceo_agent", target_agent: "jarvis", message_type: "analysis", message_text: "y" });
    expect(conv.map((t) => t.seq)).toEqual([1, 2]);
  });
});
