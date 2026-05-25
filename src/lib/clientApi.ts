// Generic authed fetch for client components calling our API routes.
"use client";

import { getSupabase } from "@/lib/supabase/client";

async function bearer(): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await bearer();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const isForm = init?.body instanceof FormData;
  if (init?.body && !isForm && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(url, { ...init, headers });
}

export async function authedJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(url, init);
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? `שגיאה (${res.status})`);
  }
  return (await res.json()) as T;
}
