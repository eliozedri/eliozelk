-- Agent-to-agent conversation layer for JARVIS ↔ CEO-Agent.
--
-- Turns the single-command row into a conversation header carrying a typed turn
-- log, so JARVIS and the Elkayam CEO-Agent hold a structured dialogue (request →
-- analysis → needs_info → proposal → capability_gap → execution_preview →
-- status_update → final_result) instead of intent→hardcoded-action. Additive.

alter table public.jarvis_ceo_agent_commands
  add column if not exists conversation       jsonb not null default '[]'::jsonb,
  add column if not exists last_message_type   text;

-- Widen status to include the conversation/analysis states.
alter table public.jarvis_ceo_agent_commands
  drop constraint if exists jarvis_ceo_agent_commands_status_check;
alter table public.jarvis_ceo_agent_commands
  add constraint jarvis_ceo_agent_commands_status_check
  check (status in (
    'pending_review','approved','preview_ready','execution_approved',
    'executed','failed','reverted','rejected','needs_info',
    'archived','execution_disabled','executed_later','capability_gap'
  ));
