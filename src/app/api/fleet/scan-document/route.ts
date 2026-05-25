// Fleet "סרוק מסמך" analysis endpoint.
// Runs the SAME central OCR engine, extracts fields, classifies the document,
// and suggests which equipment item it belongs to — WITHOUT writing anything.
// The client keeps the file and, after human confirmation, re-sends it to the
// correct destination:
//   • financial  → /api/supplier-documents/upload (finance + equipment link)
//   • operational → /api/equipment/[id]/document   (license/insurance/test)
// Review-first: nothing is stored or posted here.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";
import { extractDocument } from "@/lib/supplierDocuments/ocrAdapter";
import { detectDocumentClass } from "@/lib/supplierDocuments/documentClass";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/tiff", "image/heic", "image/heif",
]);

interface EquipmentRow {
  id: string;
  display_name: string;
  category_key: string;
  license_number: string | null;
  chassis_number: string | null;
  serial_number: string | null;
}

interface EquipmentMatch {
  id: string;
  displayName: string;
  licenseNumber: string | null;
  score: number;
  reason: string;
}

const digitsOnly = (s?: string | null): string => (s ?? "").replace(/\D/g, "");

function scoreEquipment(
  eq: EquipmentRow,
  plate?: string,
  chassis?: string,
  supplierName?: string
): EquipmentMatch | null {
  const plateD = digitsOnly(plate);
  if (plateD && digitsOnly(eq.license_number) && digitsOnly(eq.license_number) === plateD) {
    return { id: eq.id, displayName: eq.display_name, licenseNumber: eq.license_number, score: 0.97, reason: "התאמת מספר רכב" };
  }
  const chassisU = (chassis ?? "").toUpperCase();
  if (chassisU) {
    if ((eq.chassis_number ?? "").toUpperCase() === chassisU) {
      return { id: eq.id, displayName: eq.display_name, licenseNumber: eq.license_number, score: 0.95, reason: "התאמת מספר שלדה" };
    }
    if ((eq.serial_number ?? "").toUpperCase() === chassisU) {
      return { id: eq.id, displayName: eq.display_name, licenseNumber: eq.license_number, score: 0.9, reason: "התאמת מספר סידורי" };
    }
  }
  // Weak: supplier/owner text mentions the asset display name
  const name = (eq.display_name ?? "").trim();
  if (name.length >= 3 && supplierName && supplierName.includes(name)) {
    return { id: eq.id, displayName: eq.display_name, licenseNumber: eq.license_number, score: 0.5, reason: "התאמת שם כלי בטקסט" };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "לא ניתן לקרוא את הקובץ" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `סוג קובץ לא נתמך: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "קובץ גדול מדי (מקסימום 20MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Central OCR ──
  const extraction = await extractDocument({
    fileBuffer: buffer,
    fileName: file.name,
    fileType: file.type,
  });

  if (!extraction.available) {
    return NextResponse.json({ error: extraction.error ?? "OCR נכשל" }, { status: 422 });
  }

  const rawText = extraction.rawText ?? "";
  const cls = detectDocumentClass(rawText);
  const vehicle = extraction.vehicle ?? {};

  // ── Equipment matching ──
  const db = getServiceSupabase();
  const { data: rows } = await db
    .from("equipment")
    .select("id,display_name,category_key,license_number,chassis_number,serial_number")
    .eq("is_active", true);

  const equipment = (rows ?? []) as EquipmentRow[];
  const matches: EquipmentMatch[] = [];
  for (const eq of equipment) {
    const m = scoreEquipment(eq, vehicle.plateNumber, vehicle.chassisNumber, extraction.header?.supplierName);
    if (m) matches.push(m);
  }
  matches.sort((a, b) => b.score - a.score);

  // ── Contradiction detection ──
  const contradictions: string[] = [];
  if (vehicle.plateNumber && matches.length === 0) {
    contradictions.push(`זוהה מספר רכב ${vehicle.plateNumber} אך לא נמצא כלי תואם במערכת — ודא שהכלי קיים`);
  }
  const best = matches[0];
  if (best && best.score >= 0.9 && vehicle.plateNumber) {
    const matchedPlate = digitsOnly(best.licenseNumber);
    if (matchedPlate && matchedPlate !== digitsOnly(vehicle.plateNumber)) {
      contradictions.push(`מספר הרכב במסמך (${vehicle.plateNumber}) שונה מהרשום בכלי "${best.displayName}" (${best.licenseNumber})`);
    }
  }

  return NextResponse.json({
    ok: true,
    fileName: file.name,
    fileType: file.type,
    header: extraction.header,
    vehicle,
    fieldWarnings: extraction.fieldWarnings ?? [],
    vatValid: extraction.vatValid ?? null,
    lowConfidenceTerms: extraction.lowConfidenceTerms ?? [],
    pageConfidence: extraction.pageConfidence ?? null,
    scanned: extraction.scanned ?? false,
    engine: extraction.engine ?? null,
    rawText,
    documentClass: cls.documentClass,
    operationalType: cls.operationalType ?? null,
    classConfidence: cls.confidence,
    classReason: cls.reason,
    equipmentMatches: matches.slice(0, 5),
    contradictions,
  });
}
