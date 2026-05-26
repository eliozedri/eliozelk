import type { LLMRequest, LLMIntentResult, LLMPlanResult, LlmIntent, SafetyLevel, PlanStep } from "./types";

/**
 * Prompt builders + strict-but-tolerant JSON parsers. PURE. Providers send these strings and
 * feed the model's raw text back into the parsers. The parsers NEVER trust the model: they
 * validate shape and clamp values; the safety validator then enforces policy on top.
 */

const SAFETY_LEVELS: SafetyLevel[] = ["read_only", "pending", "write", "blocked"];

export function buildIntentPrompt(req: LLMRequest): { system: string; user: string } {
  const intents = req.allowedIntents.join(", ");
  const system = [
    "You are the router for Jarvis, a Hebrew-language assistant for a road-sign company (Elkayam).",
    `The sender role is "${req.role}" on channel "${req.channel}".`,
    "Classify the message into ONE intent, pick the skill, extract parameters, and decide if you must ask a clarifying question.",
    `Allowed intents for THIS sender: ${intents}.`,
    "If the sender is external/unknown, you may ONLY use external_* / confirmation / cancellation / clarification / unknown intents.",
    "safetyLevel must be read_only for queries, pending for things that create a pending record (orders/requests), write for anything that mutates business data (you should avoid choosing write), blocked if disallowed.",
    "Reply with ONLY a JSON object, no prose, matching exactly:",
    '{"intent": string, "skill": string|null, "confidence": number(0..1), "parameters": object, "requiresClarification": boolean, "clarificationQuestion": string|null, "safetyLevel": "read_only"|"pending"|"write"|"blocked"}',
  ].join("\n");
  const ctx = req.context ? `\ncontext: ${JSON.stringify(req.context).slice(0, 800)}` : "";
  const user = `message: ${req.text}${ctx}`;
  return { system, user };
}

export function buildPlanPrompt(req: LLMRequest, actions: string): { system: string; user: string } {
  const system = [
    "You are the planning layer for Jarvis (owner-only). Break the owner's request into a SAFE,",
    "ORDERED plan using ONLY the available read-only actions listed below. Never invent actions,",
    "never write data, never run code or SQL. If a step would mutate data, set requiresApproval=true.",
    "Available actions (skill.action — description):",
    actions,
    "Reply with ONLY a JSON object matching exactly:",
    '{"goal": string, "steps": [{"skill": string, "action": string, "parameters": object, "safety": "read_only"|"pending"|"write"|"blocked"}], "requiresApproval": boolean, "riskLevel": "low"|"medium"|"high"}',
  ].join("\n");
  const user = `request: ${req.text}`;
  return { system, user };
}

/** Extract the first balanced JSON object from arbitrary model text. */
export function extractJsonObject(raw: string): unknown | null {
  if (!raw) return null;
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const VALID_INTENTS = new Set<string>([
  "owner_menu", "order_intake", "order_update", "ceo_manager_request", "ocr_document",
  "personal_task", "personal_note", "reminder_request", "daily_report",
  "operations_inventory_query", "system_status", "agent_reasoning",
  "external_greeting", "external_order_request", "external_order_update",
  "external_document_attachment", "representative_request", "cancellation", "confirmation",
  "clarification", "unknown",
]);

export function parseIntentJson(raw: string): LLMIntentResult | null {
  const obj = extractJsonObject(raw) as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") return null;
  const intent = String(obj.intent ?? "");
  if (!VALID_INTENTS.has(intent)) return null;
  const conf = Number(obj.confidence);
  const safety = String(obj.safetyLevel ?? "read_only");
  return {
    intent: intent as LlmIntent,
    skill: obj.skill == null ? null : String(obj.skill),
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0,
    parameters: obj.parameters && typeof obj.parameters === "object" ? (obj.parameters as Record<string, unknown>) : {},
    requiresClarification: obj.requiresClarification === true,
    clarificationQuestion: obj.clarificationQuestion == null ? null : String(obj.clarificationQuestion),
    safetyLevel: (SAFETY_LEVELS.includes(safety as SafetyLevel) ? safety : "read_only") as SafetyLevel,
  };
}

export function parsePlanJson(raw: string): LLMPlanResult | null {
  const obj = extractJsonObject(raw) as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") return null;
  if (!Array.isArray(obj.steps)) return null;
  const steps: PlanStep[] = [];
  for (const s of obj.steps as Record<string, unknown>[]) {
    if (!s || typeof s !== "object") continue;
    const safety = String(s.safety ?? "read_only");
    steps.push({
      skill: String(s.skill ?? ""),
      action: String(s.action ?? ""),
      parameters: s.parameters && typeof s.parameters === "object" ? (s.parameters as Record<string, unknown>) : {},
      safety: (SAFETY_LEVELS.includes(safety as SafetyLevel) ? safety : "read_only") as SafetyLevel,
    });
  }
  const risk = String(obj.riskLevel ?? "low");
  return {
    goal: String(obj.goal ?? ""),
    steps,
    requiresApproval: obj.requiresApproval === true,
    riskLevel: (["low", "medium", "high"].includes(risk) ? risk : "low") as "low" | "medium" | "high",
  };
}
