# Work Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a digital work diary module (יומן עבודה) — a tabbed form that replaces the company's physical paper diary, with PDF export, canvas signatures, photo upload, and integration into the accounting page.

**Architecture:** Standalone form at `/work-diary` with 4 tabs (פרטי עבודה / צביעה / עמודים ותמרורים / תיעוד), persisted in localStorage under `elkayam_work_diaries`. Submitted diaries appear in a new "יומני עבודה" tab in the existing Accounting page. No tests directory exists in the project — verification is manual browser testing.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, @react-pdf/renderer, nanoid, HTML Canvas (no extra libs for signatures)

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `src/types/workDiary.ts` | All TypeScript types + seed data factories |
| `src/hooks/useWorkDiaries.ts` | localStorage CRUD hook |
| `src/context/WorkDiaryContext.tsx` | Context + Provider export |
| `src/components/WorkDiaryProvider.tsx` | Re-export wrapper (matches existing pattern) |
| `src/components/WorkDiary/index.tsx` | Root form component — tab state + save/submit |
| `src/components/WorkDiary/TabBar.tsx` | 4-tab navigation bar |
| `src/components/WorkDiary/DiaryActions.tsx` | Fixed bottom bar: draft / submit / PDF |
| `src/components/WorkDiary/DiaryHeader.tsx` | Tab 1: פרטי עבודה fields |
| `src/components/WorkDiary/PaintingTab.tsx` | Tab 2: צביעה table |
| `src/components/WorkDiary/PolesSignsTab.tsx` | Tab 3: עמודים + תמרורים tables |
| `src/components/WorkDiary/DocumentTab.tsx` | Tab 4: photos + notes + signatures |
| `src/components/WorkDiary/SignatureCanvas.tsx` | Canvas signature pad (touch + mouse) |
| `src/components/WorkDiary/PhotoUpload.tsx` | Camera capture → compressed base64 |
| `src/components/pdf/WorkDiaryDocument.tsx` | @react-pdf/renderer document |
| `src/lib/workDiaryExport.ts` | PDF download + mailto helper |
| `src/app/work-diary/page.tsx` | Next.js page |

### Modified files
| File | Change |
|------|--------|
| `src/components/Sidebar.tsx` | Add יומן עבודה link |
| `src/app/layout.tsx` | Wrap with WorkDiaryProvider |
| `src/components/Accounting/index.tsx` | Add יומני עבודה tab |

---

### Task 1: Types and seed data

**Files:**
- Create: `src/types/workDiary.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/types/workDiary.ts
import { nanoid } from "nanoid";

export type WorkDiaryStatus = "draft" | "submitted";

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

export interface WorkDiary {
  id: string;
  diaryNumber: string;
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
  crewMembers: [string, string, string, string];
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
}

// ── Seed factories ──────────────────────────────────────────

function emptyPainting(name: string, unit: string): PaintingItem {
  return { id: nanoid(), name, unit, white: "", orange: "", yellow: "", black: "", retroReflective: false, beads: false, size: "", notes: "" };
}

function emptyPole(name: string, isCustom = false): PoleItem {
  return { id: nanoid(), name, unit: "יח׳", isCustom, out: "", supply: "", install: "", dismantle: "", move: "", straighten: "", returned: "", size: "", notes: "" };
}

function emptySign(): SignItem {
  return { id: nanoid(), urban: "", basic: "", regular: "", reinforced: "", diamond: "", out: "", supply: "", install: "", dismantle: "", move: "", angle: "", frame: "", profile: "", signSize: "", battery: false, solar: false, returned: "", notes: "" };
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
  return Array.from({ length: 10 }, emptySign);
}

export function createEmptyDiary(diaryNumber: string): WorkDiary {
  const today = new Date().toISOString().split("T")[0];
  return {
    id: nanoid(),
    diaryNumber,
    status: "draft",
    customerName: "",
    siteName: "",
    contactName: "",
    contactPhone: "",
    executionDate: today,
    startTime: "",
    endTime: "",
    vehicleNumber: "",
    trailerNumber: "",
    driverName: "",
    crewLeaderName: "",
    crewMembers: ["", "", "", ""],
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
};

export const DIARY_STATUS_COLORS: Record<WorkDiaryStatus, string> = {
  draft: "bg-amber-100 text-amber-700",
  submitted: "bg-green-100 text-green-700",
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors related to `workDiary.ts`

---

### Task 2: localStorage hook

**Files:**
- Create: `src/hooks/useWorkDiaries.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useWorkDiaries.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { WorkDiary, WorkDiaryStatus } from "@/types/workDiary";
import { createEmptyDiary } from "@/types/workDiary";

const STORAGE_KEY = "elkayam_work_diaries";

function loadDiaries(): WorkDiary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function generateDiaryNumber(diaries: WorkDiary[]): string {
  const year = new Date().getFullYear();
  const prefix = `WD-${year}-`;
  const existing = diaries
    .filter((d) => d.diaryNumber.startsWith(prefix))
    .map((d) => parseInt(d.diaryNumber.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function useWorkDiaries() {
  const [diaries, setDiaries] = useState<WorkDiary[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDiaries(loadDiaries());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diaries));
  }, [diaries, hydrated]);

  const createDiary = useCallback((): WorkDiary => {
    const existing = loadDiaries();
    const number = generateDiaryNumber(existing);
    const diary = createEmptyDiary(number);
    setDiaries((prev) => [diary, ...prev]);
    return diary;
  }, []);

  const saveDiary = useCallback((diary: WorkDiary) => {
    const now = new Date().toISOString();
    setDiaries((prev) => {
      const exists = prev.find((d) => d.id === diary.id);
      if (exists) {
        return prev.map((d) => d.id === diary.id ? { ...diary, updatedAt: now } : d);
      }
      return [{ ...diary, updatedAt: now }, ...prev];
    });
  }, []);

  const submitDiary = useCallback((id: string) => {
    const now = new Date().toISOString();
    setDiaries((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, status: "submitted" as WorkDiaryStatus, submittedAt: now, updatedAt: now } : d
      )
    );
  }, []);

  const deleteDiary = useCallback((id: string) => {
    setDiaries((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { diaries, createDiary, saveDiary, submitDiary, deleteDiary };
}
```

---

### Task 3: Context and Provider

**Files:**
- Create: `src/context/WorkDiaryContext.tsx`
- Create: `src/components/WorkDiaryProvider.tsx`

- [ ] **Step 1: Create context**

```typescript
// src/context/WorkDiaryContext.tsx
"use client";

import { createContext, useContext } from "react";
import { useWorkDiaries } from "@/hooks/useWorkDiaries";
import type { WorkDiary } from "@/types/workDiary";

interface WorkDiaryContextValue {
  diaries: WorkDiary[];
  createDiary: () => WorkDiary;
  saveDiary: (diary: WorkDiary) => void;
  submitDiary: (id: string) => void;
  deleteDiary: (id: string) => void;
}

const WorkDiaryContext = createContext<WorkDiaryContextValue | null>(null);

export function WorkDiaryProvider({ children }: { children: React.ReactNode }) {
  const value = useWorkDiaries();
  return <WorkDiaryContext.Provider value={value}>{children}</WorkDiaryContext.Provider>;
}

export function useWorkDiaryContext(): WorkDiaryContextValue {
  const ctx = useContext(WorkDiaryContext);
  if (!ctx) throw new Error("useWorkDiaryContext must be used inside WorkDiaryProvider");
  return ctx;
}
```

- [ ] **Step 2: Create provider wrapper**

```typescript
// src/components/WorkDiaryProvider.tsx
export { WorkDiaryProvider } from "@/context/WorkDiaryContext";
```

- [ ] **Step 3: Add to layout**

In `src/app/layout.tsx`, add `WorkDiaryProvider` wrapping `CatalogProvider` and `OrdersProvider`:

```tsx
import { WorkDiaryProvider } from "@/components/WorkDiaryProvider";

// inside RootLayout:
<CatalogProvider>
  <OrdersProvider>
    <WorkDiaryProvider>
      {children}
    </WorkDiaryProvider>
  </OrdersProvider>
</CatalogProvider>
```

---

### Task 4: SignatureCanvas component

**Files:**
- Create: `src/components/WorkDiary/SignatureCanvas.tsx`

- [ ] **Step 1: Create signature canvas**

```tsx
// src/components/WorkDiary/SignatureCanvas.tsx
"use client";

import { useRef, useEffect, useCallback } from "react";

interface Props {
  value: string;        // base64 dataUrl — empty string = empty
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

export function SignatureCanvas({ value, onChange, disabled = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Draw existing signature when value changes externally
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, [value]);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    drawing.current = true;
    lastPos.current = getPos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !lastPos.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  }, []);

  const onPointerUp = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }, [onChange]);

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`border rounded-lg overflow-hidden bg-gray-50 ${disabled ? "opacity-60" : "cursor-crosshair"}`}>
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          className="w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="self-start text-xs text-gray-500 hover:text-red-500 underline transition-colors"
        >
          נקה חתימה
        </button>
      )}
    </div>
  );
}
```

---

### Task 5: PhotoUpload component

**Files:**
- Create: `src/components/WorkDiary/PhotoUpload.tsx`

- [ ] **Step 1: Create photo upload**

```tsx
// src/components/WorkDiary/PhotoUpload.tsx
"use client";

import { useRef } from "react";
import { nanoid } from "nanoid";
import type { DiaryPhoto } from "@/types/workDiary";

const MAX_PHOTOS = 5;
const MAX_DIM = 800;

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props {
  photos: DiaryPhoto[];
  onChange: (photos: DiaryPhoto[]) => void;
  disabled?: boolean;
}

export function PhotoUpload({ photos, onChange, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const remaining = MAX_PHOTOS - photos.length;
    const toProcess = Array.from(files).slice(0, remaining);
    const newPhotos: DiaryPhoto[] = [];
    for (const file of toProcess) {
      const dataUrl = await compressImage(file);
      newPhotos.push({ id: nanoid(), dataUrl, caption: "", takenAt: new Date().toISOString() });
    }
    onChange([...photos, ...newPhotos]);
  }

  function updateCaption(id: string, caption: string) {
    onChange(photos.map((p) => p.id === id ? { ...p, caption } : p));
  }

  function removePhoto(id: string) {
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-3">
      {photos.map((photo, idx) => (
        <div key={photo.id} className="flex gap-3 items-start bg-gray-50 rounded-lg p-2 border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.dataUrl} alt={`תמונה ${idx + 1}`} className="w-20 h-20 object-cover rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={photo.caption}
              onChange={(e) => updateCaption(photo.id, e.target.value)}
              placeholder="תיאור (אופציונלי)"
              disabled={disabled}
              className="w-full px-2 py-1 text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              {new Date(photo.takenAt).toLocaleTimeString("he-IL")}
            </p>
          </div>
          {!disabled && (
            <button type="button" onClick={() => removePhoto(photo.id)} className="text-gray-400 hover:text-red-500 transition-colors shrink-0 mt-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {!disabled && photos.length < MAX_PHOTOS && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors w-full justify-center"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            הוסף תמונה ({photos.length}/{MAX_PHOTOS})
          </button>
        </>
      )}
    </div>
  );
}
```

---

### Task 6: TabBar component

**Files:**
- Create: `src/components/WorkDiary/TabBar.tsx`

- [ ] **Step 1: Create tab bar**

```tsx
// src/components/WorkDiary/TabBar.tsx
"use client";

export type DiaryTab = "header" | "painting" | "poles" | "docs";

const TABS: { id: DiaryTab; label: string }[] = [
  { id: "header", label: "פרטי עבודה" },
  { id: "painting", label: "צביעה" },
  { id: "poles", label: "עמודים ותמרורים" },
  { id: "docs", label: "תיעוד" },
];

interface Props {
  active: DiaryTab;
  onChange: (tab: DiaryTab) => void;
}

export function TabBar({ active, onChange }: Props) {
  return (
    <div className="flex border-b border-gray-200 bg-white overflow-x-auto no-scrollbar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            active === tab.id
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

---

### Task 7: DiaryHeader — Tab 1

**Files:**
- Create: `src/components/WorkDiary/DiaryHeader.tsx`

- [ ] **Step 1: Create header tab**

```tsx
// src/components/WorkDiary/DiaryHeader.tsx
"use client";

import type { WorkDiary } from "@/types/workDiary";

const inputCls = "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400";

interface Props {
  diary: WorkDiary;
  onChange: (partial: Partial<WorkDiary>) => void;
  disabled?: boolean;
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

export function DiaryHeader({ diary, onChange, disabled = false }: Props) {
  const inp = (key: keyof WorkDiary) => ({
    value: diary[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value }),
    disabled,
    className: inputCls,
  });

  return (
    <div className="space-y-5">
      {/* Project details */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">פרטי הפרויקט</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="שם הקבלן *">
            <input type="text" placeholder="שם הקבלן או הלקוח" {...inp("customerName")} />
          </Field>
          <Field label="אתר העבודה *">
            <input type="text" placeholder="כתובת / שם האתר" {...inp("siteName")} />
          </Field>
          <Field label="איש קשר">
            <input type="text" placeholder="שם איש הקשר" {...inp("contactName")} />
          </Field>
          <Field label="טלפון">
            <input type="tel" placeholder="050-0000000" dir="ltr" {...inp("contactPhone")} />
          </Field>
        </div>
      </div>

      {/* Execution details */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">פרטי ביצוע</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="תאריך ביצוע *">
            <input type="date" dir="ltr" {...inp("executionDate")} />
          </Field>
          <Field label="שעת תחילה">
            <input type="time" dir="ltr" {...inp("startTime")} />
          </Field>
          <Field label="שעת סיום">
            <input type="time" dir="ltr" {...inp("endTime")} />
          </Field>
          <Field label='רכב מס׳'>
            <input type="text" placeholder="מספר הרכב" {...inp("vehicleNumber")} />
          </Field>
          <Field label='נגרר מס׳'>
            <input type="text" placeholder="מספר הנגרר" {...inp("trailerNumber")} />
          </Field>
          <Field label="שם הנהג">
            <input type="text" placeholder="שם הנהג" {...inp("driverName")} />
          </Field>
        </div>
      </div>

      {/* Crew */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">צוות</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="ראש צוות">
            <input type="text" placeholder="שם ראש הצוות" {...inp("crewLeaderName")} />
          </Field>
          {([0, 1, 2, 3] as const).map((i) => (
            <Field key={i} label={`איש צוות ${i + 1}`}>
              <input
                type="text"
                placeholder={`שם איש צוות ${i + 1}`}
                value={diary.crewMembers[i]}
                onChange={(e) => {
                  const updated: [string, string, string, string] = [...diary.crewMembers];
                  updated[i] = e.target.value;
                  onChange({ crewMembers: updated });
                }}
                disabled={disabled}
                className={inputCls}
              />
            </Field>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

### Task 8: PaintingTab — Tab 2

**Files:**
- Create: `src/components/WorkDiary/PaintingTab.tsx`

- [ ] **Step 1: Create painting tab**

```tsx
// src/components/WorkDiary/PaintingTab.tsx
"use client";

import type { PaintingItem } from "@/types/workDiary";

const numCls = "w-14 px-1 py-1 text-center text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white";
const txtCls = "w-full px-2 py-1 text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white";

interface Props {
  items: PaintingItem[];
  onChange: (items: PaintingItem[]) => void;
  disabled?: boolean;
}

function updateItem(items: PaintingItem[], id: string, partial: Partial<PaintingItem>): PaintingItem[] {
  return items.map((item) => item.id === id ? { ...item, ...partial } : item);
}

export function PaintingTab({ items, onChange, disabled = false }: Props) {
  const upd = (id: string, partial: Partial<PaintingItem>) => onChange(updateItem(items, id, partial));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-yellow-50 border-b border-yellow-100">
        <h2 className="text-base font-bold text-yellow-900">צביעה וסימון כבישים</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 780 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="px-3 py-2.5 text-right font-medium" style={{ minWidth: 160 }}>פריט</th>
              <th className="px-2 py-2.5 text-center font-medium w-10">יח׳</th>
              <th className="px-2 py-2.5 text-center font-medium w-14">לבן</th>
              <th className="px-2 py-2.5 text-center font-medium w-14">כתום</th>
              <th className="px-2 py-2.5 text-center font-medium w-14">צהוב</th>
              <th className="px-2 py-2.5 text-center font-medium w-14">שחור</th>
              <th className="px-2 py-2.5 text-center font-medium w-16">קירוצף</th>
              <th className="px-2 py-2.5 text-center font-medium w-16">כדוריות</th>
              <th className="px-2 py-2.5 text-center font-medium w-16">מידה</th>
              <th className="px-3 py-2.5 text-right font-medium">הערות</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className={`border-b border-gray-100 ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                <td className="px-3 py-2 font-medium text-gray-800 text-sm">{item.name}</td>
                <td className="px-2 py-2 text-center text-xs text-gray-400">{item.unit}</td>
                {(["white", "orange", "yellow", "black"] as const).map((col) => (
                  <td key={col} className="px-1 py-2 text-center">
                    <input type="number" min="0" value={item[col]} onChange={(e) => upd(item.id, { [col]: e.target.value })} disabled={disabled} className={numCls} />
                  </td>
                ))}
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" checked={item.retroReflective} onChange={(e) => upd(item.id, { retroReflective: e.target.checked })} disabled={disabled} className="w-4 h-4 accent-blue-600" />
                </td>
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" checked={item.beads} onChange={(e) => upd(item.id, { beads: e.target.checked })} disabled={disabled} className="w-4 h-4 accent-blue-600" />
                </td>
                <td className="px-1 py-2">
                  <input type="text" value={item.size} onChange={(e) => upd(item.id, { size: e.target.value })} disabled={disabled} className={numCls} />
                </td>
                <td className="px-2 py-2">
                  <input type="text" value={item.notes} onChange={(e) => upd(item.id, { notes: e.target.value })} disabled={disabled} className={txtCls} placeholder="הערה" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

### Task 9: PolesSignsTab — Tab 3

**Files:**
- Create: `src/components/WorkDiary/PolesSignsTab.tsx`

- [ ] **Step 1: Create poles & signs tab**

```tsx
// src/components/WorkDiary/PolesSignsTab.tsx
"use client";

import { nanoid } from "nanoid";
import type { PoleItem, SignItem } from "@/types/workDiary";

const numCls = "w-12 px-1 py-1 text-center text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white";
const txtCls = "w-full px-2 py-1 text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white";

function updatePole(items: PoleItem[], id: string, p: Partial<PoleItem>) {
  return items.map((i) => i.id === id ? { ...i, ...p } : i);
}
function updateSign(items: SignItem[], id: string, p: Partial<SignItem>) {
  return items.map((i) => i.id === id ? { ...i, ...p } : i);
}

interface Props {
  poleItems: PoleItem[];
  signItems: SignItem[];
  onPolesChange: (items: PoleItem[]) => void;
  onSignsChange: (items: SignItem[]) => void;
  disabled?: boolean;
}

export function PolesSignsTab({ poleItems, signItems, onPolesChange, onSignsChange, disabled = false }: Props) {
  function addPole() {
    onPolesChange([...poleItems, { id: nanoid(), name: "", unit: "יח׳", isCustom: true, out: "", supply: "", install: "", dismantle: "", move: "", straighten: "", returned: "", size: "", notes: "" }]);
  }

  const updP = (id: string, p: Partial<PoleItem>) => onPolesChange(updatePole(poleItems, id, p));
  const updS = (id: string, p: Partial<SignItem>) => onSignsChange(updateSign(signItems, id, p));

  return (
    <div className="space-y-6">
      {/* POLES */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 bg-blue-50 border-b border-blue-100">
          <h2 className="text-base font-bold text-blue-900">עמודים</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="px-3 py-2.5 text-right font-medium" style={{ minWidth: 150 }}>פריט</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">יצא</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">אספקה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">התקנה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">פירוק</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">העתקה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">יישור</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">חזר</th>
                <th className="px-2 py-2.5 text-center font-medium w-16">מידה</th>
                <th className="px-3 py-2.5 text-right font-medium">הערות</th>
              </tr>
            </thead>
            <tbody>
              {poleItems.map((item, idx) => (
                <tr key={item.id} className={`border-b border-gray-100 ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                  <td className="px-3 py-2">
                    {item.isCustom
                      ? <input type="text" value={item.name} onChange={(e) => updP(item.id, { name: e.target.value })} disabled={disabled} className={txtCls} placeholder="שם פריט" />
                      : <span className="font-medium text-gray-800">{item.name}</span>}
                  </td>
                  {(["out", "supply", "install", "dismantle", "move", "straighten", "returned"] as const).map((col) => (
                    <td key={col} className="px-1 py-2 text-center">
                      <input type="number" min="0" value={item[col]} onChange={(e) => updP(item.id, { [col]: e.target.value })} disabled={disabled} className={numCls} />
                    </td>
                  ))}
                  <td className="px-1 py-2">
                    <input type="text" value={item.size} onChange={(e) => updP(item.id, { size: e.target.value })} disabled={disabled} className={numCls} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="text" value={item.notes} onChange={(e) => updP(item.id, { notes: e.target.value })} disabled={disabled} className={txtCls} placeholder="הערה" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!disabled && (
          <div className="flex justify-end px-5 py-3">
            <button type="button" onClick={addPole} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-blue-400 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors">
              + הוסף שורה
            </button>
          </div>
        )}
      </div>

      {/* SIGNS */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 bg-orange-50 border-b border-orange-100">
          <h2 className="text-base font-bold text-orange-900">תמרורים</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 1050 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="px-2 py-2.5 text-center font-medium w-12">עירוני</th>
                <th className="px-2 py-2.5 text-center font-medium w-10">ב"ע</th>
                <th className="px-2 py-2.5 text-center font-medium w-10">רגיל</th>
                <th className="px-2 py-2.5 text-center font-medium w-10">ר"ע</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">יהלום</th>
                <th className="px-2 py-2.5 text-center font-medium w-10">יצא</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">אספקה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">התקנה</th>
                <th className="px-2 py-2.5 text-center font-medium w-10">פירוק</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">העתקה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">זווית</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">מסגרת</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">פרופיל</th>
                <th className="px-2 py-2.5 text-center font-medium w-14">גודל</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">סוללה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">סולרי</th>
                <th className="px-2 py-2.5 text-center font-medium w-10">חזר</th>
                <th className="px-3 py-2.5 text-right font-medium">הערות</th>
              </tr>
            </thead>
            <tbody>
              {signItems.map((item, idx) => (
                <tr key={item.id} className={`border-b border-gray-100 ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                  {(["urban", "basic", "regular", "reinforced", "diamond", "out", "supply", "install", "dismantle", "move"] as const).map((col) => (
                    <td key={col} className="px-1 py-2 text-center">
                      <input type="number" min="0" value={item[col]} onChange={(e) => updS(item.id, { [col]: e.target.value })} disabled={disabled} className={numCls} />
                    </td>
                  ))}
                  {(["angle", "frame", "profile", "signSize"] as const).map((col) => (
                    <td key={col} className="px-1 py-2">
                      <input type="text" value={item[col]} onChange={(e) => updS(item.id, { [col]: e.target.value })} disabled={disabled} className="w-12 px-1 py-1 text-center text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={item.battery} onChange={(e) => updS(item.id, { battery: e.target.checked })} disabled={disabled} className="w-4 h-4 accent-blue-600" />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={item.solar} onChange={(e) => updS(item.id, { solar: e.target.checked })} disabled={disabled} className="w-4 h-4 accent-blue-600" />
                  </td>
                  <td className="px-1 py-2 text-center">
                    <input type="number" min="0" value={item.returned} onChange={(e) => updS(item.id, { returned: e.target.value })} disabled={disabled} className={numCls} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="text" value={item.notes} onChange={(e) => updS(item.id, { notes: e.target.value })} disabled={disabled} className={txtCls} placeholder="הערה" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 10: DocumentTab — Tab 4

**Files:**
- Create: `src/components/WorkDiary/DocumentTab.tsx`

- [ ] **Step 1: Create documentation tab**

```tsx
// src/components/WorkDiary/DocumentTab.tsx
"use client";

import { useCallback } from "react";
import type { WorkDiary, DiarySignature, DiaryPhoto } from "@/types/workDiary";
import { SignatureCanvas } from "./SignatureCanvas";
import { PhotoUpload } from "./PhotoUpload";

const inputCls = "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400";

interface Props {
  diary: WorkDiary;
  onChange: (partial: Partial<WorkDiary>) => void;
  disabled?: boolean;
}

function SignatureBlock({
  title,
  sig,
  onChange,
  disabled,
}: {
  title: string;
  sig: DiarySignature | null;
  onChange: (sig: DiarySignature) => void;
  disabled: boolean;
}) {
  const current: DiarySignature = sig ?? { signerName: "", signerRole: "", signerEmail: "", location: "", signedAt: "", dataUrl: "" };

  function upd(partial: Partial<DiarySignature>) {
    onChange({ ...current, ...partial });
  }

  function handleSign() {
    const now = new Date().toISOString();
    upd({ signedAt: now });
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => upd({ signedAt: now, location: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` }),
        () => {}
      );
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <h3 className="text-sm font-bold text-gray-700">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">שם מלא *</label>
          <input type="text" value={current.signerName} onChange={(e) => upd({ signerName: e.target.value })} disabled={disabled} className={inputCls} placeholder="שם החותם" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">תפקיד</label>
          <input type="text" value={current.signerRole} onChange={(e) => upd({ signerRole: e.target.value })} disabled={disabled} className={inputCls} placeholder="תפקיד" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">מייל (לקבלת עותק)</label>
          <input type="email" value={current.signerEmail} onChange={(e) => upd({ signerEmail: e.target.value })} disabled={disabled} className={inputCls} placeholder="example@email.com" dir="ltr" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">מיקום</label>
          <input type="text" value={current.location} onChange={(e) => upd({ location: e.target.value })} disabled={disabled} className={inputCls} placeholder="מיקום (מולא אוטומטי בחתימה)" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-600">חתימה</label>
          {!disabled && (
            <button type="button" onClick={handleSign} className="text-xs text-blue-600 underline hover:text-blue-800">
              סמן זמן ומיקום אוטומטי
            </button>
          )}
        </div>
        <SignatureCanvas value={current.dataUrl} onChange={(dataUrl) => upd({ dataUrl })} disabled={disabled} />
        {current.signedAt && (
          <p className="text-xs text-gray-400 mt-1">
            נחתם: {new Date(current.signedAt).toLocaleString("he-IL")}
            {current.location && ` | ${current.location}`}
          </p>
        )}
      </div>
    </div>
  );
}

export function DocumentTab({ diary, onChange, disabled = false }: Props) {
  const handlePhotos = useCallback(
    (photos: DiaryPhoto[]) => onChange({ photos }),
    [onChange]
  );

  return (
    <div className="space-y-6">
      {/* Photos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">תמונות מהשטח</h3>
        <PhotoUpload photos={diary.photos} onChange={handlePhotos} disabled={disabled} />
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">הערות כלליות</h3>
        <textarea
          value={diary.generalNotes}
          onChange={(e) => onChange({ generalNotes: e.target.value })}
          disabled={disabled}
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 resize-none"
          placeholder="הערות, תצפיות, מידע נוסף..."
        />
      </div>

      {/* Signatures */}
      <SignatureBlock
        title="חתימת קבלן / מפקח"
        sig={diary.customerSignature}
        onChange={(sig) => onChange({ customerSignature: sig })}
        disabled={disabled}
      />
      <SignatureBlock
        title="חתימת ראש צוות"
        sig={diary.companySignature}
        onChange={(sig) => onChange({ companySignature: sig })}
        disabled={disabled}
      />
    </div>
  );
}
```

---

### Task 11: DiaryActions — fixed bottom bar

**Files:**
- Create: `src/components/WorkDiary/DiaryActions.tsx`

- [ ] **Step 1: Create actions bar**

```tsx
// src/components/WorkDiary/DiaryActions.tsx
"use client";

interface Props {
  status: "draft" | "submitted";
  diaryNumber: string;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onExportPDF: () => void;
  onEmail: () => void;
  saving?: boolean;
  exporting?: boolean;
}

export function DiaryActions({ status, diaryNumber, onSaveDraft, onSubmit, onExportPDF, onEmail, saving, exporting }: Props) {
  const isSubmitted = status === "submitted";

  return (
    <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-2 no-print z-10 shadow-md">
      <span className="text-xs text-gray-400 shrink-0">{diaryNumber}</span>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {!isSubmitted && (
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {saving ? "שומר..." : "שמור טיוטה"}
          </button>
        )}
        <button
          type="button"
          onClick={onExportPDF}
          disabled={exporting}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-blue-400 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          {exporting ? "מייצא..." : "ייצוא PDF"}
        </button>
        <button
          type="button"
          onClick={onEmail}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
          </svg>
          שלח במייל
        </button>
        {!isSubmitted && (
          <button
            type="button"
            onClick={onSubmit}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            שלח יומן
          </button>
        )}
        {isSubmitted && (
          <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-sm font-medium">
            נשלח
          </span>
        )}
      </div>
    </div>
  );
}
```

---

### Task 12: PDF Document

**Files:**
- Create: `src/components/pdf/WorkDiaryDocument.tsx`
- Create: `src/lib/workDiaryExport.ts`

- [ ] **Step 1: Create PDF document**

```tsx
// src/components/pdf/WorkDiaryDocument.tsx
import { Document, Font, Page, StyleSheet, Text, View, Image } from "@react-pdf/renderer";
import type { WorkDiary } from "@/types/workDiary";

Font.register({
  family: "Heebo",
  fonts: [
    { src: "/fonts/Heebo-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Heebo-Bold.ttf", fontWeight: 700 },
  ],
});

const s = StyleSheet.create({
  page: { fontFamily: "Heebo", fontSize: 9, padding: 24, direction: "rtl" },
  header: { textAlign: "center", marginBottom: 12, borderBottom: "1 solid #e5e7eb", paddingBottom: 8 },
  company: { fontSize: 13, fontWeight: 700 },
  title: { fontSize: 11, fontWeight: 700, marginTop: 4 },
  diaryNum: { fontSize: 10, color: "#6b7280", marginTop: 2 },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4, backgroundColor: "#f3f4f6", padding: "3 6" },
  row: { flexDirection: "row-reverse", marginBottom: 3, flexWrap: "wrap" },
  field: { width: "33%", textAlign: "right" },
  label: { fontSize: 7, color: "#6b7280" },
  value: { fontSize: 9, fontWeight: 700 },
  table: { borderTop: "1 solid #e5e7eb", borderRight: "1 solid #e5e7eb" },
  tableRow: { flexDirection: "row-reverse", borderBottom: "1 solid #e5e7eb" },
  th: { borderLeft: "1 solid #e5e7eb", padding: "2 4", backgroundColor: "#f9fafb", fontSize: 7, fontWeight: 700, textAlign: "center" },
  td: { borderLeft: "1 solid #e5e7eb", padding: "2 4", fontSize: 8, textAlign: "center" },
  tdName: { borderLeft: "1 solid #e5e7eb", padding: "2 6", fontSize: 8, textAlign: "right" },
  sigBlock: { flexDirection: "row-reverse", gap: 16, marginTop: 8 },
  sigBox: { flex: 1, borderTop: "1 solid #d1d5db", paddingTop: 6 },
  sigLabel: { fontSize: 8, color: "#6b7280", marginBottom: 4 },
  sigName: { fontSize: 9, fontWeight: 700 },
  sigMeta: { fontSize: 7, color: "#9ca3af", marginTop: 2 },
  photoGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 6 },
  photoImg: { width: 120, height: 90, objectFit: "cover" },
  photoCaption: { fontSize: 7, color: "#6b7280", marginTop: 2, textAlign: "center", width: 120 },
});

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function FieldPair({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || "—"}</Text>
    </View>
  );
}

export function WorkDiaryDocument({ diary }: { diary: WorkDiary }) {
  const hasAnyPainting = diary.paintingItems.some((i) => i.white || i.orange || i.yellow || i.black);
  const hasAnyPoles = diary.poleItems.some((i) => i.name || i.supply || i.install);
  const hasAnySigns = diary.signItems.some((i) => i.urban || i.basic || i.regular || i.reinforced || i.diamond || i.supply || i.install);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.company}>אלקיים סימון כבישים בע"מ</Text>
          <Text style={s.title}>יומן עבודה מס׳ {diary.diaryNumber}</Text>
          <Text style={s.diaryNum}>תאריך: {formatDate(diary.executionDate)}</Text>
        </View>

        {/* Project details */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>פרטי הפרויקט</Text>
          <View style={s.row}>
            <FieldPair label="שם הקבלן" value={diary.customerName} />
            <FieldPair label="אתר העבודה" value={diary.siteName} />
            <FieldPair label="איש קשר" value={diary.contactName} />
            <FieldPair label="טלפון" value={diary.contactPhone} />
            <FieldPair label="תאריך ביצוע" value={formatDate(diary.executionDate)} />
            <FieldPair label="שעת תחילה" value={diary.startTime} />
            <FieldPair label="שעת סיום" value={diary.endTime} />
            <FieldPair label="רכב מס׳" value={diary.vehicleNumber} />
            <FieldPair label="נגרר מס׳" value={diary.trailerNumber} />
            <FieldPair label="שם הנהג" value={diary.driverName} />
            <FieldPair label="ראש צוות" value={diary.crewLeaderName} />
            {diary.crewMembers.filter(Boolean).map((m, i) => (
              <FieldPair key={i} label={`איש צוות ${i + 1}`} value={m} />
            ))}
          </View>
        </View>

        {/* Painting table */}
        {hasAnyPainting && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>צביעה וסימון כבישים</Text>
            <View style={s.table}>
              <View style={s.tableRow}>
                {["פריט", "יח׳", "לבן", "כתום", "צהוב", "שחור", "קירוצף", "כדוריות", "מידה", "הערות"].map((h) => (
                  <View key={h} style={[s.th, { flex: h === "פריט" || h === "הערות" ? 2 : 1 }]}><Text>{h}</Text></View>
                ))}
              </View>
              {diary.paintingItems.filter((i) => i.white || i.orange || i.yellow || i.black || i.retroReflective || i.beads).map((item) => (
                <View key={item.id} style={s.tableRow}>
                  <View style={[s.tdName, { flex: 2 }]}><Text>{item.name}</Text></View>
                  <View style={[s.td, { flex: 1 }]}><Text>{item.unit}</Text></View>
                  <View style={[s.td, { flex: 1 }]}><Text>{item.white || ""}</Text></View>
                  <View style={[s.td, { flex: 1 }]}><Text>{item.orange || ""}</Text></View>
                  <View style={[s.td, { flex: 1 }]}><Text>{item.yellow || ""}</Text></View>
                  <View style={[s.td, { flex: 1 }]}><Text>{item.black || ""}</Text></View>
                  <View style={[s.td, { flex: 1 }]}><Text>{item.retroReflective ? "✓" : ""}</Text></View>
                  <View style={[s.td, { flex: 1 }]}><Text>{item.beads ? "✓" : ""}</Text></View>
                  <View style={[s.td, { flex: 1 }]}><Text>{item.size || ""}</Text></View>
                  <View style={[s.tdName, { flex: 2 }]}><Text>{item.notes || ""}</Text></View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Poles table */}
        {hasAnyPoles && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>עמודים</Text>
            <View style={s.table}>
              <View style={s.tableRow}>
                {["פריט", "יצא", "אספקה", "התקנה", "פירוק", "העתקה", "יישור", "חזר", "מידה"].map((h) => (
                  <View key={h} style={[s.th, { flex: h === "פריט" ? 2 : 1 }]}><Text>{h}</Text></View>
                ))}
              </View>
              {diary.poleItems.filter((i) => i.name).map((item) => (
                <View key={item.id} style={s.tableRow}>
                  <View style={[s.tdName, { flex: 2 }]}><Text>{item.name}</Text></View>
                  {(["out", "supply", "install", "dismantle", "move", "straighten", "returned", "size"] as const).map((c) => (
                    <View key={c} style={[s.td, { flex: 1 }]}><Text>{item[c] || ""}</Text></View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Signs table */}
        {hasAnySigns && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>תמרורים</Text>
            <View style={s.table}>
              <View style={s.tableRow}>
                {["עירוני", "ב\"ע", "רגיל", "ר\"ע", "יהלום", "יצא", "אספקה", "התקנה", "פירוק", "העתקה", "זווית", "מסגרת", "פרופיל", "גודל", "סוללה", "סולרי", "חזר"].map((h) => (
                  <View key={h} style={[s.th, { flex: 1 }]}><Text>{h}</Text></View>
                ))}
              </View>
              {diary.signItems.filter((i) => i.urban || i.basic || i.regular || i.reinforced || i.diamond || i.supply || i.install).map((item) => (
                <View key={item.id} style={s.tableRow}>
                  {(["urban", "basic", "regular", "reinforced", "diamond", "out", "supply", "install", "dismantle", "move", "angle", "frame", "profile", "signSize"] as const).map((c) => (
                    <View key={c} style={[s.td, { flex: 1 }]}><Text>{item[c] || ""}</Text></View>
                  ))}
                  <View style={[s.td, { flex: 1 }]}><Text>{item.battery ? "✓" : ""}</Text></View>
                  <View style={[s.td, { flex: 1 }]}><Text>{item.solar ? "✓" : ""}</Text></View>
                  <View style={[s.td, { flex: 1 }]}><Text>{item.returned || ""}</Text></View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        {diary.generalNotes && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>הערות כלליות</Text>
            <Text style={{ fontSize: 9, padding: "4 6" }}>{diary.generalNotes}</Text>
          </View>
        )}

        {/* Signatures */}
        <View style={s.sigBlock}>
          {[
            { label: "חתימת קבלן / מפקח", sig: diary.customerSignature },
            { label: "חתימת ראש צוות", sig: diary.companySignature },
          ].map(({ label, sig }) => (
            <View key={label} style={s.sigBox}>
              <Text style={s.sigLabel}>{label}</Text>
              {sig?.dataUrl ? (
                <Image src={sig.dataUrl} style={{ width: 160, height: 48, objectFit: "contain" }} />
              ) : (
                <View style={{ height: 48, borderBottom: "1 solid #d1d5db" }} />
              )}
              {sig?.signerName && <Text style={s.sigName}>{sig.signerName}</Text>}
              {sig?.signedAt && <Text style={s.sigMeta}>{new Date(sig.signedAt).toLocaleString("he-IL")}</Text>}
              {sig?.location && <Text style={s.sigMeta}>{sig.location}</Text>}
            </View>
          ))}
        </View>

        {/* Photos */}
        {diary.photos.length > 0 && (
          <View style={[s.section, { marginTop: 12 }]}>
            <Text style={s.sectionTitle}>תמונות מהשטח</Text>
            <View style={s.photoGrid}>
              {diary.photos.map((photo) => (
                <View key={photo.id}>
                  <Image src={photo.dataUrl} style={s.photoImg} />
                  {photo.caption && <Text style={s.photoCaption}>{photo.caption}</Text>}
                </View>
              ))}
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Create export helper**

```typescript
// src/lib/workDiaryExport.ts
import type { WorkDiary } from "@/types/workDiary";

export async function exportWorkDiaryPDF(diary: WorkDiary): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { WorkDiaryDocument } = await import("@/components/pdf/WorkDiaryDocument");
  const { createElement } = await import("react");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(createElement(WorkDiaryDocument, { diary }) as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `יומן_עבודה_${diary.diaryNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openEmailDraft(diary: WorkDiary): void {
  const subject = encodeURIComponent(`יומן עבודה ${diary.diaryNumber} — ${diary.customerName}`);
  const body = encodeURIComponent(
    `שלום,\n\nמצורף יומן עבודה מס׳ ${diary.diaryNumber}.\n\nפרטים:\n` +
    `לקוח: ${diary.customerName}\n` +
    `אתר: ${diary.siteName}\n` +
    `תאריך: ${diary.executionDate}\n` +
    `שעות: ${diary.startTime} — ${diary.endTime}\n\n` +
    `אלקיים סימון כבישים בע"מ`
  );
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}
```

---

### Task 13: Main WorkDiary form component

**Files:**
- Create: `src/components/WorkDiary/index.tsx`

- [ ] **Step 1: Create root form**

```tsx
// src/components/WorkDiary/index.tsx
"use client";

import { useState, useCallback } from "react";
import { useWorkDiaryContext } from "@/context/WorkDiaryContext";
import type { WorkDiary } from "@/types/workDiary";
import { TabBar, type DiaryTab } from "./TabBar";
import { DiaryHeader } from "./DiaryHeader";
import { PaintingTab } from "./PaintingTab";
import { PolesSignsTab } from "./PolesSignsTab";
import { DocumentTab } from "./DocumentTab";
import { DiaryActions } from "./DiaryActions";
import { exportWorkDiaryPDF, openEmailDraft } from "@/lib/workDiaryExport";

function DiaryIcon() {
  return (
    <svg className="w-8 h-8 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function WorkDiaryForm() {
  const { createDiary, saveDiary, submitDiary } = useWorkDiaryContext();
  const [diary, setDiary] = useState<WorkDiary | null>(null);
  const [activeTab, setActiveTab] = useState<DiaryTab>("header");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleNew() {
    const d = createDiary();
    setDiary(d);
    setActiveTab("header");
    setSuccessMessage(null);
  }

  const handleChange = useCallback((partial: Partial<WorkDiary>) => {
    setDiary((prev) => prev ? { ...prev, ...partial } : prev);
  }, []);

  function handleSaveDraft() {
    if (!diary) return;
    setSaving(true);
    saveDiary(diary);
    setTimeout(() => setSaving(false), 600);
  }

  function handleSubmit() {
    if (!diary) return;
    if (!diary.customerName || !diary.siteName || !diary.executionDate) {
      alert("נא למלא שם קבלן, אתר עבודה ותאריך ביצוע לפני השליחה.");
      setActiveTab("header");
      return;
    }
    saveDiary(diary);
    submitDiary(diary.id);
    setDiary((prev) => prev ? { ...prev, status: "submitted", submittedAt: new Date().toISOString() } : prev);
    setSuccessMessage(`יומן עבודה ${diary.diaryNumber} נשלח בהצלחה ותויק בהנהלת חשבונות.`);
  }

  async function handleExportPDF() {
    if (!diary) return;
    setExporting(true);
    try {
      await exportWorkDiaryPDF(diary);
    } finally {
      setExporting(false);
    }
  }

  function handleEmail() {
    if (!diary) return;
    handleExportPDF().then(() => openEmailDraft(diary));
  }

  // Landing screen
  if (!diary) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="flex justify-center mb-4">
            <DiaryIcon />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">יומן עבודה</h1>
          <p className="text-sm text-gray-500 mb-8">תיעוד דיגיטלי של עבודת שטח — כמויות, צוות, חתימות ותמונות</p>
          <button
            type="button"
            onClick={handleNew}
            className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-colors shadow-sm"
          >
            + יומן עבודה חדש
          </button>
        </div>
      </div>
    );
  }

  const disabled = diary.status === "submitted";

  return (
    <div className="min-h-screen bg-[#f0f2f5] pb-24">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 no-print">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <DiaryIcon />
          <div>
            <h1 className="text-xl font-bold text-gray-900">יומן עבודה</h1>
            <p className="text-xs text-gray-400">{diary.diaryNumber} · {diary.executionDate}</p>
          </div>
          {successMessage && (
            <div className="mr-auto bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">
              {successMessage}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto">
        <TabBar active={activeTab} onChange={setActiveTab} />

        <div className="p-4">
          {activeTab === "header" && (
            <DiaryHeader diary={diary} onChange={handleChange} disabled={disabled} />
          )}
          {activeTab === "painting" && (
            <PaintingTab items={diary.paintingItems} onChange={(paintingItems) => handleChange({ paintingItems })} disabled={disabled} />
          )}
          {activeTab === "poles" && (
            <PolesSignsTab
              poleItems={diary.poleItems}
              signItems={diary.signItems}
              onPolesChange={(poleItems) => handleChange({ poleItems })}
              onSignsChange={(signItems) => handleChange({ signItems })}
              disabled={disabled}
            />
          )}
          {activeTab === "docs" && (
            <DocumentTab diary={diary} onChange={handleChange} disabled={disabled} />
          )}
        </div>
      </div>

      <DiaryActions
        status={diary.status}
        diaryNumber={diary.diaryNumber}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmit}
        onExportPDF={handleExportPDF}
        onEmail={handleEmail}
        saving={saving}
        exporting={exporting}
      />
    </div>
  );
}
```

---

### Task 14: Page file + Sidebar + Layout updates

**Files:**
- Create: `src/app/work-diary/page.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create page**

```tsx
// src/app/work-diary/page.tsx
import { WorkDiaryForm } from "@/components/WorkDiary/index";

export default function WorkDiaryPage() {
  return <WorkDiaryForm />;
}
```

- [ ] **Step 2: Add sidebar link**

In `src/components/Sidebar.tsx`, add a `DiaryIcon` function and a new `SidebarLink` after "טבלת הזמנות":

```tsx
function DiaryIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
```

Add in nav:
```tsx
<SidebarLink href="/work-diary" label="יומן עבודה" active={pathname.startsWith("/work-diary")} icon={<DiaryIcon />} />
```

- [ ] **Step 3: Wrap layout with WorkDiaryProvider**

In `src/app/layout.tsx`:
```tsx
import { WorkDiaryProvider } from "@/components/WorkDiaryProvider";
// wrap:
<CatalogProvider><OrdersProvider><WorkDiaryProvider>{children}</WorkDiaryProvider></OrdersProvider></CatalogProvider>
```

---

### Task 15: Accounting integration — יומני עבודה tab

**Files:**
- Modify: `src/components/Accounting/index.tsx`

- [ ] **Step 1: Add work diary tab to accounting**

At the top of `AccountingPage` function, add tab state and import. Add a tab switcher header and a work diary list section. Full details in the implementation — add `activeTab` state, two tab buttons "הזמנות" / "יומני עבודה", and render the diary list when the diary tab is active.

The diary table shows: מס׳ יומן | קבלן | אתר | תאריך | שעות | סטטוס | PDF
Filter by: לקוח / תאריך

---

### Task 16: Final verification

- [ ] Open `/work-diary` — landing screen shows
- [ ] Click "יומן חדש" — form opens at Tab 1
- [ ] Fill header fields — navigate to Tab 2
- [ ] Tab 2 shows painting table with 13 rows
- [ ] Tab 3 shows poles + signs tables, can add pole row
- [ ] Tab 4 — upload photo, draw signature, mark time/GPS
- [ ] "שמור טיוטה" — refresh page — go to `/work-diary` — click new, data for previous diary is in accounting
- [ ] "שלח יומן" validates customerName + siteName + executionDate
- [ ] After submit, form is read-only
- [ ] "ייצוא PDF" downloads a PDF with all filled data
- [ ] "שלח במייל" opens email client with pre-filled subject/body
- [ ] `/accounting` shows "יומני עבודה" tab with submitted diary
- [ ] Sidebar shows יומן עבודה link, highlights when active
- [ ] Existing modules (orders, catalog, customers, graphics, accounting) all still work
