export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type InventoryMovementType =
  | "receive"
  | "reserve"
  | "release_reservation"
  | "consume"
  | "return"
  | "adjustment"
  | "correction";

export type InventoryMovementSourceType =
  | "order"
  | "work_diary"
  | "delivery_note"
  | "manual_count"
  | "correction"
  | "production"
  | "return_from_field";

export interface InventoryMovement {
  id: string;
  itemId: string;
  movementType: InventoryMovementType;
  quantity: number;       // positive = stock added; negative = stock removed
  sourceType: InventoryMovementSourceType;
  sourceId?: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

// ── Stock status ──────────────────────────────────────────────────────────────

export type StockStatus =
  | "ok"           // current >= minimum (and minimum > 0)
  | "low_stock"    // 0 < current < minimum
  | "out_of_stock" // current == 0, minimum > 0
  | "negative"     // current < 0
  | "untracked";   // minimum == 0 and current == 0 — no threshold set yet

export function getStockStatus(currentQty: number, minimumQty: number): StockStatus {
  if (currentQty < 0) return "negative";
  if (minimumQty <= 0 && currentQty === 0) return "untracked";
  if (minimumQty <= 0) return "ok";
  if (currentQty === 0) return "out_of_stock";
  if (currentQty < minimumQty) return "low_stock";
  return "ok";
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  ok:          "תקין",
  low_stock:   "מלאי נמוך",
  out_of_stock: "חסר",
  negative:    "מלאי שלילי",
  untracked:   "לא מנוהל",
};

export const STOCK_STATUS_COLORS: Record<StockStatus, string> = {
  ok:          "bg-green-100 text-green-700",
  low_stock:   "bg-amber-100 text-amber-700",
  out_of_stock: "bg-red-100 text-red-700",
  negative:    "bg-red-100 text-red-900",
  untracked:   "bg-gray-100 text-gray-500",
};

export const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  receive:             "קבלת סחורה",
  reserve:             "הזמנה (שריון)",
  release_reservation: "שחרור שריון",
  consume:             "צריכה",
  return:              "החזרה",
  adjustment:          "התאמה ידנית",
  correction:          "תיקון",
};

export const SOURCE_TYPE_LABELS: Record<InventoryMovementSourceType, string> = {
  order:              "הזמנה",
  work_diary:         "יומן שטח",
  delivery_note:      "תעודת משלוח",
  manual_count:       "ספירה ידנית",
  correction:         "תיקון",
  production:         "ייצור",
  return_from_field:  "החזרה מהשטח",
};
