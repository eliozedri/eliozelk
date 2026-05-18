// Equipment / Fleet — Type Definitions
// English enum keys for code stability; Hebrew labels for display.
// Matches the equipment table schema in supabase/migrations/20260526000000_equipment_table.sql

// ── Status ────────────────────────────────────────────────────────────────────

export type EquipmentStatus =
  | "active"           // פעיל — available for deployment
  | "pending_approval" // ממתין לאישור — awaiting inspection or licensing
  | "in_repair"        // בשיפוץ — in maintenance or repair
  | "unserviceable";   // לא שמיש — cannot be deployed

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  active:           "פעיל",
  pending_approval: "ממתין לאישור",
  in_repair:        "בשיפוץ",
  unserviceable:    "לא שמיש",
};

export const EQUIPMENT_STATUS_COLORS: Record<EquipmentStatus, string> = {
  active:           "bg-green-100 text-green-700",
  pending_approval: "bg-amber-100 text-amber-700",
  in_repair:        "bg-orange-100 text-orange-700",
  unserviceable:    "bg-red-100 text-red-700",
};

// ── Category ──────────────────────────────────────────────────────────────────

export type EquipmentCategory =
  | "fleet"           // צי רכב
  | "trailers"        // נגררים
  | "arrow_carts"     // עגלות חץ / נגררי תאורה
  | "road_marking"    // מכונות סימון כבישים
  | "production"      // ייצור וחיתוך
  | "heavy_equipment" // צמ"ה
  | "forklifts"       // מלגזות
  | "generators"      // גנרטורים
  | "unidentified";   // ציוד לא מזוהה

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  fleet:           "צי רכב",
  trailers:        "נגררים",
  arrow_carts:     "עגלות חץ",
  road_marking:    "סימון כבישים",
  production:      "ייצור וחיתוך",
  heavy_equipment: 'צמ"ה',
  forklifts:       "מלגזות",
  generators:      "גנרטורים",
  unidentified:    "ציוד לא מזוהה",
};

// ── Identification confidence ─────────────────────────────────────────────────

export type IdentificationConfidence =
  | "confirmed"    // fully identified and verified
  | "partial"      // some fields are missing or uncertain
  | "unidentified"; // cannot confirm this asset's identity

export const IDENTIFICATION_CONFIDENCE_LABELS: Record<IdentificationConfidence, string> = {
  confirmed:    "מאומת",
  partial:      "חלקי",
  unidentified: "לא מזוהה",
};

export const IDENTIFICATION_CONFIDENCE_COLORS: Record<IdentificationConfidence, string> = {
  confirmed:    "bg-green-100 text-green-700",
  partial:      "bg-amber-100 text-amber-700",
  unidentified: "bg-red-100 text-red-700",
};

// ── Document entry (stored in documents JSONB array) ─────────────────────────

export interface EquipmentDocument {
  type: string;        // e.g. "license", "insurance", "inspection", "manual"
  label: string;       // display name
  url: string;
  expiry_date?: string; // ISO date YYYY-MM-DD
}

// ── Main interface ────────────────────────────────────────────────────────────

export interface Equipment {
  id: string;
  display_name: string;
  category_key: EquipmentCategory;
  equipment_type: string | null;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  license_number: string | null;
  serial_number: string | null;
  chassis_number: string | null;
  engine_number: string | null;
  status: EquipmentStatus;
  identification_confidence: IdentificationConfidence;
  technical_specs: Record<string, unknown>;
  notes: string | null;
  photos: string[];
  documents: EquipmentDocument[];
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  next_inspection_date: string | null;
  next_insurance_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Future tables (Phase 2b — not yet implemented) ────────────────────────────
//
// equipment_maintenance_records — full service history per equipment item
// equipment_defects             — known defects with severity and resolution status
// equipment_assignments         — links equipment to work_orders for dispatch readiness
//                                 (requires work_orders to have an equipment FK first)
// equipment_documents           — normalized document management (if JSONB proves insufficient)
