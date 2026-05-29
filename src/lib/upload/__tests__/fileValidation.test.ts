import { describe, it, expect } from "vitest";
import { sniffFileType, validateUploadSignature } from "../fileValidation";

const buf = (...bytes: number[]) => Buffer.from(bytes);
const ascii = (s: string) => Buffer.from(s, "utf8");

describe("sniffFileType", () => {
  it("detects PDF", () => expect(sniffFileType(ascii("%PDF-1.7"))).toBe("application/pdf"));
  it("detects JPEG", () => expect(sniffFileType(buf(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg"));
  it("detects PNG", () => expect(sniffFileType(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png"));
  it("detects WEBP", () => expect(sniffFileType(buf(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp"));
  it("detects TIFF (II)", () => expect(sniffFileType(buf(0x49, 0x49, 0x2a, 0x00))).toBe("image/tiff"));
  it("detects HEIC by ftyp brand", () =>
    expect(sniffFileType(buf(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63))).toBe("image/heic"));
  it("flags EXE", () => expect(sniffFileType(buf(0x4d, 0x5a, 0x90, 0x00))).toBe("application/x-dosexec"));
  it("flags ELF", () => expect(sniffFileType(buf(0x7f, 0x45, 0x4c, 0x46))).toBe("application/x-elf"));
  it("flags ZIP/Office", () => expect(sniffFileType(buf(0x50, 0x4b, 0x03, 0x04))).toBe("application/zip"));
  it("flags GIF", () => expect(sniffFileType(ascii("GIF89a"))).toBe("image/gif"));
  it("flags HTML", () => expect(sniffFileType(ascii("<!DOCTYPE html><html>"))).toBe("text/html-or-script"));
  it("flags SVG", () => expect(sniffFileType(ascii("<svg xmlns='...'>"))).toBe("text/html-or-script"));
});

describe("validateUploadSignature", () => {
  it("accepts a real PDF header", () => expect(validateUploadSignature(ascii("%PDF-1.4\n…")).ok).toBe(true));
  it("accepts JPEG", () => expect(validateUploadSignature(buf(0xff, 0xd8, 0xff)).ok).toBe(true));
  it("accepts HEIC", () =>
    expect(validateUploadSignature(buf(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63)).ok).toBe(true));
  it("rejects an EXE renamed as image", () => {
    const r = validateUploadSignature(buf(0x4d, 0x5a, 0x90, 0x00));
    expect(r.ok).toBe(false);
    expect(r.detected).toBe("application/x-dosexec");
    expect(r.reason).toContain("אבטחה");
  });
  it("rejects HTML/script payloads", () => expect(validateUploadSignature(ascii("<script>alert(1)</script>")).ok).toBe(false));
  it("rejects ZIP/Office docs", () => expect(validateUploadSignature(buf(0x50, 0x4b, 0x03, 0x04)).ok).toBe(false));
  it("is lenient on unrecognized bytes (other layers apply)", () =>
    expect(validateUploadSignature(buf(0x01, 0x02, 0x03, 0x04)).ok).toBe(true));
});
