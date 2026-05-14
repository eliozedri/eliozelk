"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { UserProfile } from "@/types/auth";
import { getSupabase } from "@/lib/supabase/client";
import { touchLastLogin } from "@/lib/auth/store";

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  profile: null,
  loading: true,
  logout: async () => {},
  refreshProfile: async () => {},
});

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    // Log the cause without exposing sensitive data
    console.error("[auth] fetchProfile failed:", error.code, error.hint ?? error.message);
    return null;
  }
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    email: r.email as string,
    name: r.name as string,
    role: r.role as UserProfile["role"],
    is_active: r.is_active as boolean,
    allowed_tabs: r.allowed_tabs as string[],
    action_permissions: r.action_permissions as string[],
    last_login_at: r.last_login_at as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const p = await fetchProfile(userId);

    if (p === null) {
      // Profile not in DB (auth user exists but no profile row) OR transient error.
      // Sign out so the user doesn't end up in a limbo authenticated-but-no-profile state.
      console.error("[auth] no profile found for user id:", userId, "— signing out");
      const db = getSupabase();
      await db?.auth.signOut();
      setProfile(null);
      setLoading(false);
      // Hard redirect so middleware state is also cleared
      if (typeof window !== "undefined") window.location.href = "/login";
      return;
    }

    if (!p.is_active) {
      console.warn("[auth] user is inactive, signing out:", userId);
      const db = getSupabase();
      await db?.auth.signOut();
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(p);
    setLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    const db = getSupabase();
    if (!db) return;
    const { data: { user } } = await db.auth.getUser();
    if (user) await loadProfile(user.id);
  }, [loadProfile]);

  useEffect(() => {
    const db = getSupabase();
    if (!db) {
      setLoading(false);
      return;
    }

    // Check existing session on mount
    db.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Sync profile with auth state changes
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        loadProfile(session.user.id);
        touchLastLogin();
      } else if (event === "SIGNED_OUT") {
        setProfile(null);
        setLoading(false);
      }
      // TOKEN_REFRESHED: session stays valid, profile unchanged — no action needed
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const logout = useCallback(async () => {
    const db = getSupabase();
    await db?.auth.signOut();
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ profile, loading, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
