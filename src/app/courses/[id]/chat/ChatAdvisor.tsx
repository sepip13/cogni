"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatAdvisor({ courseId }: { courseId: string }) {
  const [courseName, setCourseName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch course name for breadcrumb
  useEffect(() => {
    fetch(`/api/courses/${courseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCourseName(d.name); });
  }, [courseId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput("");
    setError("");
    setStreaming(true);

    // Add placeholder assistant message that we'll stream into
    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...updatedHistory, assistantMsg]);

    try {
      const res = await fetch(`/api/courses/${courseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          // Send only prior exchanges (not the current user msg we just appended)
          history: messages,
        }),
      });

      if (!res.ok || !res.body) {
        setError("Chat request failed. Please try again.");
        // Remove the empty assistant placeholder
        setMessages(updatedHistory);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages([
          ...updatedHistory,
          { role: "assistant", content: accumulated },
        ]);
      }
    } catch {
      setError("Network error — please try again.");
      setMessages(updatedHistory);
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const STARTERS = [
    "What should I focus on first?",
    "Which topics are most likely to be on the exam?",
    "Give me a quick overview of the highest-priority topics.",
    "How should I split my study time over the next 3 days?",
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 80px)",
        maxWidth: 760,
        margin: "0 auto",
      }}
    >
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-dim)", marginBottom: 20, flexShrink: 0 }}
      >
        <Link href="/dashboard" style={{ color: "var(--text-dim)" }}>My courses</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <Link href={`/courses/${courseId}`} style={{ color: "var(--text-dim)" }}>{courseName || "Course"}</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <span style={{ color: "var(--text)" }} aria-current="page">Cogni advisor</span>
      </nav>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 800,
            color: "#0a0e1a",
          }}
          aria-hidden="true"
        >
          C
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Cogni advisor</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Scoped to {courseName || "your course"} · cites your materials
          </div>
        </div>
      </div>

      {/* Message area */}
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
          paddingBottom: 16,
        }}
      >
        {messages.length === 0 && (
          <div style={{ paddingTop: 20 }}>
            <p style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 16, textAlign: "center" }}>
              Ask anything about {courseName || "your course"}.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  disabled={streaming}
                  style={{
                    padding: "12px 14px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 13,
                    color: "var(--text-dim)",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
                    (e.currentTarget as HTMLElement).style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-dim)";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "82%",
                padding: "12px 16px",
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: msg.role === "user" ? "var(--accent)" : "var(--surface)",
                border: msg.role === "user" ? "none" : "1px solid var(--border)",
                color: msg.role === "user" ? "#fff" : "var(--text)",
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.content}
              {streaming && i === messages.length - 1 && msg.role === "assistant" && msg.content === "" && (
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 14,
                    background: "var(--accent)",
                    borderRadius: 2,
                    animation: "pulse 1s infinite",
                    verticalAlign: "middle",
                  }}
                  aria-label="Cogni is typing"
                />
              )}
            </div>
          </div>
        ))}

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

      {/* Input bar */}
      <div
        style={{
          flexShrink: 0,
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
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
          rows={1}
          disabled={streaming}
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
          aria-label="Chat input"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={streaming || !input.trim()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background:
              streaming || !input.trim()
                ? "var(--surface-2)"
                : "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: streaming || !input.trim() ? "var(--text-faint)" : "#0a0e1a",
            border: "none",
            cursor: streaming || !input.trim() ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
            transition: "all 0.15s",
          }}
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
