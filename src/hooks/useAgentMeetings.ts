"use client";

import { useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { AgentMeeting } from "@/types/agentMeeting";

async function getBearerToken(): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session?.access_token ?? null;
}

export function useAgentMeetings() {
  const [meetings, setMeetings] = useState<AgentMeeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMeetings = useCallback(async () => {
    const token = await getBearerToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/agents/meetings?status=active", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMeetings((await res.json()) as AgentMeeting[]);
    } catch { /* silent on network error */ } finally {
      setLoading(false);
    }
  }, []);

  const createMeeting = useCallback(async (params: {
    title: string;
    topic?: string;
    participatingAgents: string[];
  }): Promise<{ meeting: AgentMeeting; threadId: string } | null> => {
    const token = await getBearerToken();
    if (!token) return null;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/meetings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "שגיאה ביצירת הפגישה");
      }
      const result = (await res.json()) as { meeting: AgentMeeting; threadId: string };
      setMeetings(prev => [result.meeting, ...prev]);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
      return null;
    } finally {
      setCreating(false);
    }
  }, []);

  const closeMeeting = useCallback(async (
    meetingId: string,
    status: "completed" | "cancelled"
  ) => {
    const token = await getBearerToken();
    if (!token) return;
    await fetch("/api/agents/meetings", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, status }),
    });
    setMeetings(prev => prev.filter(m => m.id !== meetingId));
  }, []);

  return { meetings, loading, creating, error, loadMeetings, createMeeting, closeMeeting };
}
