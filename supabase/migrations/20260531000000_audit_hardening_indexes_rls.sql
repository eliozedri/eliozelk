-- Audit hardening session (2026-05-23): cover missing FK indexes, remove a
-- duplicate index, and tighten the public profitability_snapshots read policy.
-- All operations are additive / non-destructive — no rows are modified or deleted.

-- 1) Cover unindexed foreign keys. Without a covering index, FK lookups and
--    cascading deletes do sequential scans. CREATE INDEX IF NOT EXISTS is idempotent.
create index if not exists idx_agent_activity_feed_related_agent_id          on public.agent_activity_feed (related_agent_id);
create index if not exists idx_agent_approvals_task_id                       on public.agent_approvals (task_id);
create index if not exists idx_communication_messages_agent_id               on public.communication_messages (agent_id);
create index if not exists idx_communication_messages_sender_user_id         on public.communication_messages (sender_user_id);
create index if not exists idx_communication_suggested_actions_agent_id      on public.communication_suggested_actions (agent_id);
create index if not exists idx_document_duplicate_checks_candidate_id        on public.document_duplicate_checks (candidate_id);
create index if not exists idx_expense_lines_catalog_item_id                 on public.expense_lines (catalog_item_id);
create index if not exists idx_expense_lines_document_line_id                on public.expense_lines (document_line_id);
create index if not exists idx_expense_lines_expense_record_id               on public.expense_lines (expense_record_id);
create index if not exists idx_inventory_consumptions_reservation_id         on public.inventory_consumptions (reservation_id);
create index if not exists idx_jarvis_intake_records_dispatched_agent_task_id on public.jarvis_intake_records (dispatched_agent_task_id);
create index if not exists idx_product_supplier_mappings_source_document_id  on public.product_supplier_mappings (source_document_id);
create index if not exists idx_supplier_documents_linked_delivery_note_id    on public.supplier_documents (linked_delivery_note_id);
create index if not exists idx_team_bot_order_drafts_promoted_order_id       on public.team_bot_order_drafts (promoted_order_id);
create index if not exists idx_team_bot_users_linked_profile_id              on public.team_bot_users (linked_profile_id);

-- 2) Remove the duplicate index on work_orders(status). idx_work_orders_status
--    is retained; work_orders_status_idx is an exact duplicate of it.
drop index if exists public.work_orders_status_idx;

-- 3) Financial profitability snapshots must never be anon-readable. Replace the
--    anon SELECT policy with an authenticated-only one (consistent with the rest
--    of the app, where operational tables are authenticated-readable).
drop policy if exists "anon read snapshots" on public.profitability_snapshots;
create policy "authenticated read snapshots"
  on public.profitability_snapshots
  for select
  to authenticated
  using (true);
