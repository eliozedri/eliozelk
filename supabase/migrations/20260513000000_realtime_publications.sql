-- Enable Realtime for all application tables.
-- REPLICA IDENTITY FULL is required so DELETE events include the old row data
-- (specifically the `id` field used to remove records from client state).

alter table public.work_orders replica identity full;
alter table public.work_diaries replica identity full;
alter table public.crews replica identity full;
alter table public.catalog_items replica identity full;
alter table public.customers replica identity full;

-- Add tables to the supabase_realtime publication so postgres_changes
-- subscriptions receive INSERT / UPDATE / DELETE events.
alter publication supabase_realtime add table public.work_orders;
alter publication supabase_realtime add table public.work_diaries;
alter publication supabase_realtime add table public.crews;
alter publication supabase_realtime add table public.catalog_items;
alter publication supabase_realtime add table public.customers;
