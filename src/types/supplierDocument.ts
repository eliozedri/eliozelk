// Supplier Document Intake Engine — type definitions

export type SupplierDocumentStatus =
  | "uploaded"
  | "extracting"
  | "extraction_failed"
  | "draft_ready"
  | "needs_review"
  | "duplicate_suspected"
  | "approved"
  | "posted"
  | "rejected"
  | "archived";

export type SupplierDocumentType =
  | "supplier_invoice"
  | "tax_invoice"
  | "invoice_receipt"
  | "receipt"
  | "delivery_note"
  | "goods_receipt"
  | "supplier_quote"
  | "supplier_order_confirmation"
  | "unknown";

export type InventoryLineAction =
  | "increase_stock"
  | "no_inventory_impact"
  | "create_product_draft"
  | "link_to_existing_product"
  | "service_only"
  | "maintenance_expense"
  | "asset_purchase"
  | "requires_review";

export type DocumentLineStatus =
  | "extracted"
  | "needs_review"
  | "matched"
  | "product_draft_created"
  | "excluded"
  | "posted";

export type PaymentStatus = "unpaid" | "partial" | "paid" | "unknown";

// ── Document type labels (Hebrew) ─────────────────────────────────────────────

export const DOCUMENT_TYPE_LABELS: Record<SupplierDocumentType, string> = {
  supplier_invoice: "חשבונית ספק",
  tax_invoice: "חשבונית מס",
  invoice_receipt: "חשבונית מס / קבלה",
  receipt: "קבלה",
  delivery_note: "תעודת משלוח",
  goods_receipt: "תעודת קבלת סחורה",
  supplier_quote: "הצעת מחיר",
  supplier_order_confirmation: "אישור הזמנה",
  unknown: "לא מזוהה",
};

export const DOCUMENT_STATUS_LABELS: Record<SupplierDocumentStatus, string> = {
  uploaded: "הועלה",
  extracting: "מחלץ נתונים",
  extraction_failed: "חילוץ נכשל",
  draft_ready: "טיוטה מוכנה",
  needs_review: "ממתין לבדיקה",
  duplicate_suspected: "חשד לכפילות",
  approved: "אושר",
  posted: "נרשם",
  rejected: "נדחה",
  archived: "בארכיון",
};

export const DOCUMENT_STATUS_COLORS: Record<SupplierDocumentStatus, string> = {
  uploaded:            "bg-gray-100 text-gray-600",
  extracting:          "bg-blue-100 text-blue-700",
  extraction_failed:   "bg-red-100 text-red-700",
  draft_ready:         "bg-amber-100 text-amber-700",
  needs_review:        "bg-orange-100 text-orange-700",
  duplicate_suspected: "bg-red-100 text-red-800",
  approved:            "bg-green-100 text-green-700",
  posted:              "bg-teal-100 text-teal-700",
  rejected:            "bg-gray-200 text-gray-500",
  archived:            "bg-gray-100 text-gray-400",
};

export const INVENTORY_ACTION_LABELS: Record<InventoryLineAction, string> = {
  increase_stock:      "עדכון מלאי",
  no_inventory_impact: "ללא השפעה על מלאי",
  create_product_draft: "טיוטת מוצר חדש",
  link_to_existing_product: "קישור למוצר קיים",
  service_only:        "שירות בלבד",
  maintenance_expense: "הוצאת תחזוקה",
  asset_purchase:      "רכישת נכס / ציוד",
  requires_review:     "דורש בדיקה",
};

export const INVENTORY_ACTION_COLORS: Record<InventoryLineAction, string> = {
  increase_stock:       "bg-green-100 text-green-700",
  no_inventory_impact:  "bg-gray-100 text-gray-500",
  create_product_draft: "bg-purple-100 text-purple-700",
  link_to_existing_product: "bg-blue-100 text-blue-700",
  service_only:         "bg-gray-100 text-gray-500",
  maintenance_expense:  "bg-amber-100 text-amber-700",
  asset_purchase:       "bg-orange-100 text-orange-700",
  requires_review:      "bg-red-100 text-red-700",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid:  "לא שולם",
  partial: "שולם חלקית",
  paid:    "שולם",
  unknown: "לא ידוע",
};

export const DOCUMENT_CATEGORIES = [
  "חומרי גלם לייצור שילוט",
  "תמרורים ושלטים",
  "מדבקות / ויניל / חומר מחזיר אור",
  "צבעים וחומרי סימון כבישים",
  "פלסטיק קר / תרמופלסטי / דו רכיבי",
  "אביזרי בטיחות",
  "ציוד הסדרי תנועה",
  "מחסומים / מעקות / גידור",
  "חלקי חילוף ותחזוקת מכונות",
  "כלי עבודה וציוד מפעל",
  "צי רכב / טיפולים / דלק",
  "צמ״ה / מלגזות / גנרטורים",
  "שירותי קבלן משנה",
  "הוצאות משרדיות",
  "הוצאות כלליות",
  "לא מסווג / דורש בדיקה",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

// ── Document types that require financial expense posting ──────────────────

export const EXPENSE_DOCUMENT_TYPES: SupplierDocumentType[] = [
  "supplier_invoice",
  "tax_invoice",
  "invoice_receipt",
  "receipt",
];

// ── Document types that can create inventory movements ────────────────────

export const INVENTORY_DOCUMENT_TYPES: SupplierDocumentType[] = [
  "delivery_note",
  "goods_receipt",
  "supplier_invoice",
  "tax_invoice",
  "invoice_receipt",
];

// ── Document types that are informational only ────────────────────────────

export const INFORMATIONAL_DOCUMENT_TYPES: SupplierDocumentType[] = [
  "supplier_quote",
  "supplier_order_confirmation",
];

// ── Core interfaces ───────────────────────────────────────────────────────

export interface SupplierDocument {
  id: string;
  status: SupplierDocumentStatus;
  documentType: SupplierDocumentType;
  supplierId?: string;
  supplierNameRaw: string;
  supplierVatRaw: string;
  documentNumber: string;
  documentDate?: string;
  dueDate?: string;
  currency: string;
  subtotalBeforeVat?: number;
  vatAmount?: number;
  vatRate?: number;
  totalAfterVat?: number;
  paymentStatus: PaymentStatus;
  linkedOrderRef: string;
  linkedDeliveryNoteId?: string;
  rawText?: string;
  parsedJson?: Record<string, unknown>;
  extractionConfidence?: number;
  extractionNotes?: string;
  fileUrl?: string;
  fileName: string;
  fileType: string;
  fileHash?: string;
  notes: string;
  rejectionReason?: string;
  expenseRecordId?: string;
  createdBy: string;
  reviewedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  postedAt?: string;
  createdAt: string;
  updatedAt: string;
  // Fleet ↔ finance link + classification layer (Phase 2/3)
  equipmentId?: string | null;
  linkedMaintenanceId?: string | null;
  linkedIncidentId?: string | null;
  uploadSource?: string;
  businessArea?: string | null;
  expenseType?: string | null;
  requiresClassification?: boolean;
  // Joined data
  supplier?: SupplierMeta;
  lines?: SupplierDocumentLine[];
}

export interface SupplierMeta {
  id: string;
  name: string;
  vatNumber: string;
  phone: string;
  email: string;
  whatsapp: string;
  address: string;
  city: string;
  contactPerson: string;
}

export interface SupplierDocumentLine {
  id: string;
  documentId: string;
  lineNumber: number;
  originalDescription: string;
  normalizedDescription: string;
  supplierSku: string;
  quantity?: number;
  unitOfMeasure: string;
  unitPrice?: number;
  discountPercent?: number;
  lineSubtotal?: number;
  lineTotal?: number;
  category: string;
  catalogItemId?: string;
  inventoryAction: InventoryLineAction;
  status: DocumentLineStatus;
  confidenceScore: number;
  warningFlags: string[];
  createdAt: string;
  updatedAt: string;
  // Joined
  catalogItemName?: string;
  catalogItemCurrentQty?: number;
  catalogItemMinQty?: number;
}

export interface ExpenseRecord {
  id: string;
  supplierId?: string;
  documentId?: string;
  documentType: string;
  documentNumber: string;
  expenseDate: string;
  dueDate?: string;
  category: string;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  notes: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseLine {
  id: string;
  expenseRecordId: string;
  documentLineId?: string;
  description: string;
  quantity?: number;
  unitOfMeasure: string;
  unitPrice?: number;
  lineTotal: number;
  category: string;
  catalogItemId?: string;
  inventoryAction: string;
  createdAt: string;
}

export interface ProductSupplierMapping {
  id: string;
  catalogItemId: string;
  supplierId: string;
  supplierSku: string;
  supplierItemName: string;
  lastPurchasePrice?: number;
  lastPurchaseCurrency: string;
  lastPurchaseUnit: string;
  lastPurchaseDate?: string;
  averagePurchasePrice?: number;
  isPreferred: boolean;
  leadTimeDays?: number;
  minimumOrderQuantity?: number;
  notes: string;
  sourceDocumentId?: string;
  confidenceScore: number;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

// ── Posting preview ───────────────────────────────────────────────────────

export interface PostingPreview {
  documentId: string;
  willCreateExpense: boolean;
  inventoryLineCount: number;
  serviceLinesCount: number;
  productDraftCount: number;
  willCreateSupplierDraft: boolean;
  duplicateRisk: boolean;
  totalAmount?: number;
  vatAmount?: number;
  supplierName: string;
  warnings: string[];
  errors: string[];
  canPost: boolean;
}

// ── User document-type pre-selection (4-card UI flow) ─────────────────────────

export type UserDocumentCard = "invoice" | "delivery_note" | "receipt" | "other";

export const USER_CARD_LABELS: Record<UserDocumentCard, string> = {
  invoice:       "חשבונית",
  delivery_note: "תעודת משלוח",
  receipt:       "קבלה",
  other:         "אחר",
};

export const USER_CARD_DESCRIPTIONS: Record<UserDocumentCard, string> = {
  invoice:       "קליטת הוצאה מספק, כולל מעִה ושורות פריטים",
  delivery_note: "קליטת סחורה למלאי והתאמה לחשבונית בהמשך",
  receipt:       "אסמכתת תשלום או קבלה מספק",
  other:         "מסמך כללי לבדיקה וסיווג ידני",
};

// Default SupplierDocumentType used as OCR hint for each card
export const USER_CARD_DEFAULT_TYPE: Record<UserDocumentCard, SupplierDocumentType> = {
  invoice:       "tax_invoice",
  delivery_note: "delivery_note",
  receipt:       "receipt",
  other:         "unknown",
};

// SupplierDocumentType values in the same group as each card (mismatch detection)
export const USER_CARD_TYPE_GROUPS: Record<UserDocumentCard, SupplierDocumentType[]> = {
  invoice:       ["supplier_invoice", "tax_invoice", "invoice_receipt"],
  delivery_note: ["delivery_note", "goods_receipt"],
  receipt:       ["receipt", "invoice_receipt"],
  other:         ["supplier_quote", "supplier_order_confirmation", "unknown"],
};

export interface CardBusinessEffect {
  createsExpense: boolean | "maybe";
  updatesInventory: boolean | "maybe";
  awaitInvoiceMatch: boolean;
}

export const USER_CARD_BUSINESS_EFFECT: Record<UserDocumentCard, CardBusinessEffect> = {
  invoice:       { createsExpense: true,    updatesInventory: "maybe", awaitInvoiceMatch: false },
  delivery_note: { createsExpense: false,   updatesInventory: true,    awaitInvoiceMatch: true  },
  receipt:       { createsExpense: true,    updatesInventory: false,   awaitInvoiceMatch: false },
  other:         { createsExpense: "maybe", updatesInventory: false,   awaitInvoiceMatch: false },
};

export function docTypeToUserCard(docType: SupplierDocumentType): UserDocumentCard {
  for (const [card, types] of Object.entries(USER_CARD_TYPE_GROUPS) as [UserDocumentCard, SupplierDocumentType[]][]) {
    if (types.includes(docType)) return card;
  }
  return "other";
}

export function isTypeMismatch(userCard: UserDocumentCard, detectedType: SupplierDocumentType): boolean {
  return !USER_CARD_TYPE_GROUPS[userCard].includes(detectedType);
}

// ── Duplicate check result ─────────────────────────────────────────────────

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  candidates: Array<{
    documentId: string;
    documentNumber: string;
    supplierName: string;
    date?: string;
    total?: number;
    matchReason: string;
    matchScore: number;
  }>;
}

// ── Data quality warnings ─────────────────────────────────────────────────

export interface DataQualityWarning {
  type:
    | "supplier_missing_phone"
    | "supplier_missing_email"
    | "product_no_preferred_supplier"
    | "product_no_minimum_stock"
    | "product_no_reorder_rule"
    | "cost_changed_significantly"
    | "supplier_sku_missing"
    | "line_unmatched_product"
    | "total_mismatch"
    | "vat_mismatch"
    | "supplier_unknown";
  message: string;
  severity: "error" | "warning" | "info";
  field?: string;
  lineId?: string;
}
