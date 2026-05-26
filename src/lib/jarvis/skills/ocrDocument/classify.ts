/**
 * Classify extracted document text into a coarse category for routing.
 * Deterministic keyword heuristic (LLM-swappable). Never invents — defaults to "unclear".
 */

export type DocClass = "order" | "customer" | "supplier" | "finance" | "work_note" | "personal" | "unclear";

const RULES: { cls: DocClass; re: RegExp }[] = [
  { cls: "supplier", re: /חשבונית|ספק|מס["׳]?\s*עוסק|ח\.?פ\.?|תעודת\s+משלוח|הזמנת\s+רכש/ },
  { cls: "finance", re: /סה["׳]?כ|מע["׳]?מ|לתשלום|יתרה|תשלום|מחיר\s+כולל|חשבון/ },
  { cls: "order", re: /תמרור|שלט|שילוט|סימ[ונ]|צבע|צביע|מחסום|אבני?\s*שפה|כביש|חני(ה|יה|ון)|הזמנה|בקשת\s+הזמנה/ },
  { cls: "customer", re: /לקוח|טלפון|נייד|כתובת|איש\s+קשר|עיר/ },
  { cls: "work_note", re: /הערה|הערות|לבצע|משימה|ביקור|דו["׳]?ח\s+עבודה|אתר\s+עבודה/ },
];

export function classifyDocText(textBody: string): DocClass {
  const t = (textBody ?? "").trim();
  if (!t) return "unclear";
  for (const { cls, re } of RULES) if (re.test(t)) return cls;
  return "unclear";
}
