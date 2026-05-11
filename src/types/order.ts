export interface SignRecord {
  number: string;
  imageFile: string;
  shape: string;
  series: string;
  available: boolean;
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
  // Optional catalog reference — snapshot at order creation time
  catalogItemId?: string;
  catalogItemName?: string;
  catalogItemUnit?: string;
  catalogItemCategory?: string;
  catalogItemType?: string;
}

export interface OrderHeader {
  date: string;
  customer: string;      // שם החברה
  contactPerson: string; // איש קשר
  orderedBy: string;     // מזמין
  location: string;      // מיקום האתר
  jobSlash: string;      // סלאש העבודה
  city: string;
  reference?: string;    // kept optional for backward compat with old orders
}

export interface OrderState extends OrderHeader {
  signRows: SignRow[];
  miscRows: MiscRow[];
  accessoryRows: MiscRow[];
}

export type OrderSnapshot = OrderState;
