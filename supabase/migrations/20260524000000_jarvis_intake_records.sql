-- ====================================================================
-- JARVIS intake records — Phase 2.0l write target.
--
-- Owned by the JARVIS↔Elkayam integration. Every live `/api/jarvis/intake`
-- request that passes all three safety gates (JARVIS_INTAKE_LIVE,
-- JARVIS_INTAKE_ALLOWED_ACTIONS, body.dry_run !== true) lands a row
-- here. This table is fully reversible — it never touches work_orders,
-- agent_tasks, customers, billing, schedules, inventory, or equipment.
--
-- A later phase will add a dispatcher that converts queued rows here
-- into agent_tasks, but only when explicitly enabled.
--
-- Idempotency is enforced by the UNIQUE constraint on jarvis_request_id.
-- ====================================================================

create table if not exists public.jarvis_intake_records (
  id                         uuid primary key default gen_random_uuid(),
  jarvis_request_id          text not null unique,
  source_channel             text not null,
  source_sender_id           text,
  source_message_text        text,
  jarvis_approval_id         text,
  recommended_action         text not null,
  intent_type                text not null,
  life_domain                text not null,
  extracted_entities         jsonb not null default '{}'::jsonb,
  payload                    jsonb not null default '{}'::jsonb,
  status                     text not null default 'queued'
                               check (status in (
                                 'queued',
                                 'duplicate_blocked',
                                 'needs_clarification',
                                 'dispatched',
                                 'dismissed',
                                 'failed'
                               )),
  duplicate_warning          text,
  related_customer           text,
  related_work_order_id      text,
  dispatched_agent_task_id   uuid references public.agent_tasks(id) on delete set null,
  notes                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

alter table public.jarvis_intake_records enable row level security;

drop policy if exists "auth_all_jarvis_intake_records" on public.jarvis_intake_records;
create policy "auth_all_jarvis_intake_records" on public.jarvis_intake_records
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create index if not exists idx_jarvis_intake_records_status
  on public.jarvis_intake_records(status);

create index if not exists idx_jarvis_intake_records_action
  on public.jarvis_intake_records(recommended_action);

create index if not exists idx_jarvis_intake_records_customer
  on public.jarvis_intake_records(related_customer)
  where related_customer is not null;

drop trigger if exists jarvis_intake_records_updated_at on public.jarvis_intake_records;
create trigger jarvis_intake_records_updated_at
  before update on public.jarvis_intake_records
  for each row execute function public.handle_updated_at();
