/**
 * Jarvis core contracts.
 *
 * Jarvis is the master personal assistant. Channels (WhatsApp / Telegram / Web) are
 * ADAPTERS — they normalize their payloads into a `JarvisInput`, hand it to the
 * orchestrator, and render the returned `OutboundMessage[]`. They own no business logic.
 *
 * The orchestrator identifies sender role + conversation state, picks a Skill, and the
 * Skill returns messages (it never talks to a channel directly). This keeps skills
 * channel-agnostic and reusable, and lets the parser/brain be swapped (deterministic →
 * LLM) behind the same interface without touching adapters or state.
 */

export type Channel = "whatsapp" | "telegram" | "web";
export type SenderRole = "master" | "external" | "internal" | "unknown";

/** Coarse intents the brain routes on (deterministic Stage 1; LLM-swappable). */
export type Intent =
  | "order_intake"
  | "ocr_document"
  | "ceo_manager"
  | "personal"
  | "status"
  | "help"
  | "greeting"
  | "unclear";

/** 0..1 classifier confidence (deterministic classifier uses coarse 0.5/0.9 bands). */
export type Confidence = number;

export interface IntentResult {
  intent: Intent;
  confidence: Confidence;
}

/** How risky an action is — gates whether confirmation is required before running it. */
export type ActionSafetyLevel = "safe" | "confirm" | "blocked";

/** Per-sender conversation state (free-form per skill; persisted by adapters/skills). */
export interface ConversationState {
  activeSkill?: Intent;
  [key: string]: unknown;
}

/** Resolved context the brain passes to a skill. */
export interface JarvisContext {
  input: JarvisInput;
  intent: IntentResult;
  state: ConversationState;
}

/** A normalized inbound event from any channel. */
export interface JarvisInput {
  channel: Channel;
  /** Stable per-channel sender id (e.g. WhatsApp wa_id / phone). */
  senderId: string;
  senderRole: SenderRole;
  contactName: string | null;
  /** Text body, media caption, or interactive reply title. */
  text: string | null;
  /** Stable id of a tapped button / list row, if any. */
  interactiveId?: string | null;
  media?: {
    id: string;
    mimeType: string | null;
    kind: "image" | "document";
    filename?: string | null;
  } | null;
  /** Channel message id (idempotency / external_ref). */
  messageId: string;
}

/** A channel-agnostic outbound message the adapter must render/send, in order. */
export type OutboundMessage =
  | { kind: "text"; text: string }
  | { kind: "image"; imageUrl: string; caption?: string };

export interface JarvisResponse {
  messages: OutboundMessage[];
}

export interface SkillContext {
  input: JarvisInput;
}

export interface SkillResult {
  /** False → this skill declined; the orchestrator may try another. */
  handled: boolean;
  messages: OutboundMessage[];
}

export interface Skill {
  name: string;
  handle(ctx: SkillContext): Promise<SkillResult>;
}

/** Convenience builders for skills. */
export const text = (t: string): OutboundMessage => ({ kind: "text", text: t });
export const image = (imageUrl: string, caption?: string): OutboundMessage => ({ kind: "image", imageUrl, caption });
