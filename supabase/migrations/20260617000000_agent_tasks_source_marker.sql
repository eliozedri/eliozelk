-- Mark where an agent_task came from so a scanner only auto-resolves the tasks
-- IT produced (never OCR / dialogue / manual review tasks). Additive,
-- non-destructive. Applied to prod 2026-05-31. Existing rows = scanner-created
-- → default 'scan' is correct. Rollback: drop column.
alter table public.agent_tasks add column if not exists source text not null default 'scan';
create index if not exists idx_agent_tasks_source on public.agent_tasks(source);
