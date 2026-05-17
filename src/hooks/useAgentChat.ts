"use client";

import { useState, useCallback, useRef } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { CommThread, CommMessage } from "@/types/agentChat";

async function getBearerToken(): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session?.access_token ?? null;
}

export function useAgentChat(agentId?: string | null, existingThreadId?: string | null) {
  const [thread, setThread] = useState<CommThread | null>(null);
  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const ensureThread = useCallback(async (): Promise<CommThread | null> => {
    if (thread) return thread;
    const token = await getBearerToken();
    if (!token) return null;

    // Meeting mode: use the pre-created thread directly
    if (existingThreadId) {
      const stub = { id: existingThreadId, agent_id: agentId ?? null } as CommThread;
      setThread(stub);
      return stub;
    }

    // Try to find existing active thread for this agent
    const listUrl = agentId
      ? `/api/agents/chat/threads?agentId=${encodeURIComponent(agentId)}`
      : `/api/agents/chat/threads`;

    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (listRes.ok) {
      const existing = (await listRes.json()) as CommThread[];
      if (existing.length > 0) {
        setThread(existing[0]);
        return existing[0];
      }
    }

    // Create new thread
    const createRes = await fetch("/api/agents/chat/threads", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: agentId ?? null }),
    });
    if (!createRes.ok) return null;
    const newThread = (await createRes.json()) as CommThread;
    setThread(newThread);
    return newThread;
  }, [thread, agentId, existingThreadId]);

  const loadMessages = useCallback(async (t: CommThread) => {
    const token = await getBearerToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/chat/messages?threadId=${t.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessages((await res.json()) as CommMessage[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const initialize = useCallback(async () => {
    if (initialized.current) return;
    initialized.current = true;
    const t = await ensureThread();
    if (t) await loadMessages(t);
  }, [ensureThread, loadMessages]);

  const deleteChat = useCallback(async (): Promise<boolean> => {
    if (!thread) return true; // nothing to delete
    const token = await getBearerToken();
    if (!token) return false;
    const res = await fetch("/api/agents/chat/threads", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id }),
    });
    if (!res.ok) return false;
    setThread(null);
    setMessages([]);
    initialized.current = false;
    return true;
  }, [thread]);

  const sendMessage = useCallback(async (content: string): Promise<void> => {
    const token = await getBearerToken();
    if (!token || !content.trim()) return;

    setSending(true);
    setError(null);

    try {
      let t = thread;
      if (!t) t = await ensureThread();
      if (!t) throw new Error("לא ניתן ליצור שיחה");

      const res = await fetch("/api/agents/chat/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: t.id, content: content.trim() }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "שגיאה בשליחת ההודעה");
      }

      const { userMessage, agentMessage } = (await res.json()) as {
        userMessage: CommMessage;
        agentMessage: CommMessage;
      };
      setMessages(prev => [...prev, userMessage, agentMessage]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setSending(false);
    }
  }, [thread, ensureThread]);

  return { thread, messages, sending, loading, error, initialize, sendMessage, deleteChat };
}
