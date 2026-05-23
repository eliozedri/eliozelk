import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { canPerformAction, type ActionPermission, type Role, type UserProfile } from "@/types/auth";

// Server-side authorization, mirroring the client model in src/types/auth.ts.
// This is the single source of truth for API-route auth — routes should not
// re-implement token parsing or role checks inline.

export interface AuthedUser {
  id: string;
  profile: UserProfile;
}

function bearerToken(req: NextRequest): string | null {
  const raw = req.headers.get("authorization") ?? "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 ? token : null;
}

function toProfile(id: string, row: Record<string, unknown>): UserProfile {
  return {
    id,
    email: (row.email as string) ?? "",
    name: (row.name as string) ?? "",
    role: (row.role as Role) ?? "viewer",
    is_active: row.is_active !== false,
    allowed_tabs: Array.isArray(row.allowed_tabs) ? (row.allowed_tabs as string[]) : [],
    action_permissions: Array.isArray(row.action_permissions) ? (row.action_permissions as string[]) : [],
    last_login_at: (row.last_login_at as string | null) ?? null,
    created_at: (row.created_at as string) ?? "",
    updated_at: (row.updated_at as string) ?? "",
  };
}

// Resolve a bearer token to an active user profile, or null when the token is
// missing/invalid or the profile is missing/inactive.
export async function authenticate(req: NextRequest): Promise<AuthedUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const admin = getServiceSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  const { data: row } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!row) return null;
  const profile = toProfile(user.id, row as Record<string, unknown>);
  if (!profile.is_active) return null;
  return { id: user.id, profile };
}

export type AuthGuard =
  | { ok: true; user: AuthedUser }
  | { ok: false; response: NextResponse };

function deny(status: number, error: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

// Require an authenticated, active user (no specific permission).
export async function requireAuth(req: NextRequest): Promise<AuthGuard> {
  const user = await authenticate(req);
  if (!user) return deny(401, "Unauthorized");
  return { ok: true, user };
}

// Require a specific action permission. master and the "*" wildcard always pass
// (see canPerformAction), and per-user action_permissions overrides are honored.
export async function requireAction(req: NextRequest, action: ActionPermission): Promise<AuthGuard> {
  const user = await authenticate(req);
  if (!user) return deny(401, "Unauthorized");
  if (!canPerformAction(user.profile, action)) return deny(403, "Forbidden");
  return { ok: true, user };
}

// Require membership in an explicit role set, for sensitive actions that have no
// matching ActionPermission. master always passes.
export async function requireRole(req: NextRequest, roles: Role[]): Promise<AuthGuard> {
  const user = await authenticate(req);
  if (!user) return deny(401, "Unauthorized");
  if (user.profile.role !== "master" && !roles.includes(user.profile.role)) {
    return deny(403, "Forbidden");
  }
  return { ok: true, user };
}
