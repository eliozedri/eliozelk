export interface HoloSpec {
  label: string;
  value: string;
}

export interface HoloMetric {
  label: string;
  value: string | number;
}

export type HoloStatus = "active" | "inactive" | "limited";

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
}
