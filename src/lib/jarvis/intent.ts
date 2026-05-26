import type { IntentResult, SenderRole } from "./types";
import { isCeoRequest, isCeoStatusQuery } from "./skills/ceoManager/intent";
import { isPureStarter } from "@/lib/whatsapp/summary";
import { looksLikeOrder } from "@/lib/whatsapp/classify";

/**
 * Central deterministic intent classifier (Stage 1). This is the single place the Brain
 * decides "what does this message want". An LLM semantic classifier can later implement the
 * same `classifyIntent` signature with no change to skills/registry/adapters.
 *
 * Role-aware only in priority, not in gating — gating (who may reach which skill) is the
 * registry's job. External callers are funneled to order intake regardless.
 */

const ORDER = /(צור|פתח|הוסף|תפתח|תוסיף|תיצור|לפתוח)\s+(לי\s+)?(טיוטת\s+|בקשת\s+)?הזמנה|טיוטת\s+הזמנה|הזמנה\s+חדשה|בקשת\s+הזמנה/;
const PERSONAL = /תזכיר\s+לי|תזכורת|תרשום\s+(לי\s+)?משימה|משימה\s+חדשה|פתק\s+אישי|שמור\s+(לי\s+)?פתק|דוח\s+יומי|הוסף\s+(לי\s+)?משימה/;
const OCR = /קרא\s+(את\s+)?המסמך|תקרא|סרוק|סריקה|תסרוק|מסמך/;
const STATUS = /מה\s+(פתוח|המשימות|יש\s+לי)|המשימות\s+שלי|מה\s+יש\s+להיום|סיכום\s+יומי/;
const GREETING = /^(שלום|היי|הי|הלו|אהלן|בוקר טוב|ערב טוב|מה נשמע)/;

export function classifyIntent(text: string, _role: SenderRole): IntentResult {
  const t = (text ?? "").trim();
  if (!t) return { intent: "unclear", confidence: 0.3 };

  // CEO first — explicit "ל-CEO / מנהל המערכת" mention is unambiguous.
  if (isCeoRequest(t) || isCeoStatusQuery(t)) return { intent: "ceo_manager", confidence: 0.9 };
  // Personal before order so "תזכיר לי לבדוק את ההזמנות" stays personal.
  if (PERSONAL.test(t)) return { intent: "personal", confidence: 0.85 };
  if (ORDER.test(t) || looksLikeOrder(t)) return { intent: "order_intake", confidence: 0.85 };
  if (OCR.test(t)) return { intent: "ocr_document", confidence: 0.8 };
  if (STATUS.test(t)) return { intent: "status", confidence: 0.7 };
  if (isPureStarter(t) || GREETING.test(t)) return { intent: "greeting", confidence: 0.6 };
  return { intent: "unclear", confidence: 0.3 };
}
