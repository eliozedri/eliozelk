import { nanoid } from "nanoid";

export type WorkDiaryStatus = "draft" | "submitted" | "cancelled";

export interface PaintingItem {
  id: string;
  name: string;
  unit: string;
  white: string;
  orange: string;
  yellow: string;
  black: string;
  retroReflective: boolean;
  beads: boolean;
  size: string;
  notes: string;
}

export interface PoleItem {
  id: string;
  name: string;
  unit: string;
  isCustom: boolean;
  out: string;
  supply: string;
  install: string;
  dismantle: string;
  move: string;
  straighten: string;
  returned: string;
  size: string;
  notes: string;
}

export interface SignItem {
  id: string;
  urban: string;
  basic: string;
  regular: string;
  reinforced: string;
  diamond: string;
  out: string;
  supply: string;
  install: string;
  dismantle: string;
  move: string;
  angle: string;
  frame: string;
  profile: string;
  signSize: string;
  battery: boolean;
  solar: boolean;
  returned: string;
  notes: string;
}

export interface DiaryPhoto {
  id: string;
  dataUrl: string;
  caption: string;
  takenAt: string;
}

export interface DiarySignature {
  signerName: string;
  signerRole: string;
  signerEmail: string;
  location: string;
  signedAt: string;
  dataUrl: string;
}

export type DiaryApprovalStatus = "pending" | "approved" | "rejected";

export interface SecurityTeamLine {
  quantity: string;
  notes: string;
}

export interface SecurityTeams {
  arrowBoards: SecurityTeamLine[];   // עגלות חץ
  inspectors: SecurityTeamLine[];    // פקחים
}

export interface AdditionalTeamLine {
  quantity: string;
  notes: string;
}

export interface AdditionalTeamsOtherEntry {
  id: string;
  description: string;
  quantity: string;
  notes: string;
}

export interface AdditionalTeams {
  crane: AdditionalTeamLine;       // מנוף
  sweeper: AdditionalTeamLine;     // מקרצפת
  other: AdditionalTeamsOtherEntry[];
}

export function emptySecurityTeams(): SecurityTeams {
  return {
    arrowBoards: [{ quantity: "", notes: "" }],
    inspectors: [{ quantity: "", notes: "" }],
  };
}

// Normalize persisted SecurityTeams: old diaries stored single objects, new format uses arrays.
export function normalizeSecurityTeams(raw: unknown): SecurityTeams {
  const empty = emptySecurityTeams();
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;

  function toArray(v: unknown): SecurityTeamLine[] {
    if (!v) return [{ quantity: "", notes: "" }];
    if (Array.isArray(v)) return v as SecurityTeamLine[];
    return [v as SecurityTeamLine]; // old single-object format
  }

  return {
    arrowBoards: toArray(r.arrowBoards),
    inspectors: toArray(r.inspectors),
  };
}

export function emptyAdditionalTeams(): AdditionalTeams {
  return {
    crane: { quantity: "", notes: "" },
    sweeper: { quantity: "", notes: "" },
    other: [],
  };
}

export interface WorkDiary {
  id: string;
  diaryNumber: string;
  draftName?: string;
  status: WorkDiaryStatus;
  customerName: string;
  siteName: string;
  contactName: string;
  contactPhone: string;
  executionDate: string;
  startTime: string;
  endTime: string;
  vehicleNumber: string;
  trailerNumber: string;
  driverName: string;
  crewLeaderName: string;
  crewMembers: string[];
  paintingItems: PaintingItem[];
  poleItems: PoleItem[];
  signItems: SignItem[];
  photos: DiaryPhoto[];
  generalNotes: string;
  customerSignature: DiarySignature | null;
  companySignature: DiarySignature | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  cancelledAt?: string;

  // ─── Profitability & billing ──────────────────────────────
  orderId?: string;             // link to WorkOrder.id
  orderNumber?: string;         // snapshot for display
  billedAmount?: number;        // ₪ expected/actual billing for this day
  isBillable?: boolean;         // false = internal/non-billable work
  billingNotes?: string;

  // ─── Time breakdown (hours, decimal) ─────────────────────
  travelTimeHours?: number;     // total travel (both ways)
  setupTimeHours?: number;      // equipment setup/teardown
  waitingTimeHours?: number;    // idle/wait time on site
  executionTimeHours?: number;  // actual productive execution time

  // ─── Cost overrides ───────────────────────────────────────
  vehicleCostOverride?: number; // if different from rate defaults
  equipmentCost?: number;       // rental/machines beyond base vehicle
  materialCost?: number;        // paint, signs, consumables used

  // ─── Manager approval ────────────────────────────────────
  approvalStatus?: DiaryApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;

  // ─── Security & additional teams ─────────────────────────
  securityTeams?: SecurityTeams;
  additionalTeams?: AdditionalTeams;
}

// ── Seed factories ──────────────────────────────────────────

function emptyPainting(name: string, unit: string): PaintingItem {
  return {
    id: nanoid(),
    name,
    unit,
    white: "",
    orange: "",
    yellow: "",
    black: "",
    retroReflective: false,
    beads: false,
    size: "",
    notes: "",
  };
}

function emptyPole(name: string, isCustom = false): PoleItem {
  return {
    id: nanoid(),
    name,
    unit: "יח׳",
    isCustom,
    out: "",
    supply: "",
    install: "",
    dismantle: "",
    move: "",
    straighten: "",
    returned: "",
    size: "",
    notes: "",
  };
}

function emptySign(): SignItem {
  return {
    id: nanoid(),
    urban: "",
    basic: "",
    regular: "",
    reinforced: "",
    diamond: "",
    out: "",
    supply: "",
    install: "",
    dismantle: "",
    move: "",
    angle: "",
    frame: "",
    profile: "",
    signSize: "",
    battery: false,
    solar: false,
    returned: "",
    notes: "",
  };
}

export function createDefaultPaintingItems(): PaintingItem[] {
  return [
    emptyPainting('פס ניתוב 15-10 ס"מ', 'מ"א'),
    emptyPainting('חנייות ברוחב 15-10 ס"מ', 'מ"א'),
    emptyPainting('קוביות ברוחב 30 ס"מ', 'מ"א'),
    emptyPainting("אבני שפה", 'מ"ר'),
    emptyPainting("מעברי חצייה", 'מ"ר'),
    emptyPainting("משטחים בכחול", 'מ"ר'),
    emptyPainting("אי תנועה", 'מ"ר'),
    emptyPainting("פס עצירה", 'מ"ר'),
    emptyPainting("פס האטה", 'מ"ר'),
    emptyPainting("חץ בודד", "יח׳"),
    emptyPainting("חץ כפול", "יח׳"),
    emptyPainting("חץ משולש", "יח׳"),
    emptyPainting("ד-16", "יח׳"),
  ];
}

export function createDefaultPoleItems(): PoleItem[] {
  return [
    emptyPole('מגולוון 1.50 מ"א'),
    emptyPole('מגולוון 3.00 מ"א'),
    emptyPole('מגולוון 3.50 מ"א'),
    emptyPole("מערכת חיבור"),
  ];
}

export function createDefaultSignItems(): SignItem[] {
  return [emptySign()];
}

export function createEmptyDiary(diaryNumber: string): WorkDiary {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const startTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return {
    id: nanoid(),
    diaryNumber,
    status: "draft",
    customerName: "",
    siteName: "",
    contactName: "",
    contactPhone: "",
    executionDate: today,
    startTime,
    endTime: "",
    vehicleNumber: "",
    trailerNumber: "",
    driverName: "",
    crewLeaderName: "",
    crewMembers: [""],
    paintingItems: createDefaultPaintingItems(),
    poleItems: createDefaultPoleItems(),
    signItems: createDefaultSignItems(),
    photos: [],
    generalNotes: "",
    customerSignature: null,
    companySignature: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    submittedAt: null,
  };
}

export const DIARY_STATUS_LABELS: Record<WorkDiaryStatus, string> = {
  draft: "טיוטה",
  submitted: "נשלח",
  cancelled: "בוטל",
};

export const DIARY_STATUS_COLORS: Record<WorkDiaryStatus, string> = {
  draft: "bg-amber-100 text-amber-700",
  submitted: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};
