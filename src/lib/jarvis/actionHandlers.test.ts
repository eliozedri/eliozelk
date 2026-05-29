import { describe, it, expect } from "vitest";
import { actionCapabilities, isAllowedAction, resolveActionType } from "./actionCatalog";
import { getHandler } from "./actionHandlers";

/**
 * The generic action framework: alias→canonical resolution, allowlist gating,
 * per-action capabilities, and handler dispatch. Proves the bridge routes by
 * action type (price has full execute/revert; ops_note is review-only; unknown
 * actions have no handler) — not a single hardcoded price flow.
 */
describe("action catalog + handler registry", () => {
  it("resolves aliases to canonical and gates the allowlist", () => {
    expect(resolveActionType("price_update_request")).toBe("price_update_percentage");
    expect(resolveActionType("price_update_pct")).toBe("price_update_percentage");
    expect(resolveActionType("price_update_percentage")).toBe("price_update_percentage");
    expect(resolveActionType("ops_note")).toBe("ops_note");
    expect(resolveActionType("drop_all_tables")).toBeNull();
    expect(isAllowedAction("ceo_note")).toBe(true); // alias of ops_note
    expect(isAllowedAction("rm_rf")).toBe(false);
  });

  it("exposes per-action capabilities", () => {
    expect(actionCapabilities("price_update_percentage")).toEqual({ preview: true, execute: true, revert: true });
    expect(actionCapabilities("ops_note")).toEqual({ preview: false, execute: false, revert: false });
    expect(actionCapabilities("unknown")).toEqual({ preview: false, execute: false, revert: false });
  });

  it("dispatches handlers by action type", () => {
    const price = getHandler("price_update_request"); // via alias
    expect(price?.actionType).toBe("price_update_percentage");
    expect(typeof price?.buildPreview).toBe("function");
    expect(typeof price?.execute).toBe("function");
    expect(typeof price?.revert).toBe("function");

    const note = getHandler("ops_note");
    expect(note?.actionType).toBe("ops_note");
    expect(note?.buildPreview).toBeUndefined(); // review-only — cannot mutate
    expect(note?.execute).toBeUndefined();

    expect(getHandler("delete_everything")).toBeNull();
  });

  it("ops_note validates on owner_request presence (no mutation path)", () => {
    const note = getHandler("ops_note")!;
    expect(note.validate({ status: "pending_review", action_type: "ops_note", target_department: null, payload_json: { owner_request: "x" } }).ok).toBe(true);
    expect(note.validate({ status: "pending_review", action_type: "ops_note", target_department: null, payload_json: {} }).ok).toBe(false);
  });
});
