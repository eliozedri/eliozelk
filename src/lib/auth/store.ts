import type { UserProfile, Role } from "@/types/auth";
import { ROLE_DEFAULTS } from "@/types/auth";
import { hashPassword } from "./crypto";
import { getSupabase } from "@/lib/supabase/client";

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

// ── Local cache helpers (session user only) ───────────────────────────────────

const LOCAL_KEY = "elkayam_users";

function localLoad(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]"); } catch { return []; }
}

function localSave(users: StoredUser[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(users)); } catch { /* ignore */ }
}

function localUpsert(user: StoredUser) {
  const all = localLoad();
  const idx = all.findIndex(u => u.id === user.id);
  if (idx === -1) all.push(user); else all[idx] = user;
  localSave(all);
}

// ── Supabase row mapping ───────────────────────────────────────────────────────

function fromRow(r: Record<string, unknown>): StoredUser {
  return {
    id: r.id as string,
    email: r.email as string,
    name: r.name as string,
    role: r.role as Role,
    is_active: r.is_active as boolean,
    allowed_tabs: r.allowed_tabs as string[],
    action_permissions: r.action_permissions as string[],
    passwordHash: r.password_hash as string,
    last_login_at: r.last_login_at as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function toRow(u: StoredUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    is_active: u.is_active,
    allowed_tabs: u.allowed_tabs,
    action_permissions: u.action_permissions,
    password_hash: u.passwordHash,
    last_login_at: u.last_login_at ?? null,
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

// ── Bootstrapping: push localStorage users to Supabase on first sync ──────────

async function bootstrapIfNeeded(db: ReturnType<typeof getSupabase>): Promise<void> {
  if (!db) return;
  try {
    const { data, error } = await db.from("users").select("id").limit(1);
    if (!error && data && data.length === 0) {
      const local = localLoad();
      if (local.length > 0) {
        await db.from("users").upsert(local.map(toRow), { onConflict: "id" });
      }
    }
  } catch { /* ignore */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadUsers(): Promise<UserProfile[]> {
  const db = getSupabase();
  if (db) {
    try {
      await bootstrapIfNeeded(db);
      const { data, error } = await db.from("users").select("*").order("created_at");
      if (!error && data) {
        const users = data.map(r => fromRow(r as Record<string, unknown>));
        localSave(users);
        return users.map(({ passwordHash: _h, ...u }) => u);
      }
    } catch { /* fall through */ }
  }
  return localLoad().map(({ passwordHash: _h, ...u }) => u);
}

export async function getUserById(id: string): Promise<UserProfile | null> {
  // Fast path: local cache
  const cached = localLoad().find(u => u.id === id);

  const db = getSupabase();
  if (db) {
    try {
      const { data, error } = await db.from("users").select("*").eq("id", id).single();
      if (!error && data) {
        const user = fromRow(data as Record<string, unknown>);
        localUpsert(user);
        const { passwordHash: _h, ...profile } = user;
        return profile;
      }
    } catch { /* fall through */ }
  }

  if (cached) {
    const { passwordHash: _h, ...profile } = cached;
    return profile;
  }
  return null;
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const db = getSupabase();
  if (db) {
    try {
      await bootstrapIfNeeded(db);
      const { data, error } = await db
        .from("users")
        .select("*")
        .ilike("email", email)
        .single();
      if (!error && data) {
        const user = fromRow(data as Record<string, unknown>);
        localUpsert(user);
        return user;
      }
    } catch { /* fall through */ }
  }

  // Fallback: localStorage
  return localLoad().find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function hasMaster(): Promise<boolean> {
  const db = getSupabase();
  if (db) {
    try {
      await bootstrapIfNeeded(db);
      const { data, error } = await db
        .from("users")
        .select("id")
        .eq("role", "master")
        .eq("is_active", true)
        .limit(1);
      if (!error) return (data?.length ?? 0) > 0;
    } catch { /* fall through */ }
  }
  return localLoad().some(u => u.role === "master");
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: Role;
  allowed_tabs?: string[];
  action_permissions?: string[];
}): Promise<UserProfile> {
  const defaults = ROLE_DEFAULTS[data.role];
  const now = new Date().toISOString();
  const newUser: StoredUser = {
    id: crypto.randomUUID(),
    email: data.email,
    name: data.name,
    role: data.role,
    is_active: true,
    allowed_tabs: data.allowed_tabs ?? (defaults.tabs as string[]),
    action_permissions: data.action_permissions ?? (defaults.actions as string[]),
    last_login_at: null,
    created_at: now,
    updated_at: now,
    passwordHash: await hashPassword(data.password),
  };

  const db = getSupabase();
  if (db) {
    const { error } = await db.from("users").insert(toRow(newUser));
    if (error) {
      if (error.code === "23505") throw new Error("כתובת אימייל כבר קיימת במערכת");
      throw new Error(`שגיאה ביצירת המשתמש: ${error.message}`);
    }
  } else {
    // Fallback: localStorage only
    const existing = localLoad();
    if (existing.find(u => u.email.toLowerCase() === data.email.toLowerCase())) {
      throw new Error("כתובת אימייל כבר קיימת במערכת");
    }
  }

  localUpsert(newUser);
  const { passwordHash: _h, ...profile } = newUser;
  return profile;
}

export async function updateUser(
  id: string,
  updates: Partial<Omit<StoredUser, "id" | "created_at" | "passwordHash">>
): Promise<UserProfile> {
  const now = new Date().toISOString();
  const local = localLoad();
  const idx = local.findIndex(u => u.id === id);
  if (idx === -1) throw new Error("משתמש לא נמצא");

  const updated: StoredUser = { ...local[idx], ...updates, updated_at: now };

  const db = getSupabase();
  if (db) {
    const { error } = await db.from("users").update(toRow(updated)).eq("id", id);
    if (error) throw new Error(`שגיאה בעדכון המשתמש: ${error.message}`);
  }

  localUpsert(updated);
  const { passwordHash: _h, ...profile } = updated;
  return profile;
}

export async function deleteUser(id: string): Promise<void> {
  const db = getSupabase();
  let users: StoredUser[];

  if (db) {
    const { data, error } = await db.from("users").select("id, role");
    if (error) throw new Error(`שגיאה במחיקת המשתמש: ${error.message}`);
    users = (data ?? []).map(r => r as unknown as StoredUser);
  } else {
    users = localLoad();
  }

  const masters = users.filter(u => u.role === "master");
  const target = users.find(u => u.id === id);
  if (target?.role === "master" && masters.length <= 1) {
    throw new Error("לא ניתן למחוק את המנהל הראשי האחרון");
  }

  if (db) {
    const { error } = await db.from("users").delete().eq("id", id);
    if (error) throw new Error(`שגיאה במחיקת המשתמש: ${error.message}`);
  }

  localSave(localLoad().filter(u => u.id !== id));
}

export async function touchLastLogin(id: string): Promise<void> {
  const now = new Date().toISOString();
  const db = getSupabase();
  if (db) {
    db.from("users").update({ last_login_at: now, updated_at: now }).eq("id", id).then(() => {});
  }
  const local = localLoad();
  const idx = local.findIndex(u => u.id === id);
  if (idx !== -1) {
    local[idx].last_login_at = now;
    localSave(local);
  }
}
