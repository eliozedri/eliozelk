export interface SignRecord {
  number: string;
  imageFile: string;
  shape: string;
  name: string;
  series: string;
  available: boolean;
  needsReview: boolean;
}

export interface SignRow {
  id: string;
  signNumber: string;
  quantity: string;
  notes: string;
  imageUrl: string | null;
  size: string;
  type: string;
  lookupStatus: "idle" | "found" | "not_found";
}

export interface MiscRow {
  id: string;
  description: string;
  quantity: string;
  notes: string;
  // Custom dimension fields (for "שלט לפי מידה")
  customWidth?: string;
  customHeight?: string;
  attachmentDataUrl?: string;
  attachmentName?: string;
  // Optional catalog reference — snapshot at order creation time
  catalogItemId?: string;
  catalogItemName?: string;
  catalogItemUnit?: string;
  catalogItemCategory?: string;
  catalogItemType?: string;
}

export interface OrderAttachment {
  id: string;
  name: string;
  dataUrl: string;
  type: string;
  size: number;
}

export interface FabricationDetails {
  description: string;
  width: string;
  height: string;
  quantity: string;
  material: string;
  notes: string;
}

export interface OrderHeader {
  date: string;
  customer: string;      // שם החברה
  contactPerson: string; // איש קשר
  orderedBy: string;     // מזמין
  city: string;          // עיר (required)
}

export interface OrderState extends OrderHeader {
  // Order classification (required at form submission)
  orderType?: "field_work" | "pickup" | "equipment_supply";
  fulfillmentMethod?: "self_pickup" | "delivery" | null;
  awaitingCustomerApproval?: boolean;
  requiredDate?: string;
  jobName?: string;
  location?: string;
  signRows: SignRow[];
  accessoryRows: MiscRow[];
  miscRows: MiscRow[];
  serviceRows: MiscRow[];
  generalNotes: string;
  attachments: OrderAttachment[];
  fabricationRequired: boolean;
  fabricationDetails: FabricationDetails;
}

export type OrderSnapshot = OrderState;
