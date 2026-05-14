import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// createBrowserClient (from @supabase/ssr) stores the session in BOTH
// localStorage AND cookies, so the Next.js middleware (createServerClient)
// can read it on every server-side request. The plain createClient from
// @supabase/supabase-js only uses localStorage — middleware never sees the
// session, causing a redirect loop back to /login after every successful login.

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null; // server-side guard
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _client = createBrowserClient(url, key);
  return _client;
}
