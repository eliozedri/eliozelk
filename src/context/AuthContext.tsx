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
  if (error || !data) return null;
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
    if (p && !p.is_active) {
      // Block inactive users: sign out immediately
      const db = getSupabase();
      await db?.auth.signOut();
      setProfile(null);
    } else {
      setProfile(p);
    }
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

    // Get current session on mount
    db.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Keep profile in sync with auth state changes
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        loadProfile(session.user.id);
        touchLastLogin(); // fire-and-forget
      } else if (event === "SIGNED_OUT") {
        setProfile(null);
        setLoading(false);
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        // Silently refresh — profile stays the same
      }
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
