// Parser unit tests — Hebrew + English invoice OCR text fixtures.
// Run: npm test

import { describe, it, expect } from "vitest";
import { parseOcrText, parseNumber } from "../parser";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HEBREW_INVOICE_SIMPLE = `
חשבונית מס 12345
ספק: חברת תמרורים בע"מ
ח.פ: 123456789
תאריך: 01/05/2026

תיאור                   כמות  יחידה  מחיר יחידה  סה"כ
קונוסים כתומים           50    יח     12.00       600.00
תמרורים סוג א            10    יח     85.00       850.00

סה"כ לפני מע"מ:          1,450.00
מע"מ:                    261.00
סה"כ לתשלום:             1,711.00
`;

const HEBREW_DELIVERY_NOTE = `
תעודת משלוח 7890
מוכר: ויניל ישראל בע"מ
ע.מ: 987654321
תאריך: 15/05/2026

ויניל לבן מחזיר אור      100   מ"א    8.50        850.00
פרופיל אלומיניום          20    מטר    35.00       700.00
מדבקות ויניל              5     גליל   45.00       225.00

סה"כ: 1,775.00
`;

const ENGLISH_INVOICE = `
Invoice No: INV-2026-001
Date: 10/05/2026
Company: Scotchlite Ltd
VAT: 556677889

Description        Qty   Unit   Price    Total
Reflective Foil    200   sqm    15.00   3000.00
Mounting Brackets   50   pcs     8.50    425.00

Subtotal: 3,425.00
VAT 18%:    616.50
Total Due: 4,041.50
`;

const NOISY_OCR = `
חשבונית מס 99l
תאריך: O1/O5/2026
ספק ABC בעמ

תיאור כמות מחיר סהכ
צבע כביש לבן 20 55,00 1,100.00
מדלל 10 18.00 180.00

סהכ 1280
מעמ 230
לתשלום 1510
`;

const EDGE_SKIP_ONLY = `
חשבונית מס 111
ספק: מוצרים בע"מ
ח.פ: 111222333
תאריך: 01/01/2026
סה"כ לתשלום: 500.00
מע"מ: 90.00
`;

// ── parseNumber tests ─────────────────────────────────────────────────────────

describe("parseNumber", () => {
  it("parses plain integers", () => {
    expect(parseNumber("50")).toBe(50);
    expect(parseNumber("0")).toBe(0);
  });

  it("parses Israeli decimal format (dot=decimal)", () => {
    expect(parseNumber("12.00")).toBe(12);
    expect(parseNumber("1,234.56")).toBe(1234.56);
  });

  it("parses European decimal format (comma=decimal)", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
  });

  it("parses plain comma-decimal (1234,56)", () => {
    expect(parseNumber("1234,56")).toBe(1234.56);
  });

  it("strips currency symbols", () => {
    expect(parseNumber("₪ 600.00")).toBe(600);
  });

  it("returns undefined for non-numeric input", () => {
    expect(parseNumber("abc")).toBeUndefined();
    expect(parseNumber("")).toBeUndefined();
  });
});

// ── Header extraction tests ───────────────────────────────────────────────────

describe("parseOcrText – header", () => {
  it("extracts document number from Hebrew invoice", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    expect(r.header.documentNumber).toBe("12345");
  });

  it("extracts VAT number from Hebrew invoice", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    expect(r.header.supplierVat).toBe("123456789");
  });

  it("extracts total amount from Hebrew invoice", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    expect(r.header.totalAfterVat).toBe(1711);
  });

  it("extracts subtotal before VAT", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    expect(r.header.subtotalBeforeVat).toBe(1450);
  });

  it("extracts VAT amount", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    expect(r.header.vatAmount).toBe(261);
  });

  it("parses date correctly", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    expect(r.header.documentDate).toBe("2026-05-01");
  });

  it("classifies tax invoice correctly", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    expect(r.header.documentType).toBe("tax_invoice");
  });

  it("classifies delivery note correctly", () => {
    const r = parseOcrText(HEBREW_DELIVERY_NOTE);
    expect(r.header.documentType).toBe("delivery_note");
  });

  it("extracts English invoice number", () => {
    const r = parseOcrText(ENGLISH_INVOICE);
    // Doc number extraction finds the first number after invoice/no keyword
    expect(r.header.documentNumber).toBeTruthy();
  });

  it("extracts English total", () => {
    const r = parseOcrText(ENGLISH_INVOICE);
    expect(r.header.totalAfterVat).toBe(4041.5);
  });

  it("returns reasonable confidence when fields found", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    expect(r.header.confidence).toBeGreaterThan(0.5);
  });

  it("returns low confidence when nothing found", () => {
    const r = parseOcrText("random text no numbers");
    expect(r.header.confidence).toBeLessThan(0.5);
  });
});

// ── Line extraction tests ─────────────────────────────────────────────────────

describe("parseOcrText – lines", () => {
  it("extracts 2 lines from simple Hebrew invoice", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    expect(r.lines.length).toBe(2);
  });

  it("extracts first line description", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    const l = r.lines[0];
    expect(l.originalDescription).toMatch(/קונוסים/);
  });

  it("extracts first line quantity=50, price=12, total=600", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    const l = r.lines[0];
    expect(l.quantity).toBe(50);
    expect(l.unitPrice).toBe(12);
    expect(l.lineTotal).toBe(600);
  });

  it("extracts second line quantity=10, price=85, total=850", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    const l = r.lines[1];
    expect(l.quantity).toBe(10);
    expect(l.unitPrice).toBe(85);
    expect(l.lineTotal).toBe(850);
  });

  it("gives high confidence to consistent lines", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    r.lines.forEach(l => expect(l.confidence).toBeGreaterThan(0.6));
  });

  it("does NOT include totals/VAT rows as lines", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    const descs = r.lines.map(l => l.originalDescription.toLowerCase());
    expect(descs.every(d => !d.includes("סה"))).toBe(true);
    expect(descs.every(d => !d.includes("מע"))).toBe(true);
  });

  it("extracts 3 lines from delivery note", () => {
    const r = parseOcrText(HEBREW_DELIVERY_NOTE);
    expect(r.lines.length).toBe(3);
  });

  it("extracts lines from English invoice", () => {
    const r = parseOcrText(ENGLISH_INVOICE);
    expect(r.lines.length).toBe(2);
    expect(r.lines[0].lineTotal).toBe(3000);
    expect(r.lines[1].lineTotal).toBe(425);
  });

  it("returns empty lines (not an error) when no product rows exist", () => {
    const r = parseOcrText(EDGE_SKIP_ONLY);
    // All rows were skip rows — no lines, but header should still be extracted
    expect(r.lines.length).toBe(0);
    expect(r.header.documentNumber).toBe("111");
  });

  it("handles noisy OCR text without crashing", () => {
    expect(() => parseOcrText(NOISY_OCR)).not.toThrow();
    const r = parseOcrText(NOISY_OCR);
    // Should extract at least 1 line despite noise
    expect(r.lines.length).toBeGreaterThan(0);
  });

  it("assigns line numbers sequentially starting from 1", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    expect(r.lines.map(l => l.lineNumber)).toEqual([1, 2]);
  });

  it("detects Hebrew unit and normalizes it", () => {
    const r = parseOcrText(HEBREW_INVOICE_SIMPLE);
    // יח should normalize to יחידה
    expect(r.lines[0].unitOfMeasure).toBe("יחידה");
  });
});
