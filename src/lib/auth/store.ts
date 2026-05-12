import type { UserProfile, Role } from "@/types/auth";
import { ROLE_DEFAULTS } from "@/types/auth";
import { hashPassword } from "./crypto";
import { SEED_USERS } from "./seed-users";

const STORE_KEY = "elkayam_users";

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

function load(): StoredUser[] {
  if (typeof window === "undefined") return SEED_USERS as StoredUser[];
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (!stored && SEED_USERS.length > 0) {
      localStorage.setItem(STORE_KEY, JSON.stringify(SEED_USERS));
      return SEED_USERS as StoredUser[];
    }
    return JSON.parse(stored ?? "[]");
  } catch {
    return [];
  }
}

function save(users: StoredUser[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(users));
}

export function loadUsers(): UserProfile[] {
  return load().map(({ passwordHash: _h, ...u }) => u);
}

export function getUserById(id: string): UserProfile | null {
  const u = load().find((u) => u.id === id);
  if (!u) return null;
  const { passwordHash: _h, ...profile } = u;
  return profile;
}

export function getUserByEmail(email: string): StoredUser | null {
  return load().find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function hasMaster(): boolean {
  return load().some((u) => u.role === "master");
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: Role;
  allowed_tabs?: string[];
  action_permissions?: string[];
}): Promise<UserProfile> {
  const users = load();
  if (users.find((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
    throw new Error("כתובת אימייל כבר קיימת במערכת");
  }

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

  save([...users, newUser]);
  const { passwordHash: _h, ...profile } = newUser;
  return profile;
}

export function updateUser(id: string, updates: Partial<Omit<StoredUser, "id" | "created_at" | "passwordHash">>): UserProfile {
  const users = load();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error("משתמש לא נמצא");

  users[idx] = { ...users[idx], ...updates, updated_at: new Date().toISOString() };
  save(users);
  const { passwordHash: _h, ...profile } = users[idx];
  return profile;
}

export async function changePassword(id: string, newPassword: string): Promise<void> {
  const users = load();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error("משתמש לא נמצא");
  users[idx].passwordHash = await hashPassword(newPassword);
  users[idx].updated_at = new Date().toISOString();
  save(users);
}

export function deleteUser(id: string) {
  const users = load();
  const masters = users.filter((u) => u.role === "master");
  const target = users.find((u) => u.id === id);
  if (target?.role === "master" && masters.length <= 1) {
    throw new Error("לא ניתן למחוק את המנהל הראשי האחרון");
  }
  save(users.filter((u) => u.id !== id));
}

export function getRawUsers(): StoredUser[] {
  return load();
}

export function touchLastLogin(id: string) {
  const users = load();
  const idx = users.findIndex((u) => u.id === id);
  if (idx !== -1) {
    users[idx].last_login_at = new Date().toISOString();
    save(users);
  }
}
