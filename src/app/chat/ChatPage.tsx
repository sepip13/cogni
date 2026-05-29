"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFavorites, useChatHistory, type ChatMessage } from "@/hooks/useChatStore";
import { ModelSelector, type Model } from "./ModelSelector";
import { ConversationList } from "./ConversationList";
import { ChatThread } from "./ChatThread";

const NOTICE_MS = 3000;

async function readStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (acc: string) => void
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
    onChunk(acc);
  }
  const tail = decoder.decode(); // flush any trailing multi-byte sequence
  if (tail) {
    acc += tail;
    onChunk(acc);
  }
  return acc;
}

export function ChatPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { favorites, toggle } = useFavorites();
  const {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    appendMessage,
    deleteConversation,
  } = useChatHistory();

  // Load the model catalogue once.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load models"))))
      .then((data: Model[]) => {
        if (!cancelled) setModels(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load models. Refresh to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-dismiss the transient notice.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  // Default to the first model until the user explicitly picks one. Deriving
  // this (instead of writing state in an effect) keeps the page usable on load
  // without triggering a cascading render.
  const effectiveModelId = selectedModelId ?? models[0]?.modelId ?? null;
  const selectedModel = useMemo(
    () => models.find((m) => m.modelId === effectiveModelId) ?? null,
    [models, effectiveModelId]
  );
  const selectedModelLabel = selectedModel?.label ?? "";

  const handleSelectModel = useCallback(
    (modelId: string) => {
      if (modelId === effectiveModelId) return;
      setSelectedModelId(modelId);
      setSidebarOpen(false);
      if (activeId) {
        // Don't mix models in one thread — start fresh.
        setActiveId(null);
        const label = models.find((m) => m.modelId === modelId)?.label ?? "this model";
        setNotice(`Starting a new conversation with ${label}.`);
      }
    },
    [effectiveModelId, activeId, models, setActiveId]
  );

  const handleNewChat = useCallback(() => {
    setActiveId(null);
    setError("");
    setSidebarOpen(false);
  }, [setActiveId]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (streaming) return; // never abort mid-stream
      setActiveId(id);
      const convo = conversations.find((c) => c.id === id);
      if (convo) setSelectedModelId(convo.modelId);
      setError("");
      setSidebarOpen(false);
    },
    [streaming, conversations, setActiveId]
  );

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      if (!selectedModel) {
        setError("Pick a model from the sidebar first.");
        return;
      }

      let convId = activeId;
      const priorMessages = convId ? activeConversation?.messages ?? [] : [];
      if (!convId) {
        const convo = createConversation(selectedModel.modelId, selectedModel.label);
        convId = convo.id;
        setActiveId(convo.id);
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };
      appendMessage(convId, userMsg);

      setError("");
      setStreaming(true);
      setStreamingContent("");

      const outgoing = [...priorMessages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: outgoing, modelId: selectedModel.modelId }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Chat request failed. Please try again.");
          return;
        }

        const full = await readStream(res.body, setStreamingContent);
        if (full.trim()) {
          appendMessage(convId, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: full,
            createdAt: Date.now(),
          });
        }
      } catch {
        setError("Network error — please try again.");
      } finally {
        setStreaming(false);
        setStreamingContent("");
      }
    },
    [streaming, selectedModel, activeId, activeConversation, createConversation, appendMessage, setActiveId]
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)", overflow: "hidden", position: "relative" }}>
      {sidebarOpen && (
        <div className="chat-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <aside className={`chat-sidebar${sidebarOpen ? " open" : ""}`} aria-label="Models and conversations">
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16 }}>
          <ModelSelector
            models={models}
            selectedModelId={effectiveModelId}
            onSelect={handleSelectModel}
            favorites={favorites}
            onToggleFavorite={toggle}
          />
          <div style={{ height: 1, background: "var(--border)" }} aria-hidden="true" />
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelectConversation}
            onDelete={deleteConversation}
            onNew={handleNewChat}
          />
        </div>
      </aside>

      <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {notice && (
          <div
            role="status"
            style={{
              flexShrink: 0,
              margin: "10px 20px 0",
              padding: "8px 14px",
              fontSize: 12,
              color: "var(--accent-2)",
              background: "var(--accent-soft)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
            }}
          >
            {notice}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>
          <ChatThread
            conversation={activeConversation}
            streaming={streaming}
            streamingContent={streamingContent}
            error={error}
            selectedModelLabel={selectedModelLabel}
            onSend={handleSend}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
          />
        </div>
      </section>
    </div>
  );
}
