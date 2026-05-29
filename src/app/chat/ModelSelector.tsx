"use client";

import { useMemo, useState } from "react";

export interface Model {
  id: string;
  modelId: string;
  label: string;
  desc: string;
  bestFor: string;
  category: string;
  provider: string;
  tier: string;
}

interface ModelSelectorProps {
  models: Model[];
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
  favorites: string[];
  onToggleFavorite: (modelId: string) => void;
}

const searchStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--text)",
  outline: "none",
  fontFamily: "inherit",
};

function groupByCategory(models: Model[]): Array<[string, Model[]]> {
  const map = new Map<string, Model[]>();
  for (const m of models) {
    const list = map.get(m.category) ?? [];
    map.set(m.category, [...list, m]);
  }
  return [...map.entries()];
}

export function ModelSelector({
  models,
  selectedModelId,
  onSelect,
  favorites,
  onToggleFavorite,
}: ModelSelectorProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) =>
      `${m.label} ${m.provider} ${m.bestFor}`.toLowerCase().includes(q)
    );
  }, [models, query]);

  const favoriteModels = useMemo(
    () => filtered.filter((m) => favorites.includes(m.modelId)),
    [filtered, favorites]
  );

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search models…"
        aria-label="Search models"
        style={searchStyle}
      />

      <Section title="Favorites">
        {favoriteModels.length === 0 ? (
          <EmptyHint text="Star a model to pin it here." />
        ) : (
          favoriteModels.map((m) => (
            <ModelRow
              key={`fav-${m.modelId}`}
              model={m}
              selected={m.modelId === selectedModelId}
              isFavorite
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
            />
          ))
        )}
      </Section>

      {grouped.map(([category, list]) => (
        <Section key={category} title={category}>
          {list.map((m) => (
            <ModelRow
              key={m.modelId}
              model={m}
              selected={m.modelId === selectedModelId}
              isFavorite={favorites.includes(m.modelId)}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </Section>
      ))}

      {filtered.length === 0 && <EmptyHint text="No models match your search." />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-faint)",
          margin: "0 0 6px 4px",
        }}
      >
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p style={{ fontSize: 12, color: "var(--text-faint)", padding: "4px 4px 2px", margin: 0 }}>
      {text}
    </p>
  );
}

interface ModelRowProps {
  model: Model;
  selected: boolean;
  isFavorite: boolean;
  onSelect: (modelId: string) => void;
  onToggleFavorite: (modelId: string) => void;
}

function ModelRow({ model, selected, isFavorite, onSelect, onToggleFavorite }: ModelRowProps) {
  return (
    <div
      className="chat-hover-row"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        padding: "8px 8px 8px 10px",
        borderRadius: 8,
        borderLeft: `2px solid ${selected ? "var(--accent)" : "transparent"}`,
        background: selected ? "var(--accent-soft)" : "transparent",
        transition: "background var(--duration-fast)",
      }}
    >
      <button
        onClick={() => onSelect(model.modelId)}
        aria-pressed={selected}
        aria-label={`Select ${model.label}`}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: "inherit",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: selected ? "var(--text)" : "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {model.label}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-dim)",
              background: "var(--surface-2)",
              borderRadius: 4,
              padding: "1px 6px",
            }}
          >
            {model.provider}
          </span>
        </div>
        {model.bestFor && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-dim)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {model.bestFor}
          </div>
        )}
      </button>

      <button
        className="chat-hover-action"
        onClick={() => onToggleFavorite(model.modelId)}
        aria-label={isFavorite ? `Unstar ${model.label}` : `Star ${model.label}`}
        aria-pressed={isFavorite}
        style={{
          flexShrink: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 15,
          lineHeight: 1,
          padding: "2px 4px",
          color: isFavorite ? "var(--med)" : "var(--text-faint)",
          opacity: isFavorite ? 1 : undefined,
        }}
      >
        {isFavorite ? "★" : "☆"}
      </button>
    </div>
  );
}
