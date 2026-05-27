"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { UserProfile } from "@/types/auth";
import { getSupabase } from "@/lib/supabase/client";
import { touchLastLogin } from "@/lib/auth/store";

// Auth lifecycle status. The key principle: a failed *data* query (profile /
// permissions / RLS / network) must NEVER be conflated with "no authenticated
// session". Only a verified absent/invalid session is "unauthenticated".
//   loading         — still resolving the session / first profile load
//   authenticated   — session valid AND active profile loaded
//   unauthenticated — no Supabase session at all (genuine logout)
//   no-profile      — session valid but no profiles row exists for the user
//   inactive        — session valid, profile exists but is_active = false
//   error           — session valid but the profile query failed (transient)
export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "no-profile"
  | "inactive"
  | "error";

interface AuthContextValue {
  profile: UserProfile | null;
  /** Back-compat: true only while the very first resolution is in flight. */
  loading: boolean;
  status: AuthStatus;
  logout: () => Promise<void>;
  /** Re-fetch the profile for the current session WITHOUT ever signing out. */
  refreshProfile: () => Promise<void>;
  /** Retry after a transient profile-load error. */
  retry: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  profile: null,
  loading: true,
  status: "loading",
  logout: async () => {},
  refreshProfile: async () => {},
  retry: async () => {},
});

type ProfileResult =
  | { kind: "ok"; profile: UserProfile }
  | { kind: "missing" }
  | { kind: "error" };

function mapRow(data: Record<string, unknown>): UserProfile {
  return {
    id: data.id as string,
    email: data.email as string,
    name: data.name as string,
    role: data.role as UserProfile["role"],
    is_active: data.is_active as boolean,
    allowed_tabs: data.allowed_tabs as string[],
    action_permissions: data.action_permissions as string[],
    last_login_at: data.last_login_at as string | null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

// Distinguishes the three outcomes that the old code collapsed into `null`:
//   - a real row            → ok
//   - no row for this user  → missing   (PostgREST code PGRST116)
//   - any other failure     → error     (network, RLS, timeout, 5xx …)
async function fetchProfile(userId: string): Promise<ProfileResult> {
  const db = getSupabase();
  if (!db) return { kind: "error" };
  try {
    const { data, error } = await db
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // PGRST116 = "Results contain 0 rows" (only with .single()); with
      // .maybeSingle() a missing row yields data === null and no error. Any
      // error object here is therefore a genuine query failure, not "no row".
      console.error("[auth] fetchProfile query failed:", error.code, error.hint ?? error.message);
      return { kind: "error" };
    }
    if (!data) return { kind: "missing" };
    return { kind: "ok", profile: mapRow(data as Record<string, unknown>) };
  } catch (e) {
    // Network throw (offline, DNS, CORS, aborted) — transient, never a logout.
    console.error("[auth] fetchProfile threw:", e instanceof Error ? e.message : e);
    return { kind: "error" };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  // Tracks whether the first resolution has happened (drives `loading`).
  const [loading, setLoading] = useState(true);
  // Keep the latest profile available inside callbacks without re-subscribing.
  const profileRef = useRef<UserProfile | null>(null);
  profileRef.current = profile;

  // Loads the profile for a known session user. `isRefresh` = there is already
  // a resolved session in the UI, so a transient failure must be NON-destructive
  // (keep showing the current profile rather than blanking / logging out).
  const loadProfile = useCallback(async (userId: string, isRefresh = false) => {
    const result = await fetchProfile(userId);

    if (result.kind === "ok") {
      if (!result.profile.is_active) {
        // Verified authorization revocation — controlled "disabled" state,
        // NOT a silent redirect. The session stays until the user acts.
        console.warn("[auth] profile is inactive:", userId);
        setProfile(null);
        setStatus("inactive");
        setLoading(false);
        return;
      }
      setProfile(result.profile);
      setStatus("authenticated");
      setLoading(false);
      return;
    }

    if (result.kind === "missing") {
      // Session is valid but there is no profile row. This is a real data gap,
      // not a transient error — but it is still NOT a reason to nuke the
      // session. Surface a controlled state so an admin can fix the row.
      console.error("[auth] no profile row for authenticated user:", userId);
      if (!isRefresh) setProfile(null);
      setStatus(isRefresh && profileRef.current ? "authenticated" : "no-profile");
      setLoading(false);
      return;
    }

    // result.kind === "error" — transient. NEVER sign out, NEVER redirect.
    if (isRefresh && profileRef.current) {
      // We already have a good profile on screen; keep it. The refresh simply
      // didn't update anything this time.
      console.warn("[auth] profile refresh failed (transient) — keeping current profile");
      setLoading(false);
      return;
    }
    // First load failed: show a retry state, but the session is intact.
    setProfile(null);
    setStatus("error");
    setLoading(false);
  }, []);

  // Resolve the current session, then its profile. Used on mount + retry.
  const resolveSession = useCallback(async () => {
    const db = getSupabase();
    if (!db) {
      setStatus("unauthenticated");
      setLoading(false);
      return;
    }
    const { data: { session } } = await db.auth.getSession();
    if (session?.user) {
      await loadProfile(session.user.id);
    } else {
      setProfile(null);
      setStatus("unauthenticated");
      setLoading(false);
    }
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    const db = getSupabase();
    if (!db) return;
    const { data: { session } } = await db.auth.getSession();
    if (session?.user) {
      // isRefresh=true → a transient failure here cannot log the user out or
      // blank their profile (fixes logout after Add/Edit user on iPad).
      await loadProfile(session.user.id, true);
    }
    // No session → do nothing. We do NOT force a redirect here; the auth state
    // listener / middleware own genuine logout.
  }, [loadProfile]);

  const retry = useCallback(async () => {
    setStatus("loading");
    setLoading(true);
    await resolveSession();
  }, [resolveSession]);

  useEffect(() => {
    const db = getSupabase();
    if (!db) {
      setStatus("unauthenticated"); // eslint-disable-line react-hooks/set-state-in-effect
      setLoading(false); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }

    resolveSession();

    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        loadProfile(session.user.id);
        touchLastLogin();
      } else if (event === "SIGNED_OUT") {
        // Genuine sign-out (token revoked / explicit logout).
        setProfile(null);
        setStatus("unauthenticated");
        setLoading(false);
      }
      // TOKEN_REFRESHED / USER_UPDATED: session still valid — no action.
    });

    return () => subscription.unsubscribe();
  }, [resolveSession, loadProfile]);

  const logout = useCallback(async () => {
    const db = getSupabase();
    await db?.auth.signOut();
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ profile, loading, status, logout, refreshProfile, retry }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
