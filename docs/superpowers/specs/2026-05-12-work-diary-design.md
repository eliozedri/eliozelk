# יומן עבודה — מסמך עיצוב

**תאריך:** 2026-05-12  
**פרויקט:** אלקיים סימון כבישים — מערכת ניהול פנימית  
**מודול:** יומן עבודה (Work Diary)

---

## מטרה

המרת יומן העבודה הפיזי (נייר) של החברה למודול דיגיטלי מלא בתוך המערכת הקיימת. היומן משמש לתיעוד עבודת שטח יומית — כמויות, רכב, צוות, חתימות ותמונות — ועובר לאחר מכן להנהלת חשבונות לצורך חיוב חודשי לפי לקוח.

---

## עקרונות מנחים

- הטופס תמיד נקי ומוכן למילוי — בדיוק כמו טופס ההזמנה הקיים ב-`/`
- אין קישור לפריטים קיימים (לקוחות/הזמנות) — יומן עצמאי לחלוטין
- נתונים לא אובדים לאחר רענון — localStorage עם hydration guard
- פריסה RTL עברית מלאה בכל הממשק

---

## ארכיטקטורה כללית

### דף `/work-diary`
- הטופס הראשי, תמיד נקי
- לאחר שליחה: הודעת הצלחה + מספר יומן
- היומנים השמורים נגישים מהנהלת חשבונות

### הנהלת חשבונות `/accounting`
- טאב נוסף: **יומני עבודה** לצד ההזמנות הקיימות
- רשימת יומנים שנשלחו: מס׳ יומן | קבלן | אתר | תאריך | שעות | סטטוס | PDF

---

## ניווט — Sidebar

הוספת קישור חדש בסרגל הצד:

```
יומן עבודה  [icon: BookOpen]  →  /work-diary
```

מיקום: בין "טבלת הזמנות" ל"מוצרים ושירותים".

---

## מבנה הטאבים

### טאב 1 — פרטי עבודה

| שדה | סוג | הערות |
|-----|-----|-------|
| שם הקבלן | text | חובה |
| אתר העבודה | text | חובה |
| איש קשר | text | |
| טלפון | tel | |
| תאריך ביצוע | date | ברירת מחדל: היום |
| שעת תחילה | time | |
| שעת סיום | time | |
| רכב מס׳ | text | |
| נגרר מס׳ | text | |
| שם הנהג | text | |
| ראש צוות | text | |
| אנשי צוות 1–4 | text × 4 | |

### טאב 2 — צביעה

טבלה עם שורות קבועות. עמודות:

| עמודה | תיאור |
|-------|-------|
| צביעה | שם הפריט (קריאה בלבד) |
| לבן | כמות |
| כתום | כמות |
| צהוב | כמות |
| שחור | כמות |
| קירוצף | checkbox |
| כדוריות | checkbox |
| מידה | text |
| הערות | text |

**שורות קבועות (מ-seed):**
1. פס ניתוב 15-10 ס"מ — מ"א
2. חנייות ברוחב 15-10 ס"מ — מ"א
3. קוביות ברוחב 30 ס"מ — מ"א
4. אבני שפה — מ"ר
5. מעברי חצייה — מ"ר
6. משטחים בכחול — מ"ר
7. אי תנועה — מ"ר
8. פס עצירה — מ"ר
9. פס האטה — מ"ר
10. חץ בודד — יח׳
11. חץ כפול — יח׳
12. חץ משולש — יח׳
13. ד-16 — יח׳

### טאב 3 — עמודים ותמרורים

**תת-טבלה א׳: עמודים**

שורות קבועות + שורות פתוחות להוספה:
- מגולוון 1.50 מ"א
- מגולוון 3.00 מ"א
- מגולוון 3.50 מ"א
- מערכת חיבור
- + עד 4 שורות ידניות

עמודות: יצא | אספקה | התקנה | פירוק | העתקה | יישור | חזר | מידה | הערות

**תת-טבלה ב׳: תמרורים**

10 שורות פתוחות (פנס).

עמודות:
- סוג: עירוני | ב"ע | רגיל | ר"ע | יהלום
- פעולות: יצא | אספקה | התקנה | פירוק | העתקה | חזר
- מאפיינים: זווית | מסגרת | פרופיל | גודל השלט
- תאורה: סוללה (checkbox) | סולרי (checkbox)
- הערות

### טאב 4 — תיעוד

- **תמונות**: עד 5 תמונות מהמצלמה. `<input capture="environment">` → FileReader → compress ל-800px max → base64
- **הערות כלליות**: textarea חופשי
- **חתימת קבלן/מפקח**: שם + תפקיד + מייל + מיקום (GPS אוטומטי) + canvas חתימה
- **חתימת ראש צוות**: שם + תפקיד + canvas חתימה

---

## מודל נתונים

```typescript
// src/types/workDiary.ts

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
  diaryNumber: string;        // WD-2026-001
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
```

---

## Persistence

- **Storage key:** `elkayam_work_diaries`
- **Pattern:** זהה ל-`useOrders` — useState + useEffect עם `hydrated` guard
- **תמונות:** base64 compressed, מקסימום 5 תמונות (מניעת overflow של localStorage)
- **hook:** `src/hooks/useWorkDiaries.ts`
- **context:** `src/context/WorkDiaryContext.tsx` + `WorkDiaryProvider`
- **layout:** הוספת `WorkDiaryProvider` ב-`src/app/layout.tsx`

---

## מספור יומנים

פורמט: `WD-{שנה}-{ספרור 3 ספרות}`  
דוגמה: `WD-2026-001`  
לוגיקה: זהה לפונקציה `generateOrderNumber` הקיימת.

---

## סטטוסים

| סטטוס | תיאור |
|-------|-------|
| `draft` | טיוטה — ניתן לעריכה |
| `submitted` | נשלח — קריאה בלבד, מופיע בהנהלת חשבונות |

---

## חתימה דיגיטלית

- רכיב `SignatureCanvas` — HTML Canvas עם אירועי `touch` ו-`mouse`
- אין ספריה חיצונית
- כפתורים: "חתום" (GPS + שעה אוטומטיים) | "נקה"
- נשמרת כ-`dataUrl` (PNG base64) בתוך `DiarySignature`

---

## תמונות

- `<input type="file" accept="image/*" capture="environment">`
- FileReader → יצירת Image element → ציור על Canvas 800px → `toDataURL('image/jpeg', 0.7)`
- הצגת thumbnails עם כפתור מחיקה
- מקסימום 5 תמונות
- שדה caption אופציונלי לכל תמונה

---

## GPS

```typescript
navigator.geolocation.getCurrentPosition(
  (pos) => setLocation(`${pos.coords.latitude}, ${pos.coords.longitude}`),
  () => setLocation("מיקום לא זמין")
);
```

נקרא בלחיצה על "חתום". מילוי אוטומטי של שדה `location` ב-`DiarySignature`.

---

## ייצוא PDF

- **ספריה:** `@react-pdf/renderer` (קיימת)
- **פונט:** Heebo, RTL — זהה ל-`OrderDocument`
- **רכיב:** `src/components/pdf/WorkDiaryDocument.tsx`
- **תוכן:** כותרת חברה → פרטי עבודה → טבלת צביעה → טבלת עמודים → טבלת תמרורים → הערות → חתימות → נספח תמונות
- **ייצוא:** `src/lib/workDiaryExport.ts` — זהה ל-`pdfExport.ts`

---

## שליחה במייל

1. PDF נוצר ומוריד אוטומטית
2. נפתח `mailto:` עם כותרת: `יומן עבודה ${diaryNumber} — ${customerName}`
3. גוף המייל כולל תקציר טקסטואלי של הפרטים הראשיים
4. המשתמש מצרף את ה-PDF שהורד ידנית ושולח

---

## הנהלת חשבונות — שילוב

ב-`src/components/Accounting/index.tsx`:
- הוספת state: `activeTab: "orders" | "work-diaries"`
- כפתורי טאב בחלק העליון
- תחת "יומני עבודה": טבלת יומנים שהוגשו עם סינון לפי תאריך/קבלן/אתר + ייצוא PDF

---

## קבצים

### חדשים
```
src/types/workDiary.ts
src/hooks/useWorkDiaries.ts
src/context/WorkDiaryContext.tsx
src/components/WorkDiaryProvider.tsx
src/components/WorkDiary/index.tsx
src/components/WorkDiary/DiaryHeader.tsx
src/components/WorkDiary/PaintingTab.tsx
src/components/WorkDiary/PolesSignsTab.tsx
src/components/WorkDiary/DocumentTab.tsx
src/components/WorkDiary/SignatureCanvas.tsx
src/components/WorkDiary/PhotoUpload.tsx
src/components/WorkDiary/DiaryActions.tsx
src/components/WorkDiary/TabBar.tsx
src/components/pdf/WorkDiaryDocument.tsx
src/lib/workDiaryExport.ts
src/app/work-diary/page.tsx
```

### משתנים
```
src/components/Sidebar.tsx
src/app/layout.tsx
src/components/Accounting/index.tsx
```

---

## הנחות

- localStorage מספיק לגרסה ראשונה. גרסה עתידית תעבור ל-backend/Supabase.
- אין auth — אין שמירה של "מי יצר". ניתן להוסיף בגרסה עתידית.
- 5 תמונות מקסימום מספיק לעבודת שטח יומית טיפוסית.
- Canvas חתימה עובד על mobile/tablet — נבדק עם touch events.
- GPS מחייב הרשאת דפדפן — אם נדחה, שדה מיקום יהיה ריק לעריכה ידנית.

---

## שיפורים עתידיים מומלצים

1. מעבר ל-backend (Supabase) לאחסון תמונות אמיתי
2. שליחת מייל אוטומטית (Resend/SendGrid)
3. דוח חיוב חודשי אוטומטי לפי לקוח מיומני עבודה
4. חיפוש וסינון מתקדם בארכיון
5. העתקת יומן קודם כטמפלט
6. תמיכה ב-PWA / offline
