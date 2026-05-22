/**
 * HOLOGRAPHIC CATALOG — MOCK DATASET
 *
 * TO ADD REAL PRODUCT IMAGES:
 *   Place transparent PNG files in: /public/catalog/transparent/
 *   Each file name must match the `id` field below plus ".png"
 *   Examples:
 *     /public/catalog/transparent/speed-bump.png
 *     /public/catalog/transparent/cat-eyes.png
 *     /public/catalog/transparent/cones.png
 *     /public/catalog/transparent/cone-sleeves.png
 *     /public/catalog/transparent/arrow-board.png
 *     /public/catalog/transparent/sign.png
 *     /public/catalog/transparent/jersey-barrier.png
 *     /public/catalog/transparent/marking-machine.png
 *     /public/catalog/transparent/thermoplastic.png
 *     /public/catalog/transparent/flashing-light.png
 *     /public/catalog/transparent/safety-rail.png
 *
 * TO CONNECT SUPABASE:
 *   Replace this array with data from useCatalog() and map
 *   CatalogItem fields → HoloProduct shape.
 *   metadata.specs maps to specs[], metadata.images.full maps to imageUrl.
 */

import type { HoloProduct } from "./types";

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
  },
];
