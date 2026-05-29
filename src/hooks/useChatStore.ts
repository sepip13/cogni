"use client";

import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Client-only chat persistence. Everything lives in localStorage — the server
// never stores conversations or favorites.
// ---------------------------------------------------------------------------

const FAVORITES_KEY = "cogni:chat:favorites";
const HISTORY_KEY = "cogni:chat:history";
const MAX_CONVERSATIONS = 50;
const TITLE_MAX_CHARS = 60;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  modelId: string;
  modelLabel: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// --- SSR-safe localStorage helpers (never throw) ---------------------------

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private-mode — fail silently, state stays in memory.
  }
}

// --- useFavorites ----------------------------------------------------------

interface UseFavorites {
  favorites: string[];
  toggle: (modelId: string) => void;
  isFavorite: (modelId: string) => boolean;
}

export function useFavorites(): UseFavorites {
  const [favorites, setFavorites] = useState<string[]>([]);

  // Hydrate from localStorage after mount. Both server and first client paint
  // render [] (no mismatch), then we load the stored value. Setting state in
  // this effect is the intended SSR-safe pattern here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(readJSON<string[]>(FAVORITES_KEY, []));
  }, []);

  const toggle = useCallback((modelId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(modelId)
        ? prev.filter((m) => m !== modelId)
        : [...prev, modelId];
      writeJSON(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (modelId: string) => favorites.includes(modelId),
    [favorites]
  );

  return { favorites, toggle, isFavorite };
}

// --- useChatHistory --------------------------------------------------------

interface UseChatHistory {
  conversations: Conversation[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  createConversation: (modelId: string, modelLabel: string) => Conversation;
  appendMessage: (convId: string, msg: ChatMessage) => void;
  deleteConversation: (convId: string) => void;
  clearAll: () => void;
}

function sortByUpdated(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

function deriveTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  return trimmed.length <= TITLE_MAX_CHARS
    ? trimmed
    : `${trimmed.slice(0, TITLE_MAX_CHARS)}…`;
}

export function useChatHistory(): UseChatHistory {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Hydrate from localStorage after mount (SSR-safe — see useFavorites note).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(sortByUpdated(readJSON<Conversation[]>(HISTORY_KEY, [])));
  }, []);

  // Sort (newest first), cap at MAX_CONVERSATIONS, persist, return the result.
  const commit = useCallback((list: Conversation[]): Conversation[] => {
    const next = sortByUpdated(list).slice(0, MAX_CONVERSATIONS);
    writeJSON(HISTORY_KEY, next);
    return next;
  }, []);

  const createConversation = useCallback(
    (modelId: string, modelLabel: string): Conversation => {
      const now = Date.now();
      const convo: Conversation = {
        id: crypto.randomUUID(),
        modelId,
        modelLabel,
        title: "New chat",
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      setConversations((prev) => commit([convo, ...prev]));
      return convo;
    },
    [commit]
  );

  const appendMessage = useCallback(
    (convId: string, msg: ChatMessage) => {
      setConversations((prev) =>
        commit(
          prev.map((c) => {
            if (c.id !== convId) return c;
            const isFirstUserMessage =
              msg.role === "user" && !c.messages.some((m) => m.role === "user");
            return {
              ...c,
              messages: [...c.messages, msg],
              title: isFirstUserMessage ? deriveTitle(msg.content) : c.title,
              updatedAt: Date.now(),
            };
          })
        )
      );
    },
    [commit]
  );

  const deleteConversation = useCallback(
    (convId: string) => {
      setConversations((prev) => commit(prev.filter((c) => c.id !== convId)));
      setActiveId((cur) => (cur === convId ? null : cur));
    },
    [commit]
  );

  const clearAll = useCallback(() => {
    writeJSON(HISTORY_KEY, []);
    setConversations([]);
    setActiveId(null);
  }, []);

  return {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    appendMessage,
    deleteConversation,
    clearAll,
  };
}
