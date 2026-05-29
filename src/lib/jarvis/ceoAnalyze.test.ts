import { describe, it, expect } from "vitest";
import { analyzeRequest, appendTurn } from "./ceoAnalyze";

/**
 * The CEO-Agent reasoning step: a request becomes a typed next dialogue turn
 * (analysis / needs_info / capability_gap) — not a forced fixed action. Unknown
 * capabilities are an honest capability_gap, never a fake execution.
 */
describe("CEO-Agent analyze", () => {
  it("offers execution preview when an executable action is fully specified", () => {
    const r = analyzeRequest({ action_type: "price_update_request", owner_request: "תעלה מחירים ב-5%", target_department: "אביזרי בטיחות", params: { pct: 5 } });
    expect(r.message_type).toBe("analysis");
    expect(r.recommended_status).toBe("pending_review");
    expect(r.structured_payload?.offers).toContain("execution_preview");
  });

  it("asks for clarification when an executable action is missing info", () => {
    const noDept = analyzeRequest({ action_type: "price_update_percentage", owner_request: "תעלה מחירים ב-5%", target_department: null, params: { pct: 5 } });
    expect(noDept.message_type).toBe("needs_info");
    const noPct = analyzeRequest({ action_type: "price_update_percentage", owner_request: "תעדכן מחירים", target_department: "אביזרי בטיחות", params: {} });
    expect(noPct.message_type).toBe("needs_info");
  });

  it("stages an allowlisted review-only action", () => {
    const r = analyzeRequest({ action_type: "ops_note", owner_request: "תעדכן את מנהל התפעול" });
    expect(r.message_type).toBe("analysis");
    expect(r.recommended_status).toBe("pending_review");
  });

  it("returns an honest capability_gap for unknown requests (no fake action)", () => {
    const r = analyzeRequest({ action_type: "make_me_coffee", owner_request: "תכין לי קפה" });
    expect(r.message_type).toBe("capability_gap");
    expect(r.recommended_status).toBe("capability_gap");
    expect(r.structured_payload?.offers).toEqual(expect.arrayContaining(["proposal", "future_dev_task"]));
  });

  it("appendTurn builds a sequenced thread", () => {
    let conv = appendTurn([], { source_agent: "jarvis", target_agent: "elkayam_ceo_agent", message_type: "request", message_text: "x" });
    conv = appendTurn(conv, { source_agent: "elkayam_ceo_agent", target_agent: "jarvis", message_type: "analysis", message_text: "y" });
    expect(conv.map((t) => t.seq)).toEqual([1, 2]);
    expect(conv[1]!.message_type).toBe("analysis");
  });
});
