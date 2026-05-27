-- Jarvis Brain audit trail (additive). Persists, for every OWNER brain decision:
--   incoming message → reasoning/decision → selected department/skill/action → outgoing reply.
-- Lets us see in hindsight WHY the brain chose an action (provider, intent, confidence, fallback,
-- safety) without relying on ephemeral console logs. Service-role only (written by server routes);
-- no client RLS policies → default-deny to anon/auth, same posture as jarvis_master_items.

create table if not exists public.jarvis_brain_audit (
  id                       uuid        not null default gen_random_uuid() primary key,
  created_at               timestamptz not null default now(),
  sender_role              text,            -- master | external | internal | unknown
  channel                  text,            -- whatsapp | telegram | web
  msg_id                   text,            -- channel message id / correlation id
  inbound_text             text,            -- the user's message (truncated; owner only)
  llm_enabled              boolean,         -- was the LLM feature on at decision time
  provider_used            text,            -- gemini | groq | anthropic | openai | local | deterministic
  decision_source          text,            -- llm | deterministic
  intent                   text,            -- rich LlmIntent
  business_domain          text,            -- warehouse | catalog | orders | operations | finance | fleet | management | ...
  target_agent             text,            -- command-center agent the work/request was attributed to
  skill                    text,
  action                   text,            -- resolved read-only command id (null = routine/clarify/pending)
  parameters               jsonb       not null default '{}'::jsonb,
  confidence               numeric,
  requires_clarification   boolean,
  fallback_reason          text,
  safety_result            text,            -- accept | clamp | clarify | fallback | deny
  verified_answer_possible boolean,
  outgoing_summary         text             -- the reply Jarvis sent (truncated)
);

create index if not exists jarvis_brain_audit_created_idx on public.jarvis_brain_audit (created_at desc);
create index if not exists jarvis_brain_audit_intent_idx  on public.jarvis_brain_audit (intent, business_domain);

alter table public.jarvis_brain_audit enable row level security;
