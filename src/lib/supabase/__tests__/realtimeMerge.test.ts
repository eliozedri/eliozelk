import { describe, it, expect } from "vitest";
import { isNewerOrRecent } from "@/lib/supabase/realtimeMerge";

describe("isNewerOrRecent", () => {
  const base = "2026-05-23T12:00:00.000Z";

  it("accepts a strictly newer incoming timestamp", () => {
    expect(isNewerOrRecent(base, "2026-05-23T12:00:10.000Z")).toBe(true);
  });

  it("rejects an incoming timestamp older than the tolerance window", () => {
    expect(isNewerOrRecent(base, "2026-05-23T11:59:50.000Z")).toBe(false);
  });

  it("accepts a slightly-older incoming timestamp within the 5s skew tolerance", () => {
    // 3s older than local — kept, because the local optimistic clock may be ahead.
    expect(isNewerOrRecent(base, "2026-05-23T11:59:57.000Z")).toBe(true);
  });

  it("returns false for unparseable timestamps (NaN comparison; catch only fires on a real throw)", () => {
    expect(isNewerOrRecent("not-a-date", "also-not-a-date")).toBe(false);
  });
});
