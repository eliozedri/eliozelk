import { getSupabase } from "@/lib/supabase/client";

async function getBearerToken(): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session?.access_token ?? null;
}

async function post(path: string, payload: unknown): Promise<boolean> {
  const token = await getBearerToken();
  if (!token) return false;
  const res = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[notifications] ${path} failed:`, res.status, text);
    return false;
  }
  return true;
}

export const notificationsApi = {
  seen: (recipientIds: string[]) => post("/api/notifications/seen", { recipientIds }),
  markOpened: (recipientId: string) => post("/api/notifications/mark-opened", { recipientId }),
  acknowledge: (recipientId: string) => post("/api/notifications/acknowledge", { recipientId }),
  reportProblem: (recipientId: string, description?: string) =>
    post("/api/notifications/report-problem", { recipientId, description }),
  demo: (eventType: string) => post("/api/notifications/demo", { eventType }),
  updateRule: (ruleId: string, changes: Record<string, unknown>) =>
    post("/api/notifications/rules/update", { ruleId, changes }),
};
