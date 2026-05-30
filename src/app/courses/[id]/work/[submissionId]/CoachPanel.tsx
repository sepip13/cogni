"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "What's the single biggest thing holding back my score?",
  "Help me close the top gap from the review.",
  "How would you rewrite my weakest section?",
];

export function CoachPanel({
  courseId,
  submissionId,
  actionItems,
}: {
  courseId: string;
  submissionId: string;
  actionItems: string[];
}) {
  // Parent remounts this panel (via key) when a fresh review changes the
  // action items, so the checklist initializes cleanly from props here.
  const [checked, setChecked] = useState<boolean[]>(() => actionItems.map(() => false));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function toggle(i: number) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: text.trim(), id: crypto.randomUUID() };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setError("");
    setStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "", id: crypto.randomUUID() };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch(`/api/courses/${courseId}/submissions/${submissionId}/coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });
      if (!res.ok || !res.body) {
        setError("Coach request failed. Please try again.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m))
        );
      }
    } catch {
      setError("Network error — please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setStreaming(false);
    }
  }

  const completedCount = checked.filter(Boolean).length;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Coach me to 10/10</h3>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18 }}>
        Work through the action items, then ask the coach for help on any of them.
      </p>

      {actionItems.length > 0 ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)" }}>
              Action items
            </span>
            <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-jetbrains), monospace" }}>
              {completedCount}/{actionItems.length} done
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {actionItems.map((item, i) => (
              <label
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked[i] ?? false}
                  onChange={() => toggle(i)}
                  style={{ marginTop: 2, accentColor: "var(--accent)", width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
                />
                <span
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: checked[i] ? "var(--text-faint)" : "var(--text)",
                    textDecoration: checked[i] ? "line-through" : "none",
                  }}
                >
                  {item}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 18 }}>
          Run a rubric review to get a personalized action list.
        </p>
      )}

      {/* Coach chat */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div className="fade-up-stagger" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                disabled={streaming}
                className="hover-text"
                style={{
                  padding: "10px 14px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "var(--text-dim)",
                  textAlign: "left",
                  cursor: "pointer",
                  lineHeight: 1.4,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "88%",
                padding: "11px 15px",
                borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: msg.role === "user" ? "var(--accent)" : "var(--surface-2)",
                color: msg.role === "user" ? "#fff" : "var(--text)",
                fontSize: 14,
                lineHeight: 1.6,
                wordBreak: "break-word",
              }}
            >
              {streaming && i === messages.length - 1 && msg.role === "assistant" && msg.content === "" ? (
                <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Coach is thinking…</span>
              ) : msg.role === "assistant" ? (
                <div className="chat-markdown">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {error && (
          <div role="alert" style={{ fontSize: 13, color: "var(--high)" }}>
            {error}
          </div>
        )}
        <div ref={bottomRef} />

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask the coach… (Enter to send)"
            rows={1}
            disabled={streaming}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              fontSize: 14,
              color: "var(--text)",
              fontFamily: "inherit",
              resize: "none",
              outline: "none",
              maxHeight: 120,
            }}
            aria-label="Ask the coach"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={streaming || !input.trim()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: streaming || !input.trim() ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: streaming || !input.trim() ? "var(--text-faint)" : "var(--bg)",
              border: "none",
              cursor: streaming || !input.trim() ? "default" : "pointer",
              fontSize: 16,
              flexShrink: 0,
            }}
            aria-label="Send to coach"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
