-- Tier-B controlled execution for JARVIS CEO-Agent commands.
--
-- Extends the pending-review queue with the execution workflow:
--   approved → preview_ready → execution_approved → executed | failed → reverted
-- Adds the preview (dry-run), rollback snapshot, and execution result columns.
-- Still additive + service-role only. Execution mutates ONLY catalog_items.default_price
-- (the sell price) for the allowlisted price_update_request action; cost_price,
-- quantities, and all other tables/columns are never touched.

alter table public.jarvis_ceo_agent_commands
  add column if not exists preview_json          jsonb,
  add column if not exists rollback_json          jsonb,
  add column if not exists execution_result       jsonb,
  add column if not exists execution_approved_at  timestamptz,
  add column if not exists executed_at            timestamptz,
  add column if not exists executed_by            text,
  add column if not exists reverted_at            timestamptz;

alter table public.jarvis_ceo_agent_commands
  drop constraint if exists jarvis_ceo_agent_commands_status_check;

alter table public.jarvis_ceo_agent_commands
  add constraint jarvis_ceo_agent_commands_status_check
  check (status in (
    'pending_review','approved','preview_ready','execution_approved',
    'executed','failed','reverted','rejected','needs_info',
    'archived','execution_disabled','executed_later'
  ));
