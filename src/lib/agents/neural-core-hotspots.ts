// Phase 1C — calibrated hotspot baseline (2025-05-17)
// Positions were set using the in-browser calibration tool on the reference image.
// x, y = center of ellipse as % of the 3:2 stage container (= % of 1536×1024 image)
// w, h = ellipse width/height as % of stage container
// shape = always 'ellipse'; border-radius:50% on a w≠h div produces the ellipse

export interface NeuralHotspot {
  id: string;
  labelHe: string;
  labelEn: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'ellipse';
}

export const NEURAL_HOTSPOTS: NeuralHotspot[] = [
  { id: 'orchestrator', labelHe: 'מנהל התפעול הראשי', labelEn: 'OPERATIONS ORCHESTRATOR', x: 48.3, y: 15.3, w: 34.7, h: 11.0, shape: 'ellipse' },
  { id: 'data_core',    labelHe: 'שיבר מרכזי',         labelEn: 'DATA CORE',              x: 48.3, y: 42.1, w: 11.3, h: 16.8, shape: 'ellipse' },
  { id: 'cfo',          labelHe: 'מנהל כספים',          labelEn: 'CFO / FINANCE',          x: 23.6, y: 30.7, w: 18.4, h: 10.5, shape: 'ellipse' },
  { id: 'warehouse',    labelHe: 'מחסן',               labelEn: 'WAREHOUSE',              x: 21.5, y: 51.4, w: 18.6, h: 10.7, shape: 'ellipse' },
  { id: 'coordination-qa', labelHe: 'תיאומים ו-QA',    labelEn: 'COORDINATION & QA',      x: 17.4, y: 73.2, w: 13.2, h:  9.3, shape: 'ellipse' },
  { id: 'graphics',     labelHe: 'מחלקת גרפיקה',       labelEn: 'GRAPHICS DEPT.',         x: 72.9, y: 30.3, w: 20.6, h: 11.5, shape: 'ellipse' },
  { id: 'accounting',   labelHe: 'הנהלת חשבונות',      labelEn: 'ACCOUNTING DEPT.',       x: 74.2, y: 50.8, w: 19.8, h: 10.9, shape: 'ellipse' },
  { id: 'catalog',      labelHe: 'קטלוג מוצרים',       labelEn: 'CATALOG / PRODUCTS',     x: 78.4, y: 72.1, w: 13.8, h:  9.3, shape: 'ellipse' },
  { id: 'fabrication',  labelHe: 'מסגרייה',            labelEn: 'FABRICATION',            x: 32.4, y: 72.5, w: 13.6, h: 10.1, shape: 'ellipse' },
  { id: 'meeting',      labelHe: 'חדר ישיבות',         labelEn: 'MEETING ROOM',           x: 47.9, y: 73.2, w: 15.9, h: 16.8, shape: 'ellipse' },
  { id: 'field_ops',    labelHe: 'עבודות שטח',         labelEn: 'FIELD OPERATIONS',       x: 63.5, y: 72.4, w: 13.8, h: 12.1, shape: 'ellipse' },
];
