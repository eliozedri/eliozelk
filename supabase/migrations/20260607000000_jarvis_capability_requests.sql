-- Jarvis Capability Requests (additive). A FIRST-CLASS record for when Jarvis cannot answer because
-- a skill / data source / tool is MISSING, or when the owner explicitly asks to BUILD a capability
-- ("תבנה לי יכולת..."). Jarvis must never fake an answer — it files one of these and routes it to the
-- right department/manager. Service-role only (no client RLS policies → default-deny to anon/auth).

create table if not exists public.jarvis_capability_requests (
  id                           uuid        not null default gen_random_uuid() primary key,
  created_at                   timestamptz not null default now(),
  requested_by                 text,            -- masked phone / user id
  channel                      text,            -- whatsapp | telegram | web
  original_message             text,            -- the owner's message (truncated)
  interpreted_intent           text,            -- the rich LlmIntent the brain inferred
  kind                         text        not null default 'data_source', -- skill_build | data_source | tool
  missing_skill_or_data_source text,            -- what is missing to answer verifiably
  target_agent                 text,            -- department/agent to own it
  priority                     text        not null default 'normal',
  status                       text        not null default 'pending',
  recommended_next_step        text
);

create index if not exists jarvis_capability_requests_status_idx  on public.jarvis_capability_requests (status, created_at desc);
create index if not exists jarvis_capability_requests_agent_idx   on public.jarvis_capability_requests (target_agent);

alter table public.jarvis_capability_requests enable row level security;

-- Link the audit trail to capability requests + flag capability-build decisions.
alter table public.jarvis_brain_audit
  add column if not exists missing_capability        text,
  add column if not exists requires_capability_build boolean,
  add column if not exists capability_request_id     uuid;
