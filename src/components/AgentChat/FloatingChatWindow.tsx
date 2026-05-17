"use client";

import { useEffect, useRef, useState } from "react";
import { useAgentChat } from "@/hooks/useAgentChat";
import type { CommMessage } from "@/types/agentChat";

// ── Colors (match command-center palette) ─────────────────────────────────────

const NAVY     = "#0d1b2e";
const NAVY_MID = "#1a2d4a";
const EK_BLUE  = "#1d6fd8";

// ── Icons ─────────────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
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

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: CommMessage }) {
  const isUser = msg.sender_type === "user";
  if (isUser) {
    return (
      <div className="flex justify-start" dir="rtl">
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm" style={{ backgroundColor: EK_BLUE, color: "white" }}>
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end" dir="rtl">
      <div
        className="max-w-[92%] rounded-2xl rounded-tr-sm px-3 py-2.5 text-sm text-white/80 space-y-0.5"
        style={{ backgroundColor: NAVY_MID, border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {renderContent(msg.content)}
        {msg.source_references && msg.source_references.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <p className="text-[10px] text-white/30 mb-1">מקורות:</p>
            <div className="flex flex-wrap gap-1">
              {msg.source_references.map((ref, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full text-white/50" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
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

// ── Quick chips ───────────────────────────────────────────────────────────────

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
  agentName?: string;
  agentIcon?: string;
  threadId?: string | null;
}

// ── FloatingChatWindow ────────────────────────────────────────────────────────

export function FloatingChatWindow({ isOpen, onClose, agentId, agentName, agentIcon, threadId }: Props) {
  const { messages, sending, loading, error, initialize, sendMessage } = useAgentChat(agentId, threadId);
  const [input, setInput]         = useState("");
  const [minimized, setMinimized] = useState(false);

  // ── Drag state ─────────────────────────────────────────────────────────────
  const [pos, setPos]         = useState<{ x: number; y: number } | null>(null);
  const dragging              = useRef(false);
  const dragOffset            = useRef({ x: 0, y: 0 });
  const panelRef              = useRef<HTMLDivElement>(null);
  const messagesEndRef        = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLTextAreaElement>(null);
  const hasInitialized        = useRef(false);

  // Initialize default position on first open (bottom-left with margin)
  useEffect(() => {
    if (isOpen && pos === null) {
      setPos({ x: 24, y: window.innerHeight - 580 });
    }
  }, [isOpen, pos]);

  useEffect(() => {
    if (isOpen && !hasInitialized.current) {
      hasInitialized.current = true;
      void initialize();
    }
  }, [isOpen, initialize]);

  useEffect(() => {
    if (isOpen && !minimized) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages, isOpen, minimized]);

  useEffect(() => {
    if (isOpen && !minimized) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen, minimized]);

  // ── Drag — document-level pointer listeners (reliable release on any target) ──

  function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!panelRef.current) return;
    dragging.current = true;
    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || !panelRef.current) return;
      const panelW = panelRef.current.offsetWidth;
      const panelH = panelRef.current.offsetHeight;
      const newX = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - panelW));
      const newY = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - panelH));
      setPos({ x: newX, y: newY });
    }
    function onUp() { dragging.current = false; }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // ── Send ───────────────────────────────────────────────────────────────────

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    await sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  }

  async function handleChip(chip: string) {
    if (sending) return;
    await sendMessage(chip);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const chips       = agentId ? AGENT_CHIPS : MASTER_CHIPS;
  const displayName = agentName ?? "מרכז הפיקוד";
  const displayIcon = agentIcon ?? "🤖";

  if (!isOpen || pos === null) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden select-none"
      style={{
        left:      pos.x,
        top:       pos.y,
        width:     "clamp(340px, 28vw, 500px)",
        maxHeight: "75vh",
        minHeight: minimized ? "auto" : "420px",
        backgroundColor: NAVY,
        border: `1px solid rgba(255,255,255,0.12)`,
        boxShadow: "0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
      }}
      dir="rtl"
    >
      {/* ── Drag handle / Header ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0 cursor-grab active:cursor-grabbing"
        style={{ borderBottom: minimized ? "none" : `1px solid rgba(255,255,255,0.08)`, backgroundColor: NAVY_MID }}
        onPointerDown={onHeaderPointerDown}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            onPointerDown={e => e.stopPropagation()}
            className="text-white/40 hover:text-white/80 transition-colors p-1 rounded"
          >
            <CloseIcon />
          </button>
          <button
            onClick={() => setMinimized(m => !m)}
            onPointerDown={e => e.stopPropagation()}
            className="text-white/40 hover:text-white/80 transition-colors p-1 rounded"
          >
            <MinimizeIcon />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="text-right">
            <p className="text-[10px] text-white/35 leading-none mb-0.5">שיחה עם</p>
            <h3 className="text-sm font-bold text-white leading-none">{displayName}</h3>
          </div>
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ backgroundColor: `${EK_BLUE}33`, border: `1px solid ${EK_BLUE}50` }}
          >
            {displayIcon}
          </div>
        </div>
      </div>

      {/* ── Collapsed state ──────────────────────────────────────────────── */}
      {minimized && (
        <button
          className="w-full py-2 text-xs text-white/40 hover:text-white/70 transition-colors"
          onClick={() => setMinimized(false)}
        >
          לחץ לפתיחה
        </button>
      )}

      {/* ── Messages area ────────────────────────────────────────────────── */}
      {!minimized && (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ minHeight: 0 }}>
            {loading && messages.length === 0 && (
              <div className="flex items-center justify-center py-6 gap-2 text-white/30 text-sm">
                <SpinnerIcon /> טוען שיחה...
              </div>
            )}

            {!loading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-2" style={{ backgroundColor: `${EK_BLUE}20` }}>
                  {displayIcon}
                </div>
                <p className="text-sm font-semibold text-white/55 mb-0.5">{displayName}</p>
                <p className="text-xs text-white/30 max-w-[180px] leading-relaxed">
                  שאל על מצב העסק, חריגות, אישורים, חיוב, ועוד.
                </p>
              </div>
            )}

            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

            {sending && (
              <div className="flex justify-end">
                <div className="flex items-center gap-2 px-3 py-2 rounded-2xl rounded-tr-sm text-sm text-white/40" style={{ backgroundColor: NAVY_MID, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <SpinnerIcon /> מחשב...
                </div>
              </div>
            )}

            {error && <div className="text-xs text-red-400 text-center py-1">{error}</div>}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Quick chips ─────────────────────────────────────────────── */}
          {messages.length === 0 && !loading && (
            <div className="px-3 pb-2 shrink-0" style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }}>
              <p className="text-[10px] text-white/30 mb-1.5 pt-2">שאלות מהירות:</p>
              <div className="flex flex-wrap gap-1">
                {chips.map(chip => (
                  <button
                    key={chip}
                    onClick={() => void handleChip(chip)}
                    disabled={sending}
                    className="text-[11px] px-2 py-1 rounded-full text-white/55 transition-colors hover:text-white/80 disabled:opacity-40"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Input ──────────────────────────────────────────────────── */}
          <div className="px-3 py-2.5 shrink-0" style={{ borderTop: `1px solid rgba(255,255,255,0.08)` }}>
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
                className="flex-1 bg-transparent text-sm text-white placeholder-white/30 resize-none outline-none leading-relaxed min-h-[22px] max-h-[72px]"
                style={{ direction: "rtl" }}
              />
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || sending}
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{ backgroundColor: input.trim() && !sending ? EK_BLUE : "rgba(255,255,255,0.07)", color: "white" }}
              >
                {sending ? <SpinnerIcon /> : <SendIcon />}
              </button>
            </div>
            <p className="text-[10px] text-white/20 text-center mt-1">Enter לשליחה · Shift+Enter לשורה חדשה</p>
          </div>
        </>
      )}
    </div>
  );
}
