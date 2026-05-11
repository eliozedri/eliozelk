// src/types/crew.ts

export type CrewSkill =
  | "road_marking"
  | "sign_installation"
  | "traffic_arrangement"
  | "guardrails"
  | "painting"
  | "general_installation"
  | "field_supervision";

export const CREW_SKILL_LABELS: Record<CrewSkill, string> = {
  road_marking: "סימון כבישים",
  sign_installation: "התקנת שילוט",
  traffic_arrangement: "סידור תנועה",
  guardrails: "גדרות בטיחות",
  painting: "צביעה",
  general_installation: "התקנה כללית",
  field_supervision: "פיקוח שטח",
};

export type CrewRegion = "north" | "center" | "south" | "jerusalem" | "all";

export const CREW_REGION_LABELS: Record<CrewRegion, string> = {
  north: "צפון",
  center: "מרכז",
  south: "דרום",
  jerusalem: "ירושלים והסביבה",
  all: "כל הארץ",
};

export interface Crew {
  id: string;
  name: string;
  leader: string;
  workerCount: number;
  phone: string;
  skills: CrewSkill[];
  region: CrewRegion;
  dailyCapacityHours: number;
  active: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
