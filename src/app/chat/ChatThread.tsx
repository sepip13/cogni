"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage, Conversation } from "@/hooks/useChatStore";

interface ChatThreadProps {
  conversation: Conversation | null;
  streaming: boolean;
  streamingContent: string;
  error: string;
  selectedModelLabel: string;
  onSend: (text: string) => void;
  onToggleHistory?: () => void;
  onToggleModels?: () => void;
}

const SUGGESTIONS = [
  "Explain a concept",
  "Help me debug code",
  "Draft an email",
  "Summarize a topic",
];

export function ChatThread({
  conversation,
  streaming,
  streamingContent,
  error,
  selectedModelLabel,
  onSend,
  onToggleHistory,
  onToggleModels,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasModel = selectedModelLabel.trim() !== "";
  const messages = conversation?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent, streaming]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      <ThreadHeader
        label={selectedModelLabel}
        onToggleHistory={onToggleHistory}
        onToggleModels={onToggleModels}
      />

      <div
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: "20px 20px 8px",
        }}
      >
        {messages.length === 0 && !streaming ? (
          <EmptyState hasModel={hasModel} modelLabel={selectedModelLabel} onPick={onSend} />
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}

        {streaming && <StreamingBubble content={streamingContent} />}

        {error && (
          <div
            role="alert"
            style={{
              background: "rgba(255,107,107,0.1)",
              border: "1px solid rgba(255,107,107,0.3)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--high)",
            }}
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <InputBar disabled={streaming || !hasModel} streaming={streaming} onSend={onSend} />
    </div>
  );
}

const headerBtnStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  padding: "7px 11px",
  flexShrink: 0,
};

function ThreadHeader({
  label,
  onToggleHistory,
  onToggleModels,
}: {
  label: string;
  onToggleHistory?: () => void;
  onToggleModels?: () => void;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 20px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button
        className="chat-pane-toggle"
        onClick={onToggleHistory}
        aria-label="Show conversation history"
        style={headerBtnStyle}
      >
        ☰
      </button>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Chat</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label || "No model selected"}
        </div>
      </div>

      <button
        className="chat-pane-toggle"
        onClick={onToggleModels}
        aria-label="Show model picker"
        style={headerBtnStyle}
      >
        ▦ Models
      </button>
    </div>
  );
}

function EmptyState({
  hasModel,
  modelLabel,
  onPick,
}: {
  hasModel: boolean;
  modelLabel: string;
  onPick: (text: string) => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 20,
        padding: "20px",
      }}
    >
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
          {hasModel ? `Chat with ${modelLabel}` : "Pick a model to begin"}
        </div>
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
          {hasModel
            ? "Ask anything. Your history stays in this browser."
            : "Choose a model from the sidebar to start a conversation."}
        </p>
      </div>

      {hasModel && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            width: "100%",
            maxWidth: 420,
          }}
        >
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="hover-text"
              style={{
                padding: "12px 14px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 13,
                color: "var(--text-dim)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all var(--duration-fast)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "82%",
          padding: "12px 16px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser ? "var(--accent)" : "var(--surface)",
          border: isUser ? "none" : "1px solid var(--border)",
          color: isUser ? "#fff" : "var(--text)",
          fontSize: 14,
          lineHeight: 1.6,
          wordBreak: "break-word",
        }}
      >
        {isUser ? (
          <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
        ) : (
          <div className="chat-markdown">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingBubble({ content }: { content: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          maxWidth: "82%",
          padding: "12px 16px",
          borderRadius: "16px 16px 16px 4px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          fontSize: 14,
          lineHeight: 1.6,
          wordBreak: "break-word",
        }}
      >
        {content === "" ? (
          <ThinkingDots />
        ) : (
          <div className="chat-markdown">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span
      aria-label="Assistant is thinking"
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {[0, 200, 400].map((delay) => (
        <span
          key={delay}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--accent)",
            animation: "thinkDot 1.4s infinite",
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </span>
  );
}

function InputBar({
  disabled,
  streaming,
  onSend,
}: {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");

  function submit() {
    const text = input.trim();
    if (!text || streaming) return;
    onSend(text);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = !streaming && input.trim() !== "";

  return (
    <div style={{ flexShrink: 0, padding: "8px 20px 20px" }}>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "12px 16px",
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
          rows={1}
          disabled={disabled}
          aria-label="Chat input"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 14,
            color: "var(--text)",
            fontFamily: "inherit",
            resize: "none",
            lineHeight: 1.5,
            maxHeight: 120,
            overflowY: "auto",
          }}
        />
        <button
          onClick={submit}
          disabled={!canSend}
          aria-label="Send message"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: canSend
              ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
              : "var(--surface-2)",
            color: canSend ? "var(--bg)" : "var(--text-faint)",
            border: "none",
            cursor: canSend ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
            transition: "all var(--duration-fast)",
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
