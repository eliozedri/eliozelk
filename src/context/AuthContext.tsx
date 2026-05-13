"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { UserProfile } from "@/types/auth";
import { getSession, clearSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/store";

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  profile: null,
  loading: true,
  logout: () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const session = getSession();
    if (!session) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const user = await getUserById(session.userId);
    setProfile(user);
    setLoading(false);
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const logout = useCallback(() => {
    clearSession();
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ profile, loading, logout, refreshProfile: loadProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
