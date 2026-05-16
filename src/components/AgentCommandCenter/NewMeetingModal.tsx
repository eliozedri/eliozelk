"use client";

import { useState } from "react";
import { MEETING_TOPICS } from "@/types/agentMeeting";
import type { Agent } from "@/types/agent";

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";

function CloseIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

interface Props {
  agents: Agent[];
  creating: boolean;
  error: string | null;
  onCreate: (params: { title: string; topic?: string; participatingAgents: string[] }) => void;
  onClose: () => void;
}

export function NewMeetingModal({ agents, creating, error, onCreate, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    new Set(["ops-orchestrator"]) // orchestrator selected by default
  );

  function toggleAgent(id: string) {
    setSelectedAgents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreate() {
    if (!title.trim() || creating) return;
    onCreate({
      title: title.trim(),
      topic: topic.trim() || undefined,
      participatingAgents: [...selectedAgents],
    });
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: NAVY, border: "1px solid rgba(255,255,255,0.1)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors p-1 rounded">
            <CloseIcon />
          </button>
          <div className="text-right">
            <h2 className="text-base font-bold text-white">פתח פגישת סוכנים</h2>
            <p className="text-[11px] text-white/40">שיחה מרובת משתתפים עם נתוני מערכת</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5">כותרת הפגישה *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="לדוגמה: סיכום שבועי עם כל הסוכנים"
              className="w-full bg-white/5 text-white text-sm rounded-xl px-3 py-2.5 placeholder-white/25 outline-none focus:ring-1"
              style={{ border: "1px solid rgba(255,255,255,0.12)", direction: "rtl" }}
              onFocus={e => e.target.style.borderColor = EK_BLUE}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
            />
          </div>

          {/* Topic */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5">נושא הפגישה</label>
            <select
              value={topic}
              onChange={e => setTopic(e.target.value)}
              className="w-full bg-white/5 text-sm rounded-xl px-3 py-2.5 outline-none"
              style={{ border: "1px solid rgba(255,255,255,0.12)", color: topic ? "white" : "rgba(255,255,255,0.3)", direction: "rtl" }}
            >
              <option value="">— בחר נושא (אופציונלי) —</option>
              {MEETING_TOPICS.map(t => (
                <option key={t} value={t} style={{ backgroundColor: NAVY }}>{t}</option>
              ))}
            </select>
          </div>

          {/* Agent selector */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-2">סוכנים משתתפים</label>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {agents.map(agent => (
                <label
                  key={agent.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer transition-all select-none"
                  style={{
                    backgroundColor: selectedAgents.has(agent.id) ? `${EK_BLUE}18` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${selectedAgents.has(agent.id) ? `${EK_BLUE}40` : "rgba(255,255,255,0.07)"}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedAgents.has(agent.id)}
                    onChange={() => toggleAgent(agent.id)}
                    className="accent-blue-500 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-lg shrink-0">{agent.icon ?? "🤖"}</span>
                  <span className="text-sm text-white/80 flex-1 text-right">{agent.name}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: `${agent.color ?? "#666"}22`, color: agent.color ?? "#aaa" }}
                  >
                    {agent.status === "active" ? "פעיל" : "ממתין"}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-white/25 mt-1.5 text-right">
              {selectedAgents.size} סוכנים נבחרו
            </p>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-500/20 rounded-xl px-3 py-2 text-right">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <button
            onClick={onClose}
            disabled={creating}
            className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-all disabled:opacity-40"
          >
            ביטול
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || creating}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{ backgroundColor: EK_BLUE, color: "white" }}
          >
            {creating ? "פותח פגישה..." : "פתח פגישה"}
          </button>
        </div>
      </div>
    </div>
  );
}
