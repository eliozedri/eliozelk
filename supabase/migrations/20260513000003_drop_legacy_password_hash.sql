-- Remove password_hash column from the legacy public.users table.
-- All credentials are now managed exclusively by Supabase Auth (auth.users).
-- The public.users table is retained temporarily for the bridge migration period
-- (existing users who haven't logged in yet still have their profile seeded from here),
-- but their credentials must not live in this column any longer.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'password_hash'
  ) then
    alter table public.users drop column password_hash;
  end if;
end $$;
