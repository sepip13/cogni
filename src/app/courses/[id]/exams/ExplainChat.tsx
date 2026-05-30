"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const AUTO_PROMPT = "Explain this question and what I need to know to answer it.";

export function ExplainChat({
  courseId,
  trialId,
  qIndex,
}: {
  courseId: string;
  trialId: string;
  qIndex: number;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const base = `/api/courses/${courseId}/exams/trials/${trialId}/questions/${qIndex}/explain`;

  useEffect(() => {
    fetch(base)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { messages: { id: string; role: string; content: string }[] }) => {
        if (d.messages.length > 0) {
          setMessages(d.messages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })));
        } else if (!startedRef.current) {
          startedRef.current = true;
          send(AUTO_PROMPT);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const userMsg: Msg = { role: "user", content: text.trim(), id: crypto.randomUUID() };
    const assistantMsg: Msg = { role: "assistant", content: "", id: crypto.randomUUID() };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setError("");
    setStreaming(true);

    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });
      if (!res.ok || !res.body) {
        setError("The tutor request failed. Please try again.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m)));
      }
    } catch {
      setError("Network error — please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto", marginBottom: 10 }}>
        {messages.map((msg, i) => (
          <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "88%",
                padding: "10px 14px",
                borderRadius: msg.role === "user" ? "13px 13px 4px 13px" : "13px 13px 13px 4px",
                background: msg.role === "user" ? "var(--accent)" : "var(--surface-2)",
                color: msg.role === "user" ? "#fff" : "var(--text)",
                fontSize: 13.5,
                lineHeight: 1.6,
                wordBreak: "break-word",
              }}
            >
              {streaming && i === messages.length - 1 && msg.role === "assistant" && msg.content === "" ? (
                <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Tutor is thinking…</span>
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
        {error && <div role="alert" style={{ fontSize: 13, color: "var(--high)" }}>{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask a follow-up…"
          rows={1}
          disabled={streaming}
          style={{ flex: 1, padding: "9px 12px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 9, fontSize: 13.5, color: "var(--text)", fontFamily: "inherit", resize: "none", outline: "none", maxHeight: 100 }}
          aria-label="Ask the tutor a follow-up"
        />
        <button
          onClick={() => send(input)}
          disabled={streaming || !input.trim()}
          style={{ width: 36, height: 36, borderRadius: 9, background: streaming || !input.trim() ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))", color: streaming || !input.trim() ? "var(--text-faint)" : "var(--bg)", border: "none", cursor: streaming || !input.trim() ? "default" : "pointer", fontSize: 16, flexShrink: 0 }}
          aria-label="Send"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
