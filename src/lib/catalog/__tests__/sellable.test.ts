import { describe, it, expect } from "vitest";
import { isSellable, statusBucket, STATUS_LABEL_HE } from "@/lib/catalog/sellable";

const base = { isActive: false, metadata: {} as Record<string, unknown> };

describe("isSellable", () => {
  it("active product is sellable", () => {
    expect(isSellable({ isActive: true })).toBe(true);
  });
  it("inactive product is not sellable", () => {
    expect(isSellable({ isActive: false })).toBe(false);
  });
});

describe("statusBucket", () => {
  it("active -> active regardless of residual review_state", () => {
    expect(statusBucket({ isActive: true, metadata: { review_state: "needs_review" } })).toBe("active");
  });
  it("inactive + needs_review -> needs_review", () => {
    expect(statusBucket({ ...base, metadata: { review_state: "needs_review" } })).toBe("needs_review");
  });
  it("inactive + no review flag -> inactive", () => {
    expect(statusBucket({ ...base, metadata: {} })).toBe("inactive");
  });
  it("inactive + undefined metadata -> inactive", () => {
    expect(statusBucket({ isActive: false, metadata: undefined })).toBe("inactive");
  });
});

describe("STATUS_LABEL_HE", () => {
  it("maps buckets to Hebrew", () => {
    expect(STATUS_LABEL_HE.active).toBe("פעיל");
    expect(STATUS_LABEL_HE.needs_review).toBe("ממתין לבדיקה");
    expect(STATUS_LABEL_HE.inactive).toBe("לא פעיל");
  });
});
