-- Extend jarvis_dev_tasks for the GitHub / Claude Code integration (additive).
-- Records whether a GitHub action was attempted and any resulting issue/PR/workflow URLs, so the
-- full development trail (request → task → GitHub artifact) is auditable. Service-role only.

alter table public.jarvis_dev_tasks
  add column if not exists repo                   text,
  add column if not exists github_action_attempted boolean not null default false,
  add column if not exists issue_url              text,
  add column if not exists pr_url                 text,
  add column if not exists workflow_run_url        text,
  add column if not exists updated_at             timestamptz not null default now();
