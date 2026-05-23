export interface HoloSpec {
  label: string;
  value: string;
}

export interface HoloMetric {
  label: string;
  value: string | number;
}

export type HoloStatus = "active" | "inactive" | "limited";

/** Per-product inventory breakdown — optional, used by heroes that show operational depth. */
export interface HoloReservation {
  orderId: string;
  qty: number;
  site?: string;
  customer?: string;
  due?: string;     // ISO date
}

export interface HoloMovement {
  date: string;     // ISO
  type: "in" | "out";
  qty: number;
  ref?: string;
}

export interface HoloInventory {
  total: number;          // סך הכל בארגון
  available: number;      // מלאי זמין (free to allocate)
  reserved: number;       // שמור לעבודות פעילות
  inProduction: number;   // בייצור
  inTransit: number;      // ברכש פתוח / משלוח נכנס
  minimum: number;        // מינימום / נקודת הזמנה מחדש
  usagePerMonth?: number; // קצב צריכה חודשי
  reservations?: HoloReservation[];
  recentMovement?: HoloMovement;
  nextReorder?: { date: string; qty: number; supplier?: string };
}

export interface HoloProduct {
  id: string;
  title: string;
  category: string;
  imageUrl: string;
  description: string;
  status: HoloStatus;
  unit: string;
  inventoryLabel: string;
  specs: HoloSpec[];
  metrics: HoloMetric[];
  tags: string[];
  accentColor?: string;
  inventory?: HoloInventory;
}
