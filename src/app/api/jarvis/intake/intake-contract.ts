/**
 * JARVIS → Elkayam intake contract.
 *
 * This file owns the Elkayam-side type definitions + manual validator
 * for the request body sent by JARVIS to /api/jarvis/intake?v=1.
 *
 * The shape mirrors the JARVIS-side ElkayamIntakeRequest type
 * (committed in JARVIS docs/architecture/elkayam-integration-spec.md
 * §2.3). We keep a local copy here so Elkayam has zero runtime
 * dependency on JARVIS source.
 *
 * Phase 2.0g: the route is dry-run only. Validation runs; no DB
 * mutation happens.
 */

export const SUPPORTED_INTENT_TYPES = [
  "new_order_candidate",
  "order_note",
  "work_log_candidate",
  "scheduling_candidate",
  "team_task_candidate",
  "billing_candidate",
  "inventory_candidate",
  "equipment_issue_candidate",
  "supplier_followup",
] as const;
export type JarvisIntakeIntentType = (typeof SUPPORTED_INTENT_TYPES)[number];

export const SUPPORTED_RECOMMENDED_ACTIONS = [
  "create_order_draft",
  "update_order_draft",
  "create_work_log_draft",
  "create_schedule_draft",
  "create_task_draft",
] as const;
export type JarvisRecommendedAction =
  (typeof SUPPORTED_RECOMMENDED_ACTIONS)[number];

export type JarvisIntakeUrgency = "low" | "normal" | "high" | "critical";

export type JarvisIntakeExtractedEntities = {
  customer?: string | null;
  supplier?: string | null;
  project_or_site?: string | null;
  crew_or_team?: string | null;
  date_or_time?: string | null;
  products?: string[];
  quantities?: Record<string, number>;
  order_reference?: string | null;
  person?: string | null;
  urgency?: JarvisIntakeUrgency | null;
  [extra: string]: unknown;
};

export type JarvisIntakeOwnerApproval = {
  decided_by: "owner";
  decided_at: string;
  jarvis_approval_id: string;
  via: "telegram" | "whatsapp";
};

export type JarvisIntakeRequest = {
  request_id: string;
  source_channel: "telegram" | "whatsapp";
  source_sender_id: string;
  source_message_text: string | null;
  intent_type: JarvisIntakeIntentType;
  life_domain: "business" | "mixed";
  recommended_action: JarvisRecommendedAction;
  extracted_entities: JarvisIntakeExtractedEntities;
  summary_text: string | null;
  urgency: JarvisIntakeUrgency | null;
  owner_approval: JarvisIntakeOwnerApproval;
  dry_run?: boolean;
};

export type JarvisIntakeStatus =
  | "queued"
  | "already_processed"
  | "invalid"
  | "duplicate_blocked"
  | "failed"
  | "needs_clarification"
  | "accepted"
  | "rejected";

export type JarvisIntakeResponse = {
  request_id: string;
  agent_task_id: string | null;
  status: JarvisIntakeStatus;
  resolved_customer_id?: string | null;
  resolved_order_id?: string | null;
  detected_action?: JarvisRecommendedAction;
  dry_run: boolean;
  missing_fields?: string[];
  duplicate_warning?: string | null;
  message_to_owner?: string;
  operation_request_reference?: string | null;
  safety_notes?: string[];
  notes?: string;
  responded_at: string;
};

// ---------------------------------------------------------------------------
// Manual validator. Zero deps. Returns either a parsed request or a
// list of missing/invalid fields. The route turns the list into a 400
// response with status='invalid'.
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; parsed: JarvisIntakeRequest }
  | { ok: false; missing: string[]; message: string };

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseJarvisIntakeRequest(input: unknown): ParseResult {
  const missing: string[] = [];

  if (input === null || typeof input !== "object") {
    return { ok: false, missing: ["body"], message: "Body must be a JSON object" };
  }
  const obj = input as Record<string, unknown>;

  function req<T = unknown>(key: string, type: string): T | undefined {
    const v = obj[key];
    if (v === undefined || v === null) {
      missing.push(key);
      return undefined;
    }
    if (typeof v !== type && !(type === "array" && Array.isArray(v))) {
      missing.push(`${key}:type`);
      return undefined;
    }
    return v as T;
  }

  const request_id = req<string>("request_id", "string");
  if (request_id && !UUID_RX.test(request_id)) {
    missing.push("request_id:format");
  }

  const source_channel = req<string>("source_channel", "string");
  if (source_channel && source_channel !== "telegram" && source_channel !== "whatsapp") {
    missing.push("source_channel:value");
  }

  const source_sender_id = req<string>("source_sender_id", "string");

  // source_message_text MAY be null — typeof null === 'object'. Manual.
  let source_message_text: string | null = null;
  if ("source_message_text" in obj) {
    const v = obj.source_message_text;
    if (v === null) source_message_text = null;
    else if (typeof v === "string") source_message_text = v;
    else missing.push("source_message_text:type");
  } else {
    missing.push("source_message_text");
  }

  const intent_type = req<string>("intent_type", "string");
  if (
    intent_type &&
    !SUPPORTED_INTENT_TYPES.includes(intent_type as JarvisIntakeIntentType)
  ) {
    missing.push("intent_type:value");
  }

  const life_domain = req<string>("life_domain", "string");
  if (life_domain && life_domain !== "business" && life_domain !== "mixed") {
    missing.push("life_domain:value");
  }

  const recommended_action = req<string>("recommended_action", "string");
  if (
    recommended_action &&
    !SUPPORTED_RECOMMENDED_ACTIONS.includes(
      recommended_action as JarvisRecommendedAction,
    )
  ) {
    missing.push("recommended_action:value");
  }

  // extracted_entities — object, optional fields all optional
  let extracted_entities: JarvisIntakeExtractedEntities = {};
  if ("extracted_entities" in obj) {
    const v = obj.extracted_entities;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      extracted_entities = v as JarvisIntakeExtractedEntities;
    } else {
      missing.push("extracted_entities:type");
    }
  }

  // summary_text — string | null
  let summary_text: string | null = null;
  if ("summary_text" in obj) {
    const v = obj.summary_text;
    if (v === null) summary_text = null;
    else if (typeof v === "string") summary_text = v;
    else missing.push("summary_text:type");
  }

  // urgency — string | null
  let urgency: JarvisIntakeUrgency | null = null;
  if ("urgency" in obj) {
    const v = obj.urgency;
    if (v === null) urgency = null;
    else if (
      typeof v === "string" &&
      ["low", "normal", "high", "critical"].includes(v)
    ) {
      urgency = v as JarvisIntakeUrgency;
    } else missing.push("urgency:value");
  }

  // owner_approval — nested object
  let owner_approval: JarvisIntakeOwnerApproval | null = null;
  if ("owner_approval" in obj) {
    const v = obj.owner_approval as Record<string, unknown> | null | undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const decided_by = v.decided_by;
      const decided_at = v.decided_at;
      const jarvis_approval_id = v.jarvis_approval_id;
      const via = v.via;
      if (decided_by !== "owner") missing.push("owner_approval.decided_by");
      if (typeof decided_at !== "string") missing.push("owner_approval.decided_at");
      if (typeof jarvis_approval_id !== "string")
        missing.push("owner_approval.jarvis_approval_id");
      if (via !== "telegram" && via !== "whatsapp")
        missing.push("owner_approval.via");
      if (
        decided_by === "owner" &&
        typeof decided_at === "string" &&
        typeof jarvis_approval_id === "string" &&
        (via === "telegram" || via === "whatsapp")
      ) {
        owner_approval = {
          decided_by: "owner",
          decided_at,
          jarvis_approval_id,
          via,
        };
      }
    } else {
      missing.push("owner_approval:type");
    }
  } else {
    missing.push("owner_approval");
  }

  let dry_run: boolean | undefined;
  if ("dry_run" in obj) {
    const v = obj.dry_run;
    if (typeof v === "boolean") dry_run = v;
    else missing.push("dry_run:type");
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message: `Validation failed for fields: ${missing.join(", ")}`,
    };
  }

  return {
    ok: true,
    parsed: {
      request_id: request_id as string,
      source_channel: source_channel as "telegram" | "whatsapp",
      source_sender_id: source_sender_id as string,
      source_message_text,
      intent_type: intent_type as JarvisIntakeIntentType,
      life_domain: life_domain as "business" | "mixed",
      recommended_action: recommended_action as JarvisRecommendedAction,
      extracted_entities,
      summary_text,
      urgency,
      owner_approval: owner_approval!,
      dry_run,
    },
  };
}
