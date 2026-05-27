-- Jarvis Development tasks (additive). Records every OWNER development/Claude-Code request:
-- the interpreted dev sub-intent, risk level, whether approval is required, the generated Claude
-- Code prompt, and status. Stage 1 = Jarvis prepares prompts/tasks (no serverless code execution);
-- a future executor can pick up approved tasks. Service-role only (no client RLS policies).

create table if not exists public.jarvis_dev_tasks (
  id                    uuid        not null default gen_random_uuid() primary key,
  created_at            timestamptz not null default now(),
  requested_by          text,
  channel               text,
  project_id            text,
  original_message      text,
  interpreted_intent    text,            -- dev sub-intent (code_debug, build_error_analysis, ...)
  risk_level            text,            -- READ_ONLY | TASK_ONLY | SAFE_EDIT | DANGEROUS
  selected_action       text,
  approval_required     boolean     not null default false,
  status                text        not null default 'prepared', -- prepared | blocked_needs_approval | pending | done
  recommended_next_step text,
  claude_prompt         text,
  result_summary        text,
  linked_commit         text
);

create index if not exists jarvis_dev_tasks_status_idx  on public.jarvis_dev_tasks (status, created_at desc);
create index if not exists jarvis_dev_tasks_project_idx on public.jarvis_dev_tasks (project_id);

alter table public.jarvis_dev_tasks enable row level security;
