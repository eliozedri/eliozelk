import { describe, it, expect } from "vitest";
import { sha256Hex } from "../auth";

describe("sha256Hex", () => {
  it("matches the known SHA-256 vector for 'abc'", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is stable and case/whitespace sensitive (codes are exact)", () => {
    expect(sha256Hex("ELK-ABCD-2345")).toBe(sha256Hex("ELK-ABCD-2345"));
    expect(sha256Hex("ELK-ABCD-2345")).not.toBe(sha256Hex("elk-abcd-2345"));
  });
});
