"use client";

import { useEffect, useRef, useState } from "react";
import { useAgentChat } from "@/hooks/useAgentChat";
import type { CommMessage } from "@/types/agentChat";

// ── Colors (match AgentCommandCenter) ────────────────────────────────────────

const NAVY     = "#0d1b2e";
const NAVY_MID = "#1a2d4a";
const EK_BLUE  = "#1d6fd8";

// ── Icons ─────────────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeOpacity="0.3"/>
      <path d="M12 2v4"/>
    </svg>
  );
}

// ── Message renderer ──────────────────────────────────────────────────────────

function renderContent(text: string) {
  // Split into lines, apply simple **bold** substitution
  return text.split("\n").map((line, i) => {
    const parts = line.split(/\*\*(.+?)\*\*/g);
    const rendered = parts.map((p, j) =>
      j % 2 === 1 ? <strong key={j} className="font-bold text-white">{p}</strong> : <span key={j}>{p}</span>
    );
    return (
      <p key={i} className={`leading-relaxed ${line.trim() === "" ? "h-2" : ""}`}>
        {rendered}
      </p>
    );
  });
}

// ── Individual message bubble ─────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: CommMessage }) {
  const isUser = msg.sender_type === "user";

  if (isUser) {
    return (
      <div className="flex justify-start" dir="rtl">
        <div
          className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm"
          style={{ backgroundColor: EK_BLUE, color: "white" }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end" dir="rtl">
      <div
        className="max-w-[90%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white/80 space-y-0.5"
        style={{ backgroundColor: NAVY_MID, border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {renderContent(msg.content)}
        {msg.source_references && msg.source_references.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-white/10">
            <p className="text-[10px] text-white/30 mb-1.5">מקורות:</p>
            <div className="flex flex-wrap gap-1.5">
              {msg.source_references.map((ref, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/50"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                >
                  {ref.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quick prompt chips ─────────────────────────────────────────────────────────

const MASTER_CHIPS = [
  "מה הכי דחוף היום?",
  "מה ממתין לאישורי?",
  "תסכם לי את המצב",
  "איזה יומנים ממתינים?",
  "מה ממתין לחיוב?",
];

const AGENT_CHIPS = [
  "מה הכי דחוף?",
  "תסכם לי את הממצאים",
  "איזה חריגות פתוחות?",
  "מה המשימות הפתוחות?",
];

// ── ChatDrawer ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
  agentName?: string;
  agentIcon?: string;
}

export function ChatDrawer({ isOpen, onClose, agentId, agentName, agentIcon }: Props) {
  const { messages, sending, loading, error, initialize, sendMessage } = useAgentChat(agentId);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (isOpen && !hasInitialized.current) {
      hasInitialized.current = true;
      void initialize();
    }
  }, [isOpen, initialize]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    await sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function handleChip(chip: string) {
    if (sending) return;
    setInput("");
    await sendMessage(chip);
  }

  const chips = agentId ? AGENT_CHIPS : MASTER_CHIPS;
  const displayName = agentName ?? "מרכז הפיקוד";
  const displayIcon = agentIcon ?? "🤖";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer panel — slides in from right */}
      <div
        className="relative mr-auto w-full max-w-md flex flex-col shadow-2xl"
        style={{ backgroundColor: NAVY, borderRight: `1px solid ${NAVY_MID}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}
        >
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors p-1 rounded"
          >
            <CloseIcon />
          </button>
          <div className="flex items-center gap-2.5">
            <div>
              <p className="text-[10px] text-white/40 text-right">שיחה עם</p>
              <h2 className="text-base font-bold text-white text-right">{displayName}</h2>
            </div>
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: `${EK_BLUE}33`, border: `1px solid ${EK_BLUE}50` }}
            >
              {displayIcon}
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading && messages.length === 0 && (
            <div className="flex items-center justify-center py-8 gap-2 text-white/30 text-sm">
              <SpinnerIcon />
              טוען שיחה...
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-3"
                style={{ backgroundColor: `${EK_BLUE}20` }}
              >
                {displayIcon}
              </div>
              <p className="text-sm font-semibold text-white/60 mb-1">{displayName}</p>
              <p className="text-xs text-white/30 max-w-[200px] leading-relaxed">
                שאל שאלה על מצב העסק, חריגות, אישורים, חיוב, ועוד.
              </p>
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {sending && (
            <div className="flex justify-end">
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm text-white/40"
                style={{ backgroundColor: NAVY_MID, border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <SpinnerIcon />
                מחשב...
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 text-center py-2">{error}</div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick chips */}
        {messages.length === 0 && !loading && (
          <div
            className="px-4 pb-3 shrink-0"
            style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }}
          >
            <p className="text-[10px] text-white/30 mb-2 pt-3">שאלות מהירות:</p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map(chip => (
                <button
                  key={chip}
                  onClick={() => void handleChip(chip)}
                  disabled={sending}
                  className="text-xs px-2.5 py-1 rounded-full text-white/60 transition-colors hover:text-white/90 disabled:opacity-40"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div
          className="px-4 py-3 shrink-0"
          style={{ borderTop: `1px solid rgba(255,255,255,0.08)` }}
        >
          <div
            className="flex items-end gap-2 rounded-xl px-3 py-2"
            style={{ backgroundColor: NAVY_MID, border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="שאל שאלה..."
              disabled={sending}
              rows={1}
              className="flex-1 bg-transparent text-sm text-white placeholder-white/30 resize-none outline-none leading-relaxed min-h-[24px] max-h-[80px]"
              style={{ direction: "rtl" }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || sending}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
              style={{ backgroundColor: input.trim() && !sending ? EK_BLUE : "rgba(255,255,255,0.08)", color: "white" }}
            >
              {sending ? <SpinnerIcon /> : <SendIcon />}
            </button>
          </div>
          <p className="text-[10px] text-white/20 text-center mt-1.5">
            Enter לשליחה · Shift+Enter לשורה חדשה
          </p>
        </div>
      </div>
    </div>
  );
}
