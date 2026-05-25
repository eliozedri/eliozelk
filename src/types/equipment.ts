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
  | "trucks"          // משאיות
  | "pickups"         // טנדרים
  | "fleet"           // צי רכב (כללי) — kept so existing seed rows stay valid
  | "trailers"        // נגררים
  | "carts"           // עגלות
  | "arrow_carts"     // עגלות חץ / נגררי תאורה
  | "road_marking"    // מכונות סימון כבישים
  | "production"      // ייצור וחיתוך
  | "heavy_equipment" // צמ"ה
  | "forklifts"       // מלגזות
  | "generators"      // גנרטורים
  | "unidentified";   // ציוד לא מזוהה

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  trucks:          "משאיות",
  pickups:         "טנדרים",
  fleet:           "צי רכב (כללי)",
  trailers:        "נגררים",
  carts:           "עגלות",
  arrow_carts:     "עגלות חץ",
  road_marking:    "מכונות סימון כבישים",
  production:      "ייצור וחיתוך",
  heavy_equipment: 'צמ"ה',
  forklifts:       "מלגזות",
  generators:      "גנרטורים",
  unidentified:    "ציוד לא מזוהה",
};

// Order for category filter chips / dropdowns.
export const EQUIPMENT_CATEGORY_ORDER: EquipmentCategory[] = [
  "trucks", "pickups", "fleet", "trailers", "carts", "arrow_carts",
  "road_marking", "production", "heavy_equipment", "forklifts",
  "generators", "unidentified",
];

// Categories whose detail card shows the vehicle field-set (license, chassis,
// engine, mileage, license expiry). Others show the machine field-set.
export const VEHICLE_CATEGORIES: Set<EquipmentCategory> = new Set<EquipmentCategory>([
  "trucks", "pickups", "fleet", "trailers", "carts", "arrow_carts",
  "heavy_equipment", "forklifts",
]);

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
  // Phase 1 additions
  out_of_service_reason: string | null;
  current_location: string | null;
  business_use: string | null;
  license_expiry_date: string | null;
  mileage: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Maintenance records ───────────────────────────────────────────────────────

export type MaintenanceStatus = "open" | "in_progress" | "completed" | "needs_check";

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  open:        "פתוח",
  in_progress: "בטיפול",
  completed:   "הושלם",
  needs_check: "דורש בדיקה",
};

export const MAINTENANCE_STATUS_COLORS: Record<MaintenanceStatus, string> = {
  open:        "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed:   "bg-green-100 text-green-700",
  needs_check: "bg-red-100 text-red-700",
};

export interface EquipmentMaintenanceRecord {
  id: string;
  equipment_id: string;
  service_date: string | null;
  scheduled_date: string | null;
  maintenance_type: string;
  description: string;
  provider: string;
  cost: number | null;
  parts_replaced: string;
  notes: string;
  status: MaintenanceStatus;
  linked_document_id: string | null; // Phase 2 financial link placeholder
  attachments: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Incidents / events ────────────────────────────────────────────────────────

export type IncidentType = "fault" | "accident" | "issue" | "damage" | "inspection" | "other";

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  fault:      "תקלה",
  accident:   "תאונה",
  issue:      "בעיה",
  damage:     "נזק",
  inspection: "בדיקה",
  other:      "אחר",
};

export type IncidentSeverity = "low" | "medium" | "high" | "urgent";

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  low:    "נמוכה",
  medium: "בינונית",
  high:   "גבוהה",
  urgent: "דחופה",
};

export const INCIDENT_SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  low:    "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-700",
  high:   "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export type IncidentStatus = "open" | "in_progress" | "resolved" | "closed";

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open:        "פתוח",
  in_progress: "בטיפול",
  resolved:    "טופל",
  closed:      "סגור",
};

export const INCIDENT_STATUS_COLORS: Record<IncidentStatus, string> = {
  open:        "bg-red-100 text-red-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved:    "bg-green-100 text-green-700",
  closed:      "bg-slate-100 text-slate-600",
};

// Incident statuses considered "open" for KPI / filter purposes.
export const OPEN_INCIDENT_STATUSES: IncidentStatus[] = ["open", "in_progress"];

export interface EquipmentIncident {
  id: string;
  equipment_id: string;
  opened_at: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  status: IncidentStatus;
  reported_by: string;
  required_action: string;
  due_date: string | null;
  resolution: string;
  cost: number | null;
  photos: string[];
  attachments: string[];
  created_at: string;
  updated_at: string;
}

// ── Tasks / reminders ─────────────────────────────────────────────────────────

export type EquipmentTaskStatus = "pending" | "done" | "cancelled";

export const EQUIPMENT_TASK_STATUS_LABELS: Record<EquipmentTaskStatus, string> = {
  pending:   "ממתין",
  done:      "בוצע",
  cancelled: "בוטל",
};

export const EQUIPMENT_TASK_STATUS_COLORS: Record<EquipmentTaskStatus, string> = {
  pending:   "bg-blue-100 text-blue-700",
  done:      "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-600",
};

export interface EquipmentTask {
  id: string;
  equipment_id: string;
  title: string;
  task_type: string;
  due_date: string | null;
  status: EquipmentTaskStatus;
  reminder_at: string | null;
  notes: string;
  linked_maintenance_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Operational document types (Phase 1 — non-financial only) ─────────────────

export type OperationalDocType =
  | "license"     // רישיון רכב
  | "test"        // טסט
  | "insurance"   // ביטוח
  | "manual"      // ספר מכונה
  | "technical"   // מסמך טכני
  | "warranty"    // תעודת אחריות
  | "other";      // אחר

export const OPERATIONAL_DOC_TYPE_LABELS: Record<OperationalDocType, string> = {
  license:   "רישיון רכב",
  test:      "טסט",
  insurance: "ביטוח",
  manual:    "ספר מכונה",
  technical: "מסמך טכני",
  warranty:  "תעודת אחריות",
  other:     "אחר",
};

// ── Implemented in Fleet Phase 1 (migration 20260525120000_fleet_phase1) ──────
//
// equipment_maintenance_records — service history per equipment item
// equipment_incidents           — faults / accidents / events with severity + status
// equipment_tasks               — reminders / scheduled tasks per asset
//
// ── Still future ──────────────────────────────────────────────────────────────
//
// equipment_assignments — links equipment to work_orders for dispatch readiness
//                          (requires work_orders to have an equipment FK first)
// Financial linking (equipment_id on supplier_documents) — Fleet Phase 2
