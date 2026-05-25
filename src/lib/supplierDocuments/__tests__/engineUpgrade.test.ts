// Tests for the OCR engine-upgrade additions:
// Israeli check-digit validation, vehicle-field extraction, and doc classification.

import { describe, it, expect } from "vitest";
import { isValidIsraeliId, parseVehicleFields, parseOcrText } from "../parser";
import { detectDocumentClass } from "../documentClass";

describe("isValidIsraeliId", () => {
  it("accepts a valid 9-digit ID/company number", () => {
    expect(isValidIsraeliId("123456782")).toBe(true);
  });
  it("rejects an invalid check digit", () => {
    expect(isValidIsraeliId("123456789")).toBe(false);
  });
  it("pads short numbers and validates", () => {
    expect(isValidIsraeliId("000000018")).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isValidIsraeliId("abc")).toBe(false);
  });
});

describe("parseVehicleFields", () => {
  it("extracts a 7-digit plate from keyword context", () => {
    const v = parseVehicleFields("רישיון רכב\nמספר רכב: 12-345-67\n");
    expect(v.plateNumber).toBe("1234567");
  });

  it("extracts an 8-digit plate", () => {
    const v = parseVehicleFields("מספר רישוי 123-45-678");
    expect(v.plateNumber).toBe("12345678");
  });

  it("extracts a VIN chassis number", () => {
    const v = parseVehicleFields("מספר שלדה: WDB1234567A123456");
    expect(v.chassisNumber).toBe("WDB1234567A123456");
  });

  it("extracts mileage in km", () => {
    const v = parseVehicleFields("קריאת מד: 142,500 ק\"מ");
    expect(v.mileage).toBe(142500);
  });

  it("extracts license validity date", () => {
    const v = parseVehicleFields("תוקף רישיון עד 31/12/2026");
    expect(v.licenseValidUntil).toBe("2026-12-31");
  });
});

describe("detectDocumentClass", () => {
  it("classifies a tax invoice as financial", () => {
    const r = detectDocumentClass('חשבונית מס 555\nסה"כ לתשלום 1170\nמע"מ 170');
    expect(r.documentClass).toBe("financial");
  });

  it("classifies an insurance certificate", () => {
    const r = detectDocumentClass("תעודת ביטוח חובה\nפוליסה מספר 99\nמבטח: הראל");
    expect(r.documentClass).toBe("vehicle_insurance");
    expect(r.operationalType).toBe("insurance");
  });

  it("classifies a vehicle license", () => {
    const r = detectDocumentClass("רישיון רכב\nמשרד התחבורה\nמספר רכב 12-345-67");
    expect(r.documentClass).toBe("vehicle_license");
    expect(r.operationalType).toBe("license");
  });
});

describe("parseOcrText vehicle + validation integration", () => {
  it("flags an invalid VAT check digit and surfaces vehicle fields", () => {
    const result = parseOcrText("רישיון רכב\nח.פ: 123456789\nמספר רכב: 45-678-90");
    expect(result.vatValid).toBe(false);
    expect(result.fieldWarnings && result.fieldWarnings.length).toBeGreaterThan(0);
    expect(result.vehicle?.plateNumber).toBe("4567890");
  });
});
