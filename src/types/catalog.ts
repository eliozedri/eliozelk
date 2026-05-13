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

export const DIMENSION_UNIT_OPTIONS = [
  "",
  "מטר",
  "ס\"מ",
  "מ\"מ",
  "מ\"ר",
  "ק\"ג",
  "גרם",
  "ליטר",
];

export const UNIT_OPTIONS = [
  "יחידה",
  "מטר",
  "ס\"מ",
  "מ\"ר",
  "ק\"ג",
  "שעה",
  "יום",
  "משמרת",
  "ערכה",
  "זוג",
  "כמות",
];
