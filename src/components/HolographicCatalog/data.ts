/**
 * HOLOGRAPHIC CATALOG DATA
 *
 * The production page (HolographicCatalogPage) renders LIVE catalog data from
 * Supabase via `catalogItemsToHoloProducts` below — it does NOT use HOLO_PRODUCTS.
 *
 * HOLO_PRODUCTS is a static SAMPLE dataset kept ONLY for the /holographic-catalog
 * /design-lab visual sandbox (not linked in the app nav). It is not real data.
 *
 * IMPORTANT — inventory is NOT managed in the system yet. The live mapper never
 * fabricates stock numbers: `inventory` is left undefined and availability is
 * shown as "לא מנוהל כרגע".
 */

import type { HoloProduct, HoloSpec, HoloStatus } from "./types";
import type { CatalogItem } from "@/types/catalog";

// ── Live mapping: Supabase CatalogItem → HoloProduct ─────────────────────────

function statusFromActive(active: boolean): HoloStatus {
  return active ? "active" : "inactive";
}

export function catalogItemToHoloProduct(item: CatalogItem): HoloProduct {
  const images = (item.metadata?.images ?? {}) as { thumb?: string; full?: string };
  const imageUrl = images.full ?? images.thumb ?? "";

  const specs: HoloSpec[] = [];
  if (item.dimensionValue) {
    specs.push({
      label: "מידות",
      value: `${item.dimensionValue}${item.dimensionUnit ? " " + item.dimensionUnit : ""}`,
    });
  }
  if (item.category) specs.push({ label: "קטגוריה", value: item.category });

  return {
    id: item.id,
    title: item.name,
    category: item.category || "כללי",
    imageUrl,
    description: item.description || "",
    status: statusFromActive(item.isActive),
    unit: item.unitOfMeasure || "יחידה",
    // No live inventory module yet — do not imply stock tracking exists.
    inventoryLabel: "לא מנוהל כרגע",
    specs,
    metrics: [], // never fabricate operational numbers
    tags: item.category ? [item.category] : [],
    inventory: undefined, // no fake stock breakdown / reservations
  };
}

export function catalogItemsToHoloProducts(items: CatalogItem[]): HoloProduct[] {
  return items.map(catalogItemToHoloProduct);
}

// ── Design-lab sample data only (NOT used by the production page) ─────────────

export const HOLO_PRODUCTS: HoloProduct[] = [
  {
    id: "speed-bump",
    title: "פס האטה גומי",
    category: "אביזרי כבישים",
    imageUrl: "/catalog/transparent/speed-bump.png",
    description: "פס האטה מגומי – מחסום מהירות עמיד לשימוש חוץ ופנים. מודולרי, מתחבר בין יחידות. מתאים לחניונים, מפעלים, כניסות מבנים.",
    status: "active",
    unit: "יחידה",
    inventoryLabel: "מלאי זמין",
    specs: [
      { label: "חומר", value: "גומי ממוחזר" },
      { label: "ממדים", value: "500×350×50 מ״מ" },
      { label: "עומס מקסימלי", value: "70 טון" },
      { label: "עמידות UV", value: "כן" },
      { label: "צבע זוהר", value: "צהוב/שחור" },
    ],
    metrics: [
      { label: "מלאי שוטף", value: 158 },
      { label: "פריטים בהזמנה", value: 15 },
      { label: "ערך מוחזק", value: 19 },
      { label: "סה״כ יחידות", value: 329 },
    ],
    tags: ["Advanced Marking Solutions", "בטיחות דרכים", "גומי"],
    accentColor: "#06b6d4",
    inventory: {
      total: 158, available: 124, reserved: 22, inProduction: 19, inTransit: 15, minimum: 60,
      usagePerMonth: 38,
      reservations: [
        { orderId: "ORD-441", qty: 22, site: "כביש 6, מחלף 12", customer: "נתיבי ישראל", due: "2026-06-04" },
        { orderId: "ORD-447", qty: 12, site: "פארק מיט\"ב", customer: "עיריית פתח־תקווה", due: "2026-06-11" },
      ],
      recentMovement: { date: "2026-05-21", type: "in", qty: 24, ref: "PO #4419 · ARC Rubber" },
      nextReorder: { date: "2026-06-15", qty: 60, supplier: "ARC Rubber" },
    },
  },
  {
    id: "cat-eyes",
    title: "עיני חתול רפלקטיביות",
    category: "סימון כבישים",
    imageUrl: "/catalog/transparent/cat-eyes.png",
    description: "עיניות חתול דו-צדדיות לסימון נתיבים. פרופיל נמוך, עמידות גבוהה לגלגלים. מתאים לכבישים בין-עירוניים ועירוניים.",
    status: "active",
    unit: "יחידה",
    inventoryLabel: "מלאי זמין",
    specs: [
      { label: "חומר", value: "פוליאוריטן" },
      { label: "קוטר", value: "100 מ״מ" },
      { label: "גובה", value: "13 מ״מ" },
      { label: "רפלקטורים", value: "דו-צדדי" },
      { label: "עמידות", value: "עד 800K מעברים" },
    ],
    metrics: [
      { label: "מלאי שוטף", value: 420 },
      { label: "פריטים בהזמנה", value: 0 },
      { label: "מינימום הזמנה", value: 50 },
      { label: "סה״כ הוצב", value: 1840 },
    ],
    tags: ["סימון", "רפלקטיבי", "נתיבים"],
    accentColor: "#a78bfa",
    inventory: {
      total: 420, available: 380, reserved: 40, inProduction: 0, inTransit: 0, minimum: 100,
      usagePerMonth: 65,
      reservations: [
        { orderId: "ORD-452", qty: 40, site: "כביש 4 צפון", customer: "נתיבי ישראל", due: "2026-06-08" },
      ],
      recentMovement: { date: "2026-05-19", type: "out", qty: 60, ref: "DEL-2210" },
    },
  },
  {
    id: "cones",
    title: "קונוסים 70 ס״מ",
    category: "ציוד בטיחות שטח",
    imageUrl: "/catalog/transparent/cones.png",
    description: "קונוסים כתומים סטנדרטיים גובה 70 ס״מ. עם לולאות משקולת בבסיס. מתאים להסדרי תנועה זמניים ואזורי עבודה.",
    status: "active",
    unit: "יחידה",
    inventoryLabel: "מלאי מלא",
    specs: [
      { label: "גובה", value: "70 ס״מ" },
      { label: "בסיס", value: "35×35 ס״מ" },
      { label: "חומר", value: "PVC גמיש" },
      { label: "משקל", value: "2.1 ק״ג" },
      { label: "רפלקטיב", value: "רצועה 10 ס״מ" },
    ],
    metrics: [
      { label: "מלאי שוטף", value: 245 },
      { label: "מינימום מלאי", value: 50 },
      { label: "בהכנה לשטח", value: 40 },
      { label: "בשימוש בפועל", value: 80 },
    ],
    tags: ["הסדרי תנועה", "PVC", "שטח"],
    accentColor: "#f97316",
    inventory: {
      total: 245, available: 125, reserved: 80, inProduction: 0, inTransit: 40, minimum: 50,
      usagePerMonth: 90,
      reservations: [
        { orderId: "ORD-441", qty: 35, site: "כביש 6, מחלף 12", customer: "נתיבי ישראל", due: "2026-06-04" },
        { orderId: "ORD-447", qty: 25, site: "פארק מיט\"ב",   customer: "עיריית פתח־תקווה", due: "2026-06-11" },
        { orderId: "ORD-453", qty: 20, site: "חניון מרכזי",    customer: "צ.מ.ח. נדל\"ן",        due: "2026-06-02" },
      ],
      recentMovement: { date: "2026-05-22", type: "out", qty: 30, ref: "DEL-2218" },
    },
  },
  {
    id: "cone-sleeves",
    title: "שרוולי קונוסים",
    category: "ציוד בטיחות שטח",
    imageUrl: "/catalog/transparent/cone-sleeves.png",
    description: "שרוולים רפלקטיביים לקונוסים סטנדרטיים. מגדילים נראות בלילה ובתנאי ראות ירודה. מתאים לשרשרות קונוס ארוכות.",
    status: "active",
    unit: "יחידה",
    inventoryLabel: "מלאי זמין",
    specs: [
      { label: "חומר", value: "פוליאסטר + שכבה רפלקטיבית" },
      { label: "ממדים", value: "400×25 מ״מ" },
      { label: "ראות", value: "עד 150 מטר" },
      { label: "צבע", value: "כתום/לבן" },
    ],
    metrics: [
      { label: "מלאי שוטף", value: 380 },
      { label: "מינימום מלאי", value: 100 },
      { label: "בשימוש", value: 120 },
      { label: "להזמנה", value: 0 },
    ],
    tags: ["רפלקטיבי", "ראות לילה", "בטיחות"],
    accentColor: "#fbbf24",
    inventory: {
      total: 380, available: 260, reserved: 120, inProduction: 0, inTransit: 0, minimum: 100,
      usagePerMonth: 55,
      reservations: [
        { orderId: "ORD-441", qty: 80, site: "כביש 6, מחלף 12",  customer: "נתיבי ישראל", due: "2026-06-04" },
        { orderId: "ORD-453", qty: 40, site: "חניון מרכזי",        customer: "צ.מ.ח. נדל\"ן",  due: "2026-06-02" },
      ],
    },
  },
  {
    id: "arrow-board",
    title: "עגלת חץ LED",
    category: "הסדרי תנועה",
    imageUrl: "/catalog/transparent/arrow-board.png",
    description: "עגלת חץ LED נגררת לניתוב תנועה בעבודות כביש. לוח 15 חצים, שלט LED, גנרטור מובנה. מאושרת ת״י.",
    status: "active",
    unit: "יחידה",
    inventoryLabel: "2 יחידות זמינות",
    specs: [
      { label: "ממדים לוח", value: "2.4×1.2 מ'" },
      { label: "חצים", value: "15 LED" },
      { label: "ראות", value: "800 מ' ביום" },
      { label: "מתח", value: "12V DC" },
      { label: "הסמכה", value: "ת״י 1103" },
    ],
    metrics: [
      { label: "מלאי שוטף", value: 2 },
      { label: "בפריסה שטח", value: 1 },
      { label: "להשכרה", value: 0 },
      { label: "בתחזוקה", value: 0 },
    ],
    tags: ["LED", "הסדרי תנועה", "ת״י מאושר"],
    accentColor: "#06b6d4",
    inventory: {
      total: 2, available: 1, reserved: 1, inProduction: 0, inTransit: 0, minimum: 2,
      usagePerMonth: 1,
      reservations: [
        { orderId: "ORD-441", qty: 1, site: "כביש 6, מחלף 12", customer: "נתיבי ישראל", due: "2026-06-04" },
      ],
    },
  },
  {
    id: "sign",
    title: "תמרור T-31 עצור",
    category: "שילוט ותמרורים",
    imageUrl: "/catalog/transparent/signage.png",
    description: "תמרור עצור T-31 לפי תקן ישראלי. אלומיניום עם ציפוי רפלקטיבי דרגה 2. מתאים לצמתים וכניסות.",
    status: "active",
    unit: "יחידה",
    inventoryLabel: "מלאי זמין",
    specs: [
      { label: "חומר", value: "אלומיניום 2 מ״מ" },
      { label: "קוטר", value: "90 ס״מ" },
      { label: "ציפוי", value: "רפלקטיבי דרגה 2" },
      { label: "עמוד", value: "60×60 גלוון" },
      { label: "תקן", value: "ת״י 855" },
    ],
    metrics: [
      { label: "מלאי שוטף", value: 34 },
      { label: "בהתקנה", value: 5 },
      { label: "להחזר", value: 2 },
      { label: "סה״כ הוצב", value: 210 },
    ],
    tags: ["תמרור", "אלומיניום", "ת״י 855"],
    accentColor: "#ef4444",
    inventory: {
      total: 34, available: 27, reserved: 5, inProduction: 0, inTransit: 2, minimum: 15,
      usagePerMonth: 12,
      reservations: [
        { orderId: "ORD-449", qty: 5, site: "צומת קציר", customer: "מ.מ. קציר־חריש", due: "2026-06-09" },
      ],
    },
  },
  {
    id: "jersey-barrier",
    title: "מחסום ניו ג׳רזי",
    category: "מחסומים וגדרות",
    imageUrl: "/catalog/transparent/jersey-barrier.png",
    description: "מחסום ניו ג׳רזי בטון פרהבריקט. לחלוקת מסלולים, הגנת עובדים, ואזורי עבודה. מתחבר בין יחידות.",
    status: "active",
    unit: "יחידה",
    inventoryLabel: "4 יחידות זמינות",
    specs: [
      { label: "חומר", value: "בטון B30" },
      { label: "ממדים", value: "1.2×0.6×0.8 מ'" },
      { label: "משקל", value: "1,200 ק״ג" },
      { label: "חיבור", value: "קרס מתכת" },
      { label: "צבע", value: "אפור / צהוב פסים" },
    ],
    metrics: [
      { label: "מלאי שוטף", value: 4 },
      { label: "בפריסה שטח", value: 12 },
      { label: "בתחזוקה", value: 1 },
      { label: "סה״כ יחידות", value: 17 },
    ],
    tags: ["בטון", "מחסום", "כבד"],
    accentColor: "#64748b",
    inventory: {
      total: 4, available: 3, reserved: 1, inProduction: 0, inTransit: 0, minimum: 5,
      usagePerMonth: 2,
      reservations: [
        { orderId: "ORD-455", qty: 1, site: "אזור תעשייה צפוני", customer: "א.ג. ייזום", due: "2026-06-06" },
      ],
      nextReorder: { date: "2026-06-10", qty: 6, supplier: "בטון אחים בע\"מ" },
    },
  },
  {
    id: "marking-machine",
    title: "מכונת סימון כביש",
    category: "ציוד סימון",
    imageUrl: "/catalog/transparent/marking-machine.png",
    description: "מכונת סימון כביש בעלת מנוע גז עם מיכל לצבע קר/חם. רוחב קו: 10–40 ס״מ. מתאים לסימון נתיבים, חניות, מעברי חצייה.",
    status: "active",
    unit: "יחידה",
    inventoryLabel: "ציוד בשימוש",
    specs: [
      { label: "קיבולת מיכל", value: "40 ליטר" },
      { label: "רוחב קו", value: "10–40 ס״מ" },
      { label: "מנוע", value: "גז / חשמל" },
      { label: "מהירות", value: "2–6 קמ״ש" },
      { label: "משקל", value: "85 ק״ג" },
    ],
    metrics: [
      { label: "יחידות בצי", value: 3 },
      { label: "בשימוש כעת", value: 2 },
      { label: "בתחזוקה", value: 1 },
      { label: "שעות שנתי", value: 1240 },
    ],
    tags: ["ציוד שטח", "סימון", "ציוד מקצועי"],
    accentColor: "#10b981",
    inventory: {
      total: 3, available: 0, reserved: 2, inProduction: 0, inTransit: 0, minimum: 2,
      reservations: [
        { orderId: "ORD-447", qty: 1, site: "פארק מיט\"ב",  customer: "עיריית פתח־תקווה", due: "2026-06-11" },
        { orderId: "ORD-449", qty: 1, site: "צומת קציר",    customer: "מ.מ. קציר־חריש",   due: "2026-06-09" },
      ],
    },
  },
  {
    id: "thermoplastic",
    title: "תרמופלסטי צהוב",
    category: "חומרי סימון",
    imageUrl: "/catalog/transparent/thermoplastic.png",
    description: "חומר סימון תרמופלסטי מוכן ליישום. עמיד לתנאי מזג אוויר קיצוניים. מיושם בחימום. ראות גבוהה בלילה עם חרוזי זכוכית.",
    status: "active",
    unit: "ק״ג",
    inventoryLabel: "מלאי במחסן",
    specs: [
      { label: "סוג", value: "תרמופלסטי מוחם" },
      { label: "צבע", value: "צהוב / לבן" },
      { label: "טמפ' יישום", value: "180–200°C" },
      { label: "עובי", value: "2–4 מ״מ" },
      { label: "חרוזי זכוכית", value: "מוטמעים" },
    ],
    metrics: [
      { label: "מלאי (ק״ג)", value: 850 },
      { label: "מינימום הזמנה", value: 200 },
      { label: "צריכה חודשית", value: 320 },
      { label: "ימים עד אזילה", value: 8 },
    ],
    tags: ["חומר", "תרמופלסטי", "סימון"],
    accentColor: "#eab308",
    inventory: {
      total: 850, available: 530, reserved: 320, inProduction: 0, inTransit: 0, minimum: 200,
      usagePerMonth: 320,
      reservations: [
        { orderId: "ORD-447", qty: 180, site: "פארק מיט\"ב", customer: "עיריית פתח־תקווה", due: "2026-06-11" },
        { orderId: "ORD-449", qty: 140, site: "צומת קציר",    customer: "מ.מ. קציר־חריש",   due: "2026-06-09" },
      ],
      nextReorder: { date: "2026-06-01", qty: 400, supplier: "TexMark" },
    },
  },
  {
    id: "flashing-light",
    title: "פנס מהבהב LED",
    category: "ציוד אזהרה",
    imageUrl: "/catalog/transparent/flashing-light.png",
    description: "פנס אזהרה LED סולארי עם מגנט. מהבהב 60 פעימות לדקה. מתאים להצמדה לקונוסים, מחסומים ותמרורים.",
    status: "active",
    unit: "יחידה",
    inventoryLabel: "מלאי זמין",
    specs: [
      { label: "מקור כוח", value: "סולארי + סוללה" },
      { label: "תדירות", value: "60 BPM" },
      { label: "ראות", value: "עד 500 מ'" },
      { label: "IP", value: "IP67" },
      { label: "חיבור", value: "מגנט + קליפס" },
    ],
    metrics: [
      { label: "מלאי שוטף", value: 87 },
      { label: "בשטח", value: 45 },
      { label: "בטעינה", value: 12 },
      { label: "תקלות", value: 3 },
    ],
    tags: ["LED", "סולארי", "אזהרה"],
    accentColor: "#f59e0b",
    inventory: {
      total: 87, available: 27, reserved: 60, inProduction: 0, inTransit: 0, minimum: 30,
      usagePerMonth: 22,
      reservations: [
        { orderId: "ORD-441", qty: 30, site: "כביש 6, מחלף 12", customer: "נתיבי ישראל", due: "2026-06-04" },
        { orderId: "ORD-447", qty: 20, site: "פארק מיט\"ב",       customer: "עיריית פתח־תקווה", due: "2026-06-11" },
        { orderId: "ORD-453", qty: 10, site: "חניון מרכזי",         customer: "צ.מ.ח. נדל\"ן",        due: "2026-06-02" },
      ],
    },
  },
  {
    id: "safety-rail",
    title: "מעקה בטיחות גלגל",
    category: "מחסומים וגדרות",
    imageUrl: "/catalog/transparent/safety-rail.png",
    description: "מעקה בטיחות מפלסטיק על גלגלים לתיחום מהיר של אזורי עבודה. ניתן לחיבור שרשרת לשרשרת. מתקפל לאחסון.",
    status: "active",
    unit: "מטר",
    inventoryLabel: "מלאי זמין",
    specs: [
      { label: "חומר", value: "HDPE כבד" },
      { label: "גובה", value: "1.0 מ'" },
      { label: "אורך יחידה", value: "1.2 מ'" },
      { label: "צבע", value: "כתום / אדום" },
      { label: "משקל יחידה", value: "4.5 ק״ג" },
    ],
    metrics: [
      { label: "מלאי (יחידות)", value: 60 },
      { label: "בשטח כעת", value: 35 },
      { label: "מינימום מלאי", value: 20 },
      { label: "מטרים כולל", value: 72 },
    ],
    tags: ["מחסום", "נייד", "HDPE"],
    accentColor: "#f97316",
    inventory: {
      total: 60, available: 25, reserved: 35, inProduction: 0, inTransit: 0, minimum: 20,
      usagePerMonth: 12,
      reservations: [
        { orderId: "ORD-453", qty: 35, site: "חניון מרכזי", customer: "צ.מ.ח. נדל\"ן", due: "2026-06-02" },
      ],
    },
  },
];
