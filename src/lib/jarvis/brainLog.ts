/**
 * Structured, secrets-free logging of Brain decisions. One JSON line per decision so the runtime
 * path (role → reasoning → department → action/clarification/fallback) is traceable in Vercel
 * logs. NEVER logs API keys. A short message snippet is included only for the OWNER (debugging),
 * never for external customers (privacy).
 */

export interface BrainLogFields {
  role: string;
  channel: string;
  llmEnabled: boolean;
  provider?: string;
  source: string; // "llm" | "deterministic"
  intent: string;
  coarseIntent: string;
  businessDomain: string;
  targetAgents: string[];
  skill: string | null;
  action: string | null;
  confidence: number;
  requiresClarification: boolean;
  verifiedAnswerPossible: boolean;
  msgId?: string;
  /** Owner-only short snippet (truncated). Omit for external senders. */
  snippet?: string;
}

export function logBrainDecision(f: BrainLogFields): void {
  const safe = {
    role: f.role,
    channel: f.channel,
    llm: f.llmEnabled,
    provider: f.provider ?? null,
    source: f.source,
    intent: f.intent,
    coarse: f.coarseIntent,
    domain: f.businessDomain,
    agents: f.targetAgents,
    skill: f.skill,
    action: f.action,
    conf: Number(f.confidence?.toFixed?.(2) ?? f.confidence),
    clarify: f.requiresClarification,
    verified: f.verifiedAnswerPossible,
    msgId: f.msgId ?? null,
    snippet: f.role === "master" && f.snippet ? f.snippet.slice(0, 60) : undefined,
  };
  console.log(`[jarvis:brain] ${JSON.stringify(safe)}`);
}
