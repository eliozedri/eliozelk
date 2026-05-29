-- JARVIS → Elkayam CEO-Agent command intake (Tier-A pending-review queue).
--
-- The Elkayam CEO-Agent receives structured task/requests from JARVIS here.
-- This is a CONTROL/REVIEW queue only: rows are stored as pending_review and an
-- owner reviews + decides them in the Elkayam UI (/jarvis-requests). Approving a
-- row ONLY changes its status — it performs NO catalog/pricing/finance/fleet/
-- order business mutation. Actual execution (Tier-B) is a separate, future,
-- explicitly-gated step. Additive; service-role only (no client RLS policies),
-- matching the other jarvis_* tables.

create table if not exists public.jarvis_ceo_agent_commands (
  id                  uuid        not null default gen_random_uuid() primary key,
  correlation_id      text        not null unique,         -- = JARVIS jarvis_execution_plans.id (idempotency)
  source_agent        text        not null default 'jarvis',
  target_agent        text        not null default 'elkayam_ceo_agent',
  requested_by        text,
  title               text,
  summary             text,
  full_request        text,
  action_type         text        not null,                -- e.g. price_update_request
  target_department   text,
  target_role         text,                                -- catalog_manager | system_manager | ...
  risk_level          text,
  status              text        not null default 'pending_review'
                        check (status in (
                          'pending_review','approved','rejected','needs_info',
                          'archived','execution_disabled','executed_later'
                        )),
  approval_required   boolean     not null default true,
  approved_by         text,
  approved_at         timestamptz,
  rejection_reason    text,
  payload_json        jsonb       not null default '{}'::jsonb,  -- full signed command package
  dry_run_summary     text,
  rollback_plan       text,
  diagnostics         jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists jarvis_ceo_agent_commands_status_idx
  on public.jarvis_ceo_agent_commands (status, created_at desc);

alter table public.jarvis_ceo_agent_commands enable row level security;
