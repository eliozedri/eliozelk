export interface LinkedProductEntry {
  id: string;
  name: string;
  qty: number;
  required: boolean;
}

export type CatalogItemType =
  | "product"
  | "service"
  | "labor"
  | "material"
  | "equipment"
  | "misc";

export interface CatalogItem {
  id: string;
  name: string;
  type: CatalogItemType;
  category: string;
  unitOfMeasure: string;     // order unit (יחידה / מטר / שעה …)
  dimensionValue?: string;   // physical size value, e.g. "1.5"
  dimensionUnit?: string;    // physical size unit, e.g. "מטר"
  defaultPrice: number | null;
  description: string;
  isActive: boolean;
  hoursPerUnit?: number;
  linkedProducts?: LinkedProductEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogFormState {
  name: string;
  type: CatalogItemType;
  category: string;
  unitOfMeasure: string;
  dimensionValue: string;
  dimensionUnit: string;
  defaultPrice: string;
  description: string;
}

export const TYPE_LABELS: Record<CatalogItemType, string> = {
  product: "מוצר",
  service: "שירות",
  labor: "כוח אדם",
  material: "חומרים",
  equipment: "ציוד",
  misc: "שונות",
};

export const TYPE_COLORS: Record<CatalogItemType, string> = {
  product: "bg-blue-100 text-blue-700",
  service: "bg-purple-100 text-purple-700",
  labor: "bg-orange-100 text-orange-700",
  material: "bg-teal-100 text-teal-700",
  equipment: "bg-gray-100 text-gray-600",
  misc: "bg-amber-100 text-amber-700",
};

export const DIMENSION_UNIT_OPTIONS_DEFAULT = [
  "",
  "ס\"מ",
  "מ\"מ",
  "מ\"ר",
  "מטר",
];

export const DIMENSION_UNIT_OPTIONS = DIMENSION_UNIT_OPTIONS_DEFAULT;

export const UNIT_OPTIONS = [
  "יחידה",
  "יחידת אורך",
  "מטר",
  "ס\"מ",
  "מ\"ר",
  "שעה",
  "יום",
  "משמרת",
];

// Units that drive a length-based measurement field
export const LENGTH_UNITS = new Set(["מטר", "ס\"מ", "יחידת אורך"]);
// Units that drive an area-based measurement field
export const AREA_UNITS = new Set(["מ\"ר"]);
// Units where physical measurement is not relevant
export const NO_DIMENSION_UNITS = new Set(["שעה", "יום", "משמרת"]);
