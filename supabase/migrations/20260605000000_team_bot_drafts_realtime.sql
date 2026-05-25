-- Add team_bot_order_drafts to the supabase_realtime publication so the Sidebar
-- "הזמנות מהבוט" badge updates live: it counts status='pending_review' drafts
-- (bot / JARVIS / external web-form order requests awaiting staff approval) and
-- must react when a new request lands or one is promoted/rejected.
--
-- Idempotent — mirrors the guard used by the existing realtime publication setup.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'team_bot_order_drafts'
  ) then
    alter publication supabase_realtime add table public.team_bot_order_drafts;
  end if;
end $$;
