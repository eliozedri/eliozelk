-- Authenticated users can update only their own last_login_at via this function.
-- SECURITY DEFINER: runs as the function owner (service), not the calling user.
-- This avoids giving clients an UPDATE policy on the profiles table (which could
-- allow role escalation).
create or replace function public.touch_last_login()
returns void language sql security definer as $$
  update public.profiles
  set last_login_at = now(), updated_at = now()
  where id = auth.uid();
$$;

-- Allow authenticated users (not anon) to call this function
revoke execute on function public.touch_last_login() from anon;
grant execute on function public.touch_last_login() to authenticated;
