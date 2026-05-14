// Application user management — reads/writes public.profiles only.
// All auth.users operations go through /api/admin/users (service role).
import type { UserProfile } from "@/types/auth";
import { getSupabase } from "@/lib/supabase/client";

function fromRow(r: Record<string, unknown>): UserProfile {
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

export async function loadUsers(): Promise<UserProfile[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db.from("profiles").select("*").order("created_at");
  if (error || !data) return [];
  return data.map(r => fromRow(r as Record<string, unknown>));
}

export async function getUserById(id: string): Promise<UserProfile | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.from("profiles").select("*").eq("id", id).single();
  if (error || !data) return null;
  return fromRow(data as Record<string, unknown>);
}

export async function hasMaster(): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  const { data } = await db.from("profiles").select("id").eq("role", "master").eq("is_active", true).limit(1);
  return (data?.length ?? 0) > 0;
}

// createUser / updateUser / deleteUser — proxied through the server API route.
// The caller (AccessManager) must pass the current user's access token so the
// server can verify master permissions.

async function getAccessToken(): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data: { session } } = await db.auth.getSession();
  return session?.access_token ?? null;
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: UserProfile["role"];
  allowed_tabs?: string[];
  action_permissions?: string[];
}): Promise<UserProfile> {
  const token = await getAccessToken();
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "שגיאה ביצירת המשתמש");
  return body as UserProfile;
}

export async function updateUser(
  id: string,
  updates: Partial<Omit<UserProfile, "id" | "created_at">>
): Promise<UserProfile> {
  const token = await getAccessToken();
  const res = await fetch("/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, ...updates }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "שגיאה בעדכון המשתמש");
  return body as UserProfile;
}

export async function deleteUser(id: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch("/api/admin/users", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error ?? "שגיאה במחיקת המשתמש");
  }
}

export async function sendPasswordResetLink(userId: string, email: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch("/api/admin/users", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: userId, action: "reset_password", email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "שגיאה בשליחת קישור איפוס");
  }
}

export async function touchLastLogin(): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  // touch_last_login() is SECURITY DEFINER — updates only the caller's own row
  await db.rpc("touch_last_login");
}
