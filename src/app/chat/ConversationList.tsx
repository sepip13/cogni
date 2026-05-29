"use client";

import { useState } from "react";
import type { Conversation } from "@/hooks/useChatStore";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

// Relative time using the platform Intl API — no external date library.
// `now` is captured once at mount by the caller so render stays pure.
function relativeTime(ts: number, now: number): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const seconds = Math.round((ts - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(months, "month");
  return rtf.format(Math.round(months / 12), "year");
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNew,
}: ConversationListProps) {
  // Capture "now" once at mount so relativeTime() stays pure during render.
  const [now] = useState(() => Date.now());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        onClick={onNew}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "9px 12px",
          borderRadius: 8,
          border: "1px solid var(--border-strong)",
          background: "var(--surface)",
          color: "var(--text)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "border-color var(--duration-fast)",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>
          +
        </span>
        New chat
      </button>

      {conversations.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)", padding: "4px 4px", margin: 0 }}>
          No conversations yet. Start one above.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {conversations.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              active={c.id === activeId}
              now={now}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ConversationRowProps {
  conversation: Conversation;
  active: boolean;
  now: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function ConversationRow({ conversation, active, now, onSelect, onDelete }: ConversationRowProps) {
  return (
    <li
      className="chat-hover-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 8,
        background: active ? "var(--accent-soft)" : "transparent",
        transition: "background var(--duration-fast)",
      }}
    >
      <button
        onClick={() => onSelect(conversation.id)}
        aria-current={active ? "true" : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "8px 4px 8px 10px",
          color: "inherit",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {conversation.title}
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            fontSize: 11,
            color: "var(--text-faint)",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{conversation.modelLabel}</span>
          <span aria-hidden="true">·</span>
          <span style={{ flexShrink: 0 }}>{relativeTime(conversation.updatedAt, now)}</span>
        </div>
      </button>

      <button
        className="chat-hover-action"
        onClick={() => onDelete(conversation.id)}
        aria-label={`Delete conversation: ${conversation.title}`}
        style={{
          flexShrink: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-faint)",
          fontSize: 16,
          lineHeight: 1,
          padding: "4px 8px",
        }}
      >
        ×
      </button>
    </li>
  );
}
